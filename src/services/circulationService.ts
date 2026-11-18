import { supabase } from '@/lib/supabase'
import type {
  Annotation,
  Archive,
  ArchiveSearchFilters,
  AvalEtape,
  AvisAval,
  Circulation,
  CirculationEvent,
  CirculationStatus,
  CreateDocumentInput,
  DemandeDoc,
  DemandeDocStatus,
  DocumentReportFilters,
  DocumentReportRow,
  EmplacementSecretariat,
  FinancialAvalSignataire,
  FinancialReportRow,
  GedAgent,
  GlobalDashboardData,
  GedMessage,
  MessagerieSec,
  OrientDocumentInput,
  ParcoursType,
  Profile,
  ProfileActivityStats,
  ArchiveReportRow,
  SecretariatDesk,
} from '@/types/ged'
import {
  AVIS_AVAL_LABELS,
  isDocumentFinancier,
  PARCOURS_LABELS,
  STATUS_LABELS,
} from '@/types/ged'
import { fileExtension, typeDocFromFileName } from '@/lib/documentFiles'
import {
  avalChainFor,
  findAuthority,
  type AvalRoleKey,
} from '@/modules/ged/avalAuthorities'
import { archiveMinAgeDate, PURGE_MIN_AGE_YEARS } from '@/modules/ged/lib/archivePrivileges'
import { resolveCcMatrs, resolveCcUsers } from '@/modules/ged/workflowRules'

const CIRCULATION_SELECT = `
  *,
  archive:tb_archives(*),
  sender:tb_profiles!tb_circulations_sender_id_fkey(*),
  receiver:tb_profiles!tb_circulations_receiver_id_fkey(*),
  approver:tb_profiles!tb_circulations_approver_id_fkey(*)
`

export type CreateProgressStep =
  | 'upload'
  | 'archive'
  | 'circulation'
  | 'done'
  | 'error'

export type CreateProgressFn = (
  pct: number,
  step: CreateProgressStep,
  label: string,
) => void

async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('tb_profiles')
    .select('*, direction:tb_directions(*), service:tb_services(*)')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data as Profile
}

/** Filtre PostgREST : courriers envoyés / reçus / orientés (handler) / en CC */
function personalCirculationOrFilter(profile: Profile): string {
  const parts = [
    `sender_id.eq.${profile.id}`,
    `receiver_id.eq.${profile.id}`,
    `handler_id.eq.${profile.id}`,
    `cc_users.cs.{${profile.id}}`,
  ]
  if (profile.matr) {
    parts.push(`sender_matr.eq.${profile.matr}`)
    parts.push(`receiver_matr.eq.${profile.matr}`)
    parts.push(`cc_matrs.cs.{${profile.matr}}`)
  }
  return parts.join(',')
}

/** Périmètre rapport financier : circuit personnel + dossiers en attente d’aval */
function personalFinancialOrFilter(profile: Profile): string {
  const parts = personalCirculationOrFilter(profile).split(',')
  parts.push(`approver_id.eq.${profile.id}`)
  if (profile.matr) {
    parts.push(`approver_matr.eq.${profile.matr}`)
  }
  return parts.join(',')
}

function formatAvalChain(signataires: FinancialAvalSignataire[]): string {
  if (signataires.length === 0) return '—'
  return signataires
    .map((s) => {
      if (s.avis && s.actor_full_name) {
        return `${s.role_label} : ${s.actor_full_name} (${AVIS_AVAL_LABELS[s.avis]})`
      }
      if (s.avis) {
        return `${s.role_label} : ${AVIS_AVAL_LABELS[s.avis]}`
      }
      return `${s.role_label} : en attente`
    })
    .join(' → ')
}

/** Déduit le MIME d’une photo base64 (JPEG / PNG / GIF / WebP) */
function personnelPhotoToDataUrl(base64: string): string | null {
  const clean = base64.replace(/\s/g, '')
  if (!clean) return null
  let mime = 'image/jpeg'
  try {
    const head = atob(clean.slice(0, 24))
    const b0 = head.charCodeAt(0)
    const b1 = head.charCodeAt(1)
    const b2 = head.charCodeAt(2)
    const b3 = head.charCodeAt(3)
    if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) {
      mime = 'image/png'
    } else if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) {
      mime = 'image/gif'
    } else if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) {
      mime = 'image/webp'
    } else if (b0 === 0xff && b1 === 0xd8) {
      mime = 'image/jpeg'
    }
  } catch {
    /* conserve jpeg par défaut */
  }
  return `data:${mime};base64,${clean}`
}

async function logEvent(
  circulationId: string,
  actorId: string,
  eventType: string,
  label: string,
  metadata: Record<string, unknown> = {},
  actorMatr?: string | null,
) {
  await supabase.from('tb_circulation_events').insert({
    circulation_id: circulationId,
    actor_id: actorId,
    actor_matr: actorMatr ?? null,
    event_type: eventType,
    label,
    metadata,
  })
}

export const circulationService = {
  async getCurrentProfile(): Promise<Profile | null> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return null
    return getProfile(auth.user.id)
  },

  /**
   * Photo RH (TbPersonnels.Photo) pour un matricule → data URL affichable.
   */
  async getPersonnelPhotoDataUrl(matr: string | null | undefined): Promise<string | null> {
    const m = matr?.trim()
    if (!m) return null
    const { data, error } = await supabase.rpc('ged_get_personnel_photo', {
      p_matr: m,
    })
    if (error) throw error
    const b64 = typeof data === 'string' ? data.trim() : ''
    if (!b64) return null
    return personnelPhotoToDataUrl(b64)
  },

  async listDirections() {
    const { data, error } = await supabase
      .from('tb_directions')
      .select('*')
      .order('libelle')
    if (error) throw error
    return data ?? []
  },

  async listSecretariatDesks(): Promise<SecretariatDesk[]> {
    const { data, error } = await supabase
      .from('tb_secretariat_desks')
      .select('*')
      .eq('actif', true)
      .order('sort_order')
    if (error) throw error
    return (data ?? []) as SecretariatDesk[]
  },

  /** Résout le bureau Sec_* pour une direction destinataire */
  async resolveSecretariatDesk(
    directionId: string | null | undefined,
    preferredCode?: string | null,
  ): Promise<string | null> {
    if (preferredCode?.trim()) return preferredCode.trim()
    if (!directionId) return null
    const { data, error } = await supabase
      .from('tb_secretariat_desks')
      .select('code')
      .eq('direction_id', directionId)
      .eq('actif', true)
      .order('sort_order')
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (data?.code) return data.code as string

    // Secrétariat profil lié à la direction
    const { data: prof } = await supabase
      .from('tb_profiles')
      .select('secretariat_code')
      .eq('role', 'secretariat')
      .eq('direction_id', directionId)
      .not('secretariat_code', 'is', null)
      .limit(1)
      .maybeSingle()
    return (prof?.secretariat_code as string | null) ?? null
  },

  async listServices(directionId?: string) {
    let query = supabase.from('tb_services').select('*').order('libelle')
    if (directionId) query = query.eq('direction_id', directionId)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  /** Agents actifs (Actif = true / 1) depuis TbPersonnels */
  async listAgents(filters?: {
    directionId?: string
    directionLibelle?: string
    serviceId?: string
    entite?: string
  }): Promise<GedAgent[]> {
    const { data, error } = await supabase.rpc('ged_list_agents', {
      p_direction: filters?.directionLibelle ?? filters?.directionId ?? null,
      p_service: filters?.serviceId ?? null,
      p_entite: filters?.entite?.trim() || null,
    })
    if (error) throw error

    const isActif = (a: GedAgent) => {
      const v = a.actif as unknown
      return v === true || v === 1 || v === '1' || v === 'true' || v === 't'
    }

    let agents = ((data ?? []) as GedAgent[]).filter(isActif)

    // Filtre direction (secours si le RPC a renvoyé trop large)
    if (filters?.directionId || filters?.directionLibelle) {
      const byId = filters.directionId
        ? agents.filter((a) => a.direction_id === filters.directionId)
        : []
      const lib = filters.directionLibelle?.toLowerCase()
      const byLib = lib
        ? agents.filter((a) => a.direction_libelle?.toLowerCase() === lib)
        : []
      if (byId.length > 0) agents = byId
      else if (byLib.length > 0) agents = byLib
    }
    if (filters?.entite?.trim()) {
      const ent = filters.entite.trim().toLowerCase()
      agents = agents.filter(
        (a) => (a.entite ?? '').trim().toLowerCase() === ent,
      )
    }

    return agents
  },

  /** Entités / instances distinctes (agents actifs) */
  async listEntites(): Promise<string[]> {
    const { data, error } = await supabase.rpc('ged_list_entites')
    if (error) throw error
    return ((data ?? []) as { entite: string }[])
      .map((r) => String(r.entite ?? '').trim())
      .filter(Boolean)
  },

  async listProfiles(filters?: {
    directionId?: string
    serviceId?: string
    role?: string
  }) {
    let query = supabase
      .from('tb_profiles')
      .select('*, direction:tb_directions(*), service:tb_services(*)')
      .order('full_name')

    if (filters?.directionId) query = query.eq('direction_id', filters.directionId)
    if (filters?.serviceId) query = query.eq('service_id', filters.serviceId)
    if (filters?.role) query = query.eq('role', filters.role)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Profile[]
  },

  async updateProfile(
    profileId: string,
    updates: {
      full_name?: string
      role?: Profile['role']
      direction_id?: string | null
      service_id?: string | null
      matr?: string | null
      privilege?: number | null
    },
  ): Promise<Profile> {
    const directionId = updates.direction_id?.trim() ? updates.direction_id : null
    const serviceId = updates.service_id?.trim() ? updates.service_id : null
    const matr = updates.matr?.trim() ? updates.matr.trim() : null

    const { data, error } = await supabase.rpc('ged_admin_update_profile', {
      p_profile_id: profileId,
      p_full_name: updates.full_name ?? null,
      p_role: updates.role ?? null,
      p_direction_id: directionId,
      p_service_id: serviceId,
      p_matr: matr,
      p_clear_direction: !directionId,
      p_clear_service: !serviceId,
      p_clear_matr: !matr,
    })

    if (error) {
      const msg = error.message || 'Échec de la mise à jour du profil'
      throw new Error(
        msg
          .replace(/^.*error:\s*/i, '')
          .replace(/\n.*/g, '')
          .trim() || msg,
      )
    }

    const row = data as { id: string }

    if (updates.privilege != null && Number.isFinite(Number(updates.privilege))) {
      const { error: privErr } = await supabase.rpc('ged_admin_set_privilege', {
        p_profile_id: profileId,
        p_privilege: Math.trunc(Number(updates.privilege)),
      })
      if (privErr) {
        throw new Error(
          privErr.message
            .replace(/^.*error:\s*/i, '')
            .replace(/\n.*/g, '')
            .trim() || 'Échec de la mise à jour du privilège',
        )
      }
    }

    const { data: profile, error: fetchError } = await supabase
      .from('tb_profiles')
      .select('*, direction:tb_directions(*), service:tb_services(*)')
      .eq('id', row.id)
      .single()

    if (fetchError) throw fetchError
    return profile as Profile
  },

  async createAccount(input: {
    matr: string
    password: string
    full_name: string
    role: Profile['role']
    direction_id?: string | null
    service_id?: string | null
    nom_user?: string
    privilege?: number | null
  }): Promise<Profile> {
    const { data, error } = await supabase.rpc('ged_admin_create_account', {
      p_matr: input.matr,
      p_password: input.password,
      p_full_name: input.full_name,
      p_role: input.role,
      p_direction_id: input.direction_id ?? null,
      p_service_id: input.service_id ?? null,
      p_nom_user: input.nom_user ?? input.full_name,
    })

    if (error) throw error

    const created = data as { id: string }

    if (input.privilege != null && Number.isFinite(Number(input.privilege))) {
      const { error: privErr } = await supabase.rpc('ged_admin_set_privilege', {
        p_profile_id: created.id,
        p_privilege: Math.trunc(Number(input.privilege)),
      })
      if (privErr) {
        throw new Error(
          privErr.message
            .replace(/^.*error:\s*/i, '')
            .replace(/\n.*/g, '')
            .trim() || 'Compte créé mais privilège non enregistré',
        )
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from('tb_profiles')
      .select('*, direction:tb_directions(*), service:tb_services(*)')
      .eq('id', created.id)
      .single()

    if (profileError) throw profileError
    return profile as Profile
  },

  /**
   * Édition document financier — réservée au Contrôle avec privilege > 10.
   */
  async updateFinancialDocument(input: {
    circulationId: string
    concerne?: string
    reference?: string
    montant?: number | null
    devise?: string
    emetteur?: string
    note?: string
  }): Promise<Circulation> {
    const { error } = await supabase.rpc('ged_update_financial_document', {
      p_circulation_id: input.circulationId,
      p_concerne: input.concerne ?? null,
      p_reference: input.reference ?? null,
      p_montant: input.montant ?? null,
      p_devise: input.devise ?? null,
      p_emetteur: input.emetteur ?? null,
      p_note: input.note ?? null,
    })
    if (error) {
      throw new Error(
        error.message
          .replace(/^.*error:\s*/i, '')
          .replace(/\n.*/g, '')
          .trim() || 'Échec de la modification du document financier',
      )
    }
    const { data, error: fetchError } = await supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .eq('id', input.circulationId)
      .single()
    if (fetchError) throw fetchError
    return data as Circulation
  },

  /** Dépôt de pièce jointe — toutes extensions autorisées */
  async uploadDocument(file: File, userId: string): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${userId}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('archives').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (error) throw error
    return path
  },

  /** @deprecated utiliser uploadDocument */
  async uploadPdf(file: File, userId: string): Promise<string> {
    return this.uploadDocument(file, userId)
  },

  async createDocument(
    input: CreateDocumentInput,
    onProgress?: CreateProgressFn,
  ): Promise<Circulation> {
    const progress = onProgress ?? (() => undefined)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')

    const sender = await getProfile(auth.user.id)
    const typeDocument = input.typeDocument ?? 'courrier'
    const financier = isDocumentFinancier(typeDocument)

    if (financier && (input.montant == null || Number.isNaN(Number(input.montant)))) {
      throw new Error('Indiquez le montant pour ce document financier.')
    }

    const agents = financier ? await this.listAgents() : []
    const chain = financier ? avalChainFor(typeDocument) : []
    if (financier && chain.length === 0) {
      throw new Error('Type de document financier non pris en charge.')
    }

    progress(10, 'upload', 'Téléversement du fichier…')
    const filePath = await this.uploadDocument(input.file, sender.id)
    progress(35, 'upload', 'Fichier enregistré')

    let recepteurName: string | null = null
    if (input.receiverMatr) {
      const allAgents = agents.length ? agents : await this.listAgents()
      recepteurName =
        allAgents.find((a) => a.matr === input.receiverMatr)?.full_name ?? null
    }

    // Mise à disposition : l’émetteur signe avec son nom complet
    const emetteurNom =
      typeDocument === 'mise_disposition'
        ? sender.full_name
        : sender.full_name

    progress(45, 'archive', 'Enregistrement de la fiche archive…')
    let entite = input.entite?.trim() || ''
    if (!entite && sender.matr) {
      const self = (await this.listAgents()).find((a) => a.matr === sender.matr)
      entite = self?.entite?.trim() || ''
    }
    if (!entite) {
      throw new Error(
        'Sélectionnez l’entité / instance de provenance du document.',
      )
    }

    const { data: archive, error: archiveError } = await supabase
      .from('tb_archives')
      .insert({
        date_doc: new Date().toISOString().slice(0, 10),
        date_creation: new Date().toISOString().slice(0, 10),
        emetteur: emetteurNom,
        recepteur: recepteurName,
        concerne: input.concerne,
        reference: input.reference ?? null,
        direction_emet_id: sender.direction_id,
        direction_recept_id: input.receiverDirectionId,
        service_emet_id: sender.service_id,
        service_recept_id: input.receiverServiceId ?? null,
        agent_archive_id: sender.id,
        agent_archive_matr: sender.matr,
        file_path: filePath,
        chemin: filePath,
        type_doc: typeDocFromFileName(input.file.name),
        type_document: typeDocument,
        montant: financier ? Number(input.montant) : null,
        devise: financier ? (input.devise || 'CDF') : null,
        nom_doc_phys: input.file.name,
        entite,
      })
      .select('*')
      .single()

    if (archiveError) throw archiveError
    progress(65, 'archive', 'Archive enregistrée')

    const ccUsers = await resolveCcUsers({
      parcoursType: input.parcoursType,
      sender,
      receiverDirectionId: input.receiverDirectionId,
      receiverServiceId: input.receiverServiceId,
      receiverId: input.receiverId,
    })

    const ccMatrs = await resolveCcMatrs({
      parcoursType: input.parcoursType,
      sender,
      receiverDirectionId: input.receiverDirectionId,
      receiverServiceId: input.receiverServiceId,
      receiverMatr: input.receiverMatr,
    })

    const secretariatDeliversDirectly =
      sender.role === 'secretariat' &&
      Boolean(input.receiverMatr) &&
      sender.direction_id === input.receiverDirectionId

    const needsSecretariat =
      !secretariatDeliversDirectly &&
      (input.parcoursType === 'P1' ||
        input.parcoursType === 'P3' ||
        input.parcoursType === 'P4' ||
        input.parcoursType === 'BROADCAST')

    // Lier le profil app du destinataire s'il existe
    let receiverProfileId: string | null = input.receiverId ?? null
    if (input.receiverMatr && !receiverProfileId) {
      const { data: rp } = await supabase
        .from('tb_profiles')
        .select('id')
        .eq('matr', input.receiverMatr)
        .maybeSingle()
      receiverProfileId = rp?.id ?? null
    }

    // Résoudre autorités + première étape courante
    type StepRow = {
      step_order: number
      role_key: string
      role_label: string
      required_matr: string | null
      required_profile_id: string | null
      actor_id: string | null
      actor_matr: string | null
      actor_full_name: string | null
      avis: AvisAval | null
      signed_at: string | null
      is_current: boolean
    }
    const stepRows: StepRow[] = []
    let currentApproverId: string | null = null
    let currentApproverMatr: string | null = null

    if (financier) {
      for (let i = 0; i < chain.length; i++) {
        const def = chain[i]
        let matr: string | null = null
        let profileId: string | null = null
        if (def.role_key === 'emetteur') {
          matr = sender.matr
          profileId = sender.id
        } else {
          const authAgent = findAuthority(
            agents,
            def.role_key as Exclude<AvalRoleKey, 'emetteur'>,
          )
          matr = authAgent?.matr ?? null
          if (matr) {
            const { data: ap } = await supabase
              .from('tb_profiles')
              .select('id')
              .eq('matr', matr)
              .maybeSingle()
            profileId = ap?.id ?? null
          }
        }
        const auto = Boolean(def.autoSign)
        stepRows.push({
          step_order: i + 1,
          role_key: def.role_key,
          role_label: def.role_label,
          required_matr: matr,
          required_profile_id: profileId,
          actor_id: auto ? sender.id : null,
          actor_matr: auto ? sender.matr : null,
          actor_full_name: auto ? sender.full_name : null,
          avis: auto ? 'favorable' : null,
          signed_at: auto ? new Date().toISOString() : null,
          is_current: false,
        })
      }
      // Première étape non signée = courante
      const firstOpen = stepRows.find((s) => !s.avis)
      if (firstOpen) {
        firstOpen.is_current = true
        currentApproverId = firstOpen.required_profile_id
        currentApproverMatr = firstOpen.required_matr
      }
    }

    const status: CirculationStatus = financier
      ? 'en_attente_aval'
      : needsSecretariat
        ? 'en_attente_orientation'
        : 'oriente'

    const secretariatDesk =
      needsSecretariat && !financier
        ? await this.resolveSecretariatDesk(
            input.receiverDirectionId,
            sender.role === 'secretariat' ? sender.secretariat_code : null,
          )
        : sender.role === 'secretariat'
          ? sender.secretariat_code ?? null
          : null

    progress(80, 'circulation', 'Création du circuit documentaire…')
    const { data: circulation, error: circError } = await supabase
      .from('tb_circulations')
      .insert({
        archive_id: (archive as Archive).id,
        sender_id: sender.id,
        sender_matr: sender.matr,
        receiver_id: needsSecretariat && !financier ? null : receiverProfileId,
        receiver_matr:
          needsSecretariat && !financier ? null : input.receiverMatr ?? null,
        sender_direction_id: sender.direction_id,
        receiver_direction_id: input.receiverDirectionId,
        parcours_type: input.parcoursType,
        status,
        cc_users: ccUsers,
        cc_matrs: ccMatrs,
        handler_id: needsSecretariat && !financier ? null : sender.id,
        approver_id: currentApproverId,
        approver_matr: currentApproverMatr,
        note_expedition: input.note ?? null,
        secretariat_desk: secretariatDesk,
      })
      .select(CIRCULATION_SELECT)
      .single()

    if (circError) throw circError

    if (stepRows.length > 0) {
      const { error: stepsErr } = await supabase.from('tb_aval_etapes').insert(
        stepRows.map((s) => ({
          circulation_id: (circulation as Circulation).id,
          ...s,
        })),
      )
      if (stepsErr) throw stepsErr

      if (typeDocument === 'mise_disposition') {
        await logEvent(
          (circulation as Circulation).id,
          sender.id,
          'aval_favorable',
          `Signé par l’émetteur — ${sender.full_name}`,
          { role_key: 'emetteur', step_order: 1 },
          sender.matr,
        )
      }
    }

    await logEvent(
      (circulation as Circulation).id,
      sender.id,
      'created',
      financier
        ? typeDocument === 'note_frais'
          ? 'Note de frais créée — aval protégé DF puis ADG'
          : `Mise à disposition signée par ${sender.full_name} — chaîne d’avals démarrée`
        : `Document créé — parcours ${input.parcoursType}`,
      {
        archive_id: (archive as Archive).id,
        type_document: typeDocument,
      },
      sender.matr,
    )

    progress(100, 'done', 'Enregistrement terminé')
    return circulation as Circulation
  },

  async listAvalEtapes(circulationId: string): Promise<AvalEtape[]> {
    const { data, error } = await supabase
      .from('tb_aval_etapes')
      .select('*')
      .eq('circulation_id', circulationId)
      .order('step_order', { ascending: true })
    if (error) throw error
    return (data ?? []) as AvalEtape[]
  },

  /**
   * Aval sur l’étape courante — réservé à l’autorité désignée.
   */
  async submitAval(input: {
    circulationId: string
    avis: AvisAval
    note?: string
    onProgress?: (pct: number, label: string) => void
  }): Promise<Circulation> {
    const progress = input.onProgress ?? (() => undefined)
    progress(20, 'Vérification de l’autorisation…')
    const { data, error } = await supabase.rpc('ged_submit_aval_step', {
      p_circulation_id: input.circulationId,
      p_avis: input.avis,
      p_note: input.note ?? null,
    })
    if (error) {
      throw new Error(
        error.message
          .replace(/^.*error:\s*/i, '')
          .replace(/\n.*/g, '')
          .trim() || 'Échec de l’enregistrement de l’aval',
      )
    }
    progress(70, 'Aval enregistré — rechargement…')
    const { data: circulation, error: fetchError } = await supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .eq('id', input.circulationId)
      .single()
    if (fetchError) throw fetchError
    void data
    progress(100, 'Aval certifié')
    return circulation as Circulation
  },

  /**
   * Droit d’aval sur l’étape courante (approver_* mis à jour à chaque étape).
   * Le profil Contrôle n’a jamais le droit d’aval.
   */
  canGiveAval(profile: Profile, item: Circulation): boolean {
    if (profile.role === 'controle') return false
    if (item.avis_aval) return false
    if (!isDocumentFinancier(item.archive?.type_document)) return false
    if (item.status !== 'en_attente_aval') return false
    if (item.approver_id && item.approver_id === profile.id) return true
    if (
      item.approver_matr &&
      profile.matr &&
      item.approver_matr === profile.matr
    ) {
      return true
    }
    return false
  },

  async orientDocument(input: OrientDocumentInput): Promise<Circulation> {
    if (!input.receiverMatr && !input.receiverId) {
      throw new Error('Destinataire requis')
    }

    // Priorité : assignation secrétariat robuste via RPC
    if (input.receiverMatr) {
      return this.assignToAgent({
        circulationId: input.circulationId,
        receiverMatr: input.receiverMatr,
        numFolio: input.numFolio,
        noteInstruction: input.noteInstruction,
      })
    }

    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const profile = await getProfile(auth.user.id)

    const { data: circulation, error } = await supabase
      .from('tb_circulations')
      .update({
        receiver_id: input.receiverId,
        handler_id: profile.id,
        status: 'oriente',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.circulationId)
      .select(CIRCULATION_SELECT)
      .single()

    if (error) throw error

    if (input.numFolio && circulation.archive_id) {
      await supabase
        .from('tb_archives')
        .update({ num_folio: input.numFolio })
        .eq('id', circulation.archive_id)
    }

    await logEvent(
      input.circulationId,
      auth.user.id,
      'oriented',
      'Courrier orienté vers le destinataire',
      { receiver_id: input.receiverId, num_folio: input.numFolio },
      profile.matr,
    )

    return circulation as Circulation
  },

  /**
   * Assignation secrétariat → agent concerné (RPC sécurisée).
   */
  async assignToAgent(input: {
    circulationId: string
    receiverMatr: string
    numFolio?: string
    noteInstruction?: string
  }): Promise<Circulation> {
    const { data, error } = await supabase.rpc('ged_secretariat_assign_agent', {
      p_circulation_id: input.circulationId,
      p_receiver_matr: input.receiverMatr,
      p_num_folio: input.numFolio ?? null,
      p_note: input.noteInstruction ?? null,
    })

    if (error) {
      throw new Error(
        error.message
          .replace(/^.*error:\s*/i, '')
          .replace(/\n.*/g, '')
          .trim() || 'Échec de la transmission au destinataire',
      )
    }

    const { data: circulation, error: fetchError } = await supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .eq('id', input.circulationId)
      .single()

    if (fetchError) throw fetchError
    void data
    return circulation as Circulation
  },

  async expedierVersDirection(
    circulationId: string,
    targetDirectionId: string,
  ): Promise<Circulation> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const profile = await getProfile(auth.user.id)

    const { data: circulation, error } = await supabase
      .from('tb_circulations')
      .update({
        receiver_direction_id: targetDirectionId,
        receiver_id: null,
        receiver_matr: null,
        // Libéré pour le secrétariat de la direction destinataire
        handler_id: null,
        status: 'en_attente_orientation',
        updated_at: new Date().toISOString(),
      })
      .eq('id', circulationId)
      .select(CIRCULATION_SELECT)
      .single()

    if (error) throw error

    await logEvent(
      circulationId,
      auth.user.id,
      'expedited',
      'Courrier expédié vers la direction destinataire',
      { target_direction_id: targetDirectionId },
      profile.matr,
    )

    return circulation as Circulation
  },

  /**
   * Expédition secrétariat → agent (même direction ou destinataire final).
   */
  async expedierVersAgent(input: {
    circulationId: string
    receiverMatr: string
    numFolio?: string
    noteInstruction?: string
  }): Promise<Circulation> {
    return this.assignToAgent(input)
  },

  async markReceived(circulationId: string): Promise<void> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const profile = await getProfile(auth.user.id)

    const { error } = await supabase
      .from('tb_circulations')
      .update({ status: 'recu', updated_at: new Date().toISOString() })
      .eq('id', circulationId)

    if (error) throw error
    await logEvent(
      circulationId,
      auth.user.id,
      'received',
      'Courrier marqué comme reçu',
      {},
      profile.matr,
    )
  },

  async markTraite(circulationId: string): Promise<void> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const profile = await getProfile(auth.user.id)

    const { error } = await supabase
      .from('tb_circulations')
      .update({ status: 'traite', updated_at: new Date().toISOString() })
      .eq('id', circulationId)

    if (error) throw error
    await logEvent(
      circulationId,
      auth.user.id,
      'processed',
      'Courrier traité',
      {},
      profile.matr,
    )
  },

  async getInbox(userId: string, matr?: string | null): Promise<Circulation[]> {
    let filter = `receiver_id.eq.${userId},cc_users.cs.{${userId}},approver_id.eq.${userId}`
    if (matr) {
      filter += `,receiver_matr.eq.${matr},cc_matrs.cs.{${matr}},approver_matr.eq.${matr}`
    }

    const { data, error } = await supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .or(filter)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as Circulation[]
  },

  async getOutbox(userId: string): Promise<Circulation[]> {
    const { data, error } = await supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .eq('sender_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as Circulation[]
  },

  /**
   * Files secrétariat — confidentialité sur les listes de travail :
   * - documents déjà pris en charge par soi (handler)
   * - documents libres (handler null) encore en attente dans la direction
   * `allOrienter` / `allExpedier` = totaux direction (KPI).
   */
  async getSecretariatQueue(profile: Profile): Promise<{
    aOrienter: Circulation[]
    aExpedier: Circulation[]
    allOrienter: Circulation[]
    allExpedier: Circulation[]
  }> {
    const desk = profile.secretariat_code?.trim() || null
    if (!desk && !profile.direction_id) {
      return {
        aOrienter: [],
        aExpedier: [],
        allOrienter: [],
        allExpedier: [],
      }
    }

    // Isolement strict par bureau Sec_* ; fallback direction si code absent
    let orientQ = supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .eq('status', 'en_attente_orientation')
      .order('created_at', { ascending: false })
    let expedQ = supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .in('parcours_type', ['P1', 'P3', 'P4', 'BROADCAST'])
      .in('status', ['en_attente_orientation', 'oriente'])
      .is('receiver_matr', null)
      .order('created_at', { ascending: false })

    if (desk) {
      orientQ = orientQ.eq('secretariat_desk', desk)
      expedQ = expedQ.eq('secretariat_desk', desk)
    } else {
      orientQ = orientQ.eq('receiver_direction_id', profile.direction_id!)
      expedQ = expedQ.eq('sender_direction_id', profile.direction_id!)
    }

    const { data: allOrienter, error: e1 } = await orientQ
    if (e1) throw e1
    const { data: allExpedier, error: e2 } = await expedQ
    if (e2) throw e2

    const orientRows = (allOrienter ?? []) as Circulation[]
    const expedRows = (allExpedier ?? []) as Circulation[]

    const visible = (rows: Circulation[]) =>
      rows.filter((c) => !c.handler_id || c.handler_id === profile.id)

    return {
      aOrienter: visible(orientRows),
      aExpedier: visible(expedRows),
      allOrienter: orientRows,
      allExpedier: expedRows,
    }
  },

  /** Prise en charge exclusive d’un courrier (secrétariat / agent) */
  async claimCirculation(circulationId: string): Promise<Circulation> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const profile = await getProfile(auth.user.id)

    const { data: current, error: readErr } = await supabase
      .from('tb_circulations')
      .select('id, handler_id')
      .eq('id', circulationId)
      .single()
    if (readErr) throw readErr

    if (current.handler_id && current.handler_id !== profile.id) {
      throw new Error(
        'Ce courrier est déjà pris en charge par un autre utilisateur.',
      )
    }

    if (current.handler_id === profile.id) {
      const { data, error } = await supabase
        .from('tb_circulations')
        .select(CIRCULATION_SELECT)
        .eq('id', circulationId)
        .single()
      if (error) throw error
      return data as Circulation
    }

    const { data, error } = await supabase
      .from('tb_circulations')
      .update({
        handler_id: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', circulationId)
      .is('handler_id', null)
      .select(CIRCULATION_SELECT)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      throw new Error(
        'Ce courrier vient d’être pris en charge par un autre utilisateur.',
      )
    }

    await logEvent(
      circulationId,
      profile.id,
      'claimed',
      'Courrier pris en charge',
      {},
      profile.matr,
    )

    return data as Circulation
  },

  async getFolioRegister(profile: Profile): Promise<Archive[]> {
    // Superuser : tous les folios
    if (profile.role === 'dir_administrative') {
      const { data, error } = await supabase
        .from('tb_archives')
        .select('*')
        .not('num_folio', 'is', null)
        .order('date_doc', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as Archive[]
    }

    // Secrétariat : folios de la direction (envoyés ou reçus) + coffre / compte
    if (profile.role === 'secretariat' && profile.direction_id) {
      const directionId = profile.direction_id
      const byId = new Map<number, Archive>()

      const { data: dirCircs, error: circErr } = await supabase
        .from('tb_circulations')
        .select('archive_id')
        .or(
          `sender_direction_id.eq.${directionId},receiver_direction_id.eq.${directionId}`,
        )
        .not('archive_id', 'is', null)
        .limit(1000)
      if (circErr) throw circErr

      const circIds = [
        ...new Set(
          (dirCircs ?? [])
            .map((r) => Number((r as { archive_id: number | null }).archive_id))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      ]

      if (circIds.length > 0) {
        const { data: linked, error: linkErr } = await supabase
          .from('tb_archives')
          .select('*')
          .in('id', circIds)
          .not('num_folio', 'is', null)
        if (linkErr) throw linkErr
        for (const a of (linked ?? []) as Archive[]) {
          if (String(a.num_folio ?? '').trim()) byId.set(a.id, a)
        }
      }

      const mine = await this.listMyArchives(profile, 1000)
      for (const a of mine) {
        if (String(a.num_folio ?? '').trim()) byId.set(a.id, a)
      }

      return Array.from(byId.values()).sort(
        (a, b) => +new Date(b.date_doc) - +new Date(a.date_doc),
      )
    }

    // Autres rôles : uniquement les archives liées à leurs courriers / leurs enregistrements
    const mine = await this.listReadableDocuments(profile)
    const ids = new Set<number>()
    for (const c of mine) {
      if (c.archive_id) ids.add(c.archive_id)
      if (c.archive?.id) ids.add(c.archive.id)
    }

    const { data: ownArchived, error: e1 } = await supabase
      .from('tb_archives')
      .select('*')
      .eq('agent_archive_id', profile.id)
      .not('num_folio', 'is', null)
      .order('date_doc', { ascending: false })
    if (e1) throw e1

    const byId = new Map<number, Archive>()
    for (const a of (ownArchived ?? []) as Archive[]) byId.set(a.id, a)

    if (ids.size > 0) {
      const { data: linked, error: e2 } = await supabase
        .from('tb_archives')
        .select('*')
        .in('id', Array.from(ids))
        .not('num_folio', 'is', null)
      if (e2) throw e2
      for (const a of (linked ?? []) as Archive[]) byId.set(a.id, a)
    }

    return Array.from(byId.values()).sort(
      (a, b) => +new Date(b.date_doc) - +new Date(a.date_doc),
    )
  },

  async getTimeline(circulationId: string): Promise<CirculationEvent[]> {
    const { data, error } = await supabase
      .from('tb_circulation_events')
      .select('*, actor:tb_profiles(*)')
      .eq('circulation_id', circulationId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as CirculationEvent[]
  },

  async getAnnotations(circulationId: string): Promise<Annotation[]> {
    const { data, error } = await supabase
      .from('tb_annotations')
      .select('*, author:tb_profiles(*)')
      .eq('circulation_id', circulationId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as Annotation[]
  },

  async getFileUrl(filePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage
      .from('archives')
      .createSignedUrl(filePath, 3600)
    if (error) return null
    return data.signedUrl
  },

  /** Archives de l’utilisateur (ou toutes pour Superuser / Contrôle) */
  async listMyArchives(
    profile: Profile,
    limit = 200,
    options?: { entite?: string },
  ): Promise<Archive[]> {
    const entite = options?.entite?.trim()

    if (profile.role === 'dir_administrative') {
      let query = supabase
        .from('tb_archives')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (entite) query = query.ilike('entite', entite)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Archive[]
    }

    if (profile.role === 'secretariat' && profile.direction_id) {
      // Coffre secrétariat (owner_scope) + documents créés / archivés par ce compte
      let query = supabase
        .from('tb_archives')
        .select('*')
        .or(
          `and(owner_scope.eq.secretariat,owner_direction_id.eq.${profile.direction_id}),agent_archive_id.eq.${profile.id}`,
        )
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (entite) query = query.ilike('entite', entite)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Archive[]
    }

    // Documentation : RLS filtre Invisible / secrétariat non partagé
    if (profile.role === 'documentation_archives') {
      let query = supabase
        .from('tb_archives')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (entite) query = query.ilike('entite', entite)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Archive[]
    }

    let query = supabase
      .from('tb_archives')
      .select('*')
      .eq('agent_archive_id', profile.id)
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (entite) query = query.ilike('entite', entite)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Archive[]
  },

  async listEmplacementsSecretariat(
    directionId: string,
  ): Promise<EmplacementSecretariat[]> {
    const { data, error } = await supabase
      .from('tb_emplacements_secretariat')
      .select('*')
      .eq('direction_id', directionId)
      .eq('actif', true)
      .order('libelle')
    if (error) throw error
    return (data ?? []) as EmplacementSecretariat[]
  },

  async listSecretariatArchiveRefs(directionId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('tb_archives')
      .select('reference')
      .eq('owner_scope', 'secretariat')
      .eq('owner_direction_id', directionId)
      .not('reference', 'is', null)
      .order('reference')
      .limit(500)
    if (error) throw error
    const refs = (data ?? [])
      .map((r) => String((r as { reference: string | null }).reference ?? '').trim())
      .filter(Boolean)
    return [...new Set(refs)]
  },

  async searchArchives(
    profile: Profile,
    filters: ArchiveSearchFilters,
    limit = 300,
  ): Promise<Archive[]> {
    let query = supabase.from('tb_archives').select('*').limit(limit)

    if (filters.scope === 'secretariat' || profile.role === 'secretariat') {
      const dirId = filters.directionId ?? profile.direction_id
      if (!dirId) return []
      query = query
        .eq('owner_scope', 'secretariat')
        .eq('owner_direction_id', dirId)
    } else if (
      profile.role !== 'dir_administrative' &&
      profile.role !== 'controle' &&
      profile.role === 'documentation_archives'
    ) {
      // Docs : ses archives + celles visibles via RLS (partages)
      // On ne force pas agent_archive_id pour permettre les docs partagés par envoi
    } else if (
      profile.role !== 'dir_administrative' &&
      profile.role !== 'controle'
    ) {
      query = query.eq('agent_archive_id', profile.id)
    }

    const concerne = filters.concerne?.trim()
    const reference = filters.reference?.trim()
    const emplacement = filters.emplacement?.trim()
    const emetteur = filters.emetteur?.trim()
    const recepteur = filters.recepteur?.trim()
    const entite = filters.entite?.trim()
    if (concerne) query = query.ilike('concerne', `%${concerne}%`)
    if (reference) query = query.ilike('reference', `%${reference}%`)
    if (emplacement) query = query.ilike('emplacement', `%${emplacement}%`)
    if (emetteur) query = query.ilike('emetteur', `%${emetteur}%`)
    if (recepteur) query = query.ilike('recepteur', `%${recepteur}%`)
    if (entite) query = query.ilike('entite', entite)
    if (filters.dateFrom) query = query.gte('date_creation', filters.dateFrom)
    if (filters.dateTo) query = query.lte('date_creation', filters.dateTo)

    query = query.order('date_creation', { ascending: false })

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Archive[]
  },

  async listArchivesByMinAgeYears(
    years: number,
    limit = 500,
  ): Promise<Archive[]> {
    const safeYears = Math.max(PURGE_MIN_AGE_YEARS, Number(years) || PURGE_MIN_AGE_YEARS)
    const cutoff = archiveMinAgeDate(safeYears)
    const { data, error } = await supabase
      .from('tb_archives')
      .select('*')
      .lte('date_creation', cutoff)
      .order('date_creation', { ascending: true })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as Archive[]
  },

  async purgeArchives(ids: number[]): Promise<{ deleted: number; paths: string[] }> {
    if (ids.length === 0) return { deleted: 0, paths: [] }
    const { data, error } = await supabase.rpc('ged_purge_archives_by_ids', {
      p_ids: ids,
    })
    if (error) throw error
    const payload = data as { deleted?: number; paths?: string[] } | null
    const paths = payload?.paths ?? []
    for (const p of paths) {
      if (p) {
        await supabase.storage.from('archives').remove([p]).catch(() => undefined)
      }
    }
    return { deleted: Number(payload?.deleted ?? 0), paths }
  },

  /**
   * Archives (toutes extensions) — période sur updated_at ou date_doc,
   * ordre décroissant de mise à jour.
   */
  async searchArchivesByPeriod(
    profile: Profile,
    filters: DocumentReportFilters,
  ): Promise<Archive[]> {
    let query = supabase
      .from('tb_archives')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1000)

    if (
      profile.role !== 'dir_administrative' &&
      profile.role !== 'controle'
    ) {
      query = query.eq('agent_archive_id', profile.id)
    }

    if (filters.entite?.trim()) {
      query = query.ilike('entite', filters.entite.trim())
    }

    const { data, error } = await query
    if (error) throw error

    const from = filters.dateFrom ? filters.dateFrom : null
    const to = filters.dateTo ? filters.dateTo : null
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null
    const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null

    const rows = ((data ?? []) as Archive[]).filter((a) => {
      if (fromTs == null && toTs == null) return true
      const maj = new Date(a.updated_at || a.created_at || a.date_doc).getTime()
      const doc = new Date(`${a.date_doc}T12:00:00`).getTime()
      const inMaj =
        (fromTs == null || maj >= fromTs) && (toTs == null || maj <= toTs)
      const inDoc =
        (fromTs == null || doc >= fromTs) && (toTs == null || doc <= toTs)
      return inMaj || inDoc
    })

    return rows.sort(
      (a, b) =>
        +new Date(b.updated_at || b.created_at) -
        +new Date(a.updated_at || a.created_at),
    )
  },

  async searchArchivesReport(
    profile: Profile,
    filters: DocumentReportFilters,
  ): Promise<ArchiveReportRow[]> {
    const archives = await this.searchArchivesByPeriod(profile, filters)
    return archives.map(
      (a): ArchiveReportRow => ({
        id: a.id,
        date_doc: a.date_doc,
        date_maj: a.updated_at || a.created_at,
        folio: a.num_folio?.trim() || '—',
        concerne: a.concerne,
        reference: a.reference?.trim() || '—',
        emetteur: a.emetteur?.trim() || '—',
        recepteur: a.recepteur?.trim() || '—',
        emplacement: a.emplacement?.trim() || '—',
        entite: a.entite?.trim() || '—',
        nom_document: a.nom_doc_phys?.trim() || a.concerne,
        type_doc: a.type_doc || typeDocFromFileName(a.nom_doc_phys || ''),
        extension: fileExtension(a.nom_doc_phys || a.file_path),
      }),
    )
  },

  /** @deprecated utiliser listMyArchives */
  async listAllArchives(limit = 200): Promise<Archive[]> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const profile = await getProfile(auth.user.id)
    return this.listMyArchives(profile, limit)
  },

  /** Enregistre / archive un document (service Documentation) */
  async registerArchive(input: {
    concerne: string
    reference?: string
    numFolio?: string
    emetteur?: string
    recepteur?: string
    emplacement?: string
    directionEmetId?: string
    directionReceptId?: string
    invisibleTous?: boolean
    ownerScope?: 'agent' | 'secretariat' | 'documentation'
    ownerDirectionId?: string | null
    dateCreation?: string
    entite?: string
    file: File
  }): Promise<Archive> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const sender = await getProfile(auth.user.id)
    const filePath = await this.uploadDocument(input.file, sender.id)
    const today = new Date().toISOString().slice(0, 10)
    const dateCreation = input.dateCreation?.slice(0, 10) || today

    const ownerScope =
      input.ownerScope ??
      (sender.role === 'documentation_archives' ? 'documentation' : 'agent')

    const entite = input.entite?.trim()
    if (!entite) {
      throw new Error('L’entité / instance de provenance est obligatoire')
    }

    const { data, error } = await supabase
      .from('tb_archives')
      .insert({
        date_doc: today,
        date_creation: dateCreation,
        emetteur: input.emetteur?.trim() || sender.full_name,
        recepteur: input.recepteur?.trim() || null,
        concerne: input.concerne,
        reference: input.reference ?? null,
        num_folio: input.numFolio ?? null,
        emplacement: input.emplacement ?? null,
        entite,
        direction_emet_id: input.directionEmetId ?? sender.direction_id,
        direction_recept_id: input.directionReceptId ?? null,
        service_emet_id: sender.service_id,
        agent_archive_id: sender.id,
        agent_archive_matr: sender.matr,
        file_path: filePath,
        chemin: filePath,
        type_doc: typeDocFromFileName(input.file.name),
        nom_doc_phys: input.file.name,
        activite: true,
        invisible_tous: Boolean(input.invisibleTous),
        owner_scope: ownerScope,
        owner_direction_id:
          input.ownerDirectionId ??
          (ownerScope === 'secretariat' ? sender.direction_id : null),
      })
      .select('*')
      .single()

    if (error) throw error
    return data as Archive
  },

  /** Archivage secrétariat (emplacement combo + référence unique direction) */
  async registerSecretariatArchive(input: {
    concerne: string
    reference: string
    emplacement: string
    emetteur?: string
    recepteur?: string
    numFolio?: string
    entite: string
    file: File
  }): Promise<Archive> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const sender = await getProfile(auth.user.id)
    if (sender.role !== 'secretariat') {
      throw new Error('Archivage secrétariat réservé au rôle Secrétariat')
    }
    if (!sender.direction_id) {
      throw new Error('Direction du secrétariat manquante')
    }
    if (!input.reference.trim()) {
      throw new Error('La référence est obligatoire')
    }
    return this.registerArchive({
      ...input,
      reference: input.reference.trim(),
      emplacement: input.emplacement,
      entite: input.entite,
      ownerScope: 'secretariat',
      ownerDirectionId: sender.direction_id,
      invisibleTous: false,
    })
  },

  /**
   * Envoi d’un document archivé vers une direction (demande).
   * Arrive chez le secrétariat de la direction destinataire.
   */
  async dispatchArchiveToDirection(input: {
    archiveId: number
    receiverDirectionId: string
    note?: string
    file?: File
  }): Promise<Circulation> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const sender = await getProfile(auth.user.id)

    if (
      sender.role === 'documentation_archives' &&
      Number(sender.privilege ?? 0) <= 9
    ) {
      throw new Error(
        'Privilège insuffisant : l’envoi d’archives requiert un privilège supérieur à 9',
      )
    }

    const { data: archive, error: archErr } = await supabase
      .from('tb_archives')
      .select('*')
      .eq('id', input.archiveId)
      .single()
    if (archErr) throw archErr

    const arch = archive as Archive
    if (
      sender.role === 'secretariat' &&
      (arch.owner_scope !== 'secretariat' ||
        arch.owner_direction_id !== sender.direction_id)
    ) {
      throw new Error(
        'Vous ne pouvez envoyer que les archives de votre secrétariat',
      )
    }

    // Cadre / chef / directeur : uniquement leurs propres archives
    if (
      (sender.role === 'cadre' ||
        sender.role === 'chef_service' ||
        sender.role === 'directeur') &&
      arch.agent_archive_id !== sender.id
    ) {
      throw new Error(
        'Vous ne pouvez envoyer que les documents que vous avez archivés',
      )
    }

    const archiveId = arch.id

    if (input.file) {
      const newPath = await this.uploadDocument(input.file, sender.id)
      const { error: upErr } = await supabase
        .from('tb_archives')
        .update({
          file_path: newPath,
          chemin: newPath,
          nom_doc_phys: input.file.name,
          type_doc: typeDocFromFileName(input.file.name),
          direction_recept_id: input.receiverDirectionId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', archiveId)
      if (upErr) throw upErr
    } else {
      await supabase
        .from('tb_archives')
        .update({
          direction_recept_id: input.receiverDirectionId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', archiveId)
    }

    const { data: circulation, error: circError } = await supabase
      .from('tb_circulations')
      .insert({
        archive_id: archiveId,
        sender_id: sender.id,
        sender_matr: sender.matr,
        receiver_id: null,
        receiver_matr: null,
        sender_direction_id: sender.direction_id,
        receiver_direction_id: input.receiverDirectionId,
        parcours_type: 'P1',
        status: 'en_attente_orientation',
        cc_users: [],
        cc_matrs: [],
        note_expedition: input.note ?? null,
      })
      .select(CIRCULATION_SELECT)
      .single()

    if (circError) throw circError

    await logEvent(
      (circulation as Circulation).id,
      sender.id,
      'created',
      'Document archivé transmis à la direction destinataire',
      { archive_id: archiveId, receiver_direction_id: input.receiverDirectionId },
      sender.matr,
    )

    return circulation as Circulation
  },

  /**
   * Envoi cadre/directeur : archive → agent (cadre/directeur) ou secrétariat.
   */
  async sendArchiveToRecipient(input: {
    archiveId: number
    mode: 'agent' | 'secretariat'
    receiverMatr?: string
    receiverProfileId?: string
    receiverDirectionId?: string
    note?: string
  }): Promise<Circulation> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const sender = await getProfile(auth.user.id)

    const { data: archive, error: archErr } = await supabase
      .from('tb_archives')
      .select('*')
      .eq('id', input.archiveId)
      .single()
    if (archErr) throw archErr
    const arch = archive as Archive

    if (
      arch.agent_archive_id !== sender.id &&
      sender.role !== 'dir_administrative'
    ) {
      throw new Error('Document non autorisé pour cet envoi')
    }

    if (input.mode === 'secretariat') {
      if (!input.receiverDirectionId) {
        throw new Error('Direction destinataire requise')
      }
      return this.dispatchArchiveToDirection({
        archiveId: input.archiveId,
        receiverDirectionId: input.receiverDirectionId,
        note: input.note,
      })
    }

    if (!input.receiverMatr && !input.receiverProfileId) {
      throw new Error('Destinataire agent requis')
    }

    let receiverId = input.receiverProfileId ?? null
    let receiverMatr = input.receiverMatr ?? null
    let receiverDirectionId: string | null = null

    if (receiverMatr) {
      const agents = await this.listAgents()
      const agent = agents.find((a) => a.matr === receiverMatr)
      receiverDirectionId = agent?.direction_id ?? sender.direction_id
    }

    if (receiverId) {
      const { data: recv } = await supabase
        .from('tb_profiles')
        .select('id, matr, direction_id, full_name')
        .eq('id', receiverId)
        .maybeSingle()
      if (recv) {
        receiverMatr = receiverMatr || (recv.matr as string | null)
        receiverDirectionId =
          (recv.direction_id as string | null) ?? receiverDirectionId
      }
    } else if (receiverMatr) {
      const { data: byMatr } = await supabase
        .from('tb_profiles')
        .select('id, direction_id')
        .eq('matr', receiverMatr)
        .maybeSingle()
      if (byMatr) {
        receiverId = byMatr.id as string
        receiverDirectionId =
          (byMatr.direction_id as string | null) ?? receiverDirectionId
      }
    }

    const { data: circulation, error: circError } = await supabase
      .from('tb_circulations')
      .insert({
        archive_id: arch.id,
        sender_id: sender.id,
        sender_matr: sender.matr,
        sender_direction_id: sender.direction_id,
        sender_service_id: sender.service_id,
        receiver_id: receiverId,
        receiver_matr: receiverMatr,
        receiver_direction_id: receiverDirectionId ?? sender.direction_id,
        status: 'oriente',
        parcours_type:
          receiverDirectionId && receiverDirectionId !== sender.direction_id
            ? 'P3'
            : 'P2',
        note_instruction: input.note ?? null,
      })
      .select(CIRCULATION_SELECT)
      .single()

    if (circError) throw circError

    await logEvent(
      (circulation as Circulation).id,
      sender.id,
      'created',
      'Document transmis depuis la boîte documentaire',
      {
        archive_id: arch.id,
        receiver_matr: receiverMatr,
        receiver_id: receiverId,
      },
      sender.matr,
    )

    return circulation as Circulation
  },

  /** Purge physique des archives appartenant à l’utilisateur connecté */
  async purgeOwnArchives(
    ids: number[],
  ): Promise<{ deleted: number; paths: string[] }> {
    if (ids.length === 0) return { deleted: 0, paths: [] }
    const { data, error } = await supabase.rpc('ged_purge_own_archives_by_ids', {
      p_ids: ids,
    })
    if (error) throw error
    const payload = data as { deleted?: number; paths?: string[] } | null
    const paths = payload?.paths ?? []
    for (const p of paths) {
      if (p) {
        await supabase.storage.from('archives').remove([p]).catch(() => undefined)
      }
    }
    return { deleted: Number(payload?.deleted ?? 0), paths }
  },

  /** Purge physique des archives du secrétariat (direction) */
  async purgeSecretariatArchives(
    ids: number[],
  ): Promise<{ deleted: number; paths: string[] }> {
    if (ids.length === 0) return { deleted: 0, paths: [] }
    const { data, error } = await supabase.rpc(
      'ged_purge_secretariat_archives_by_ids',
      { p_ids: ids },
    )
    if (error) throw error
    const payload = data as { deleted?: number; paths?: string[] } | null
    const paths = payload?.paths ?? []
    for (const p of paths) {
      if (p) {
        await supabase.storage.from('archives').remove([p]).catch(() => undefined)
      }
    }
    return { deleted: Number(payload?.deleted ?? 0), paths }
  },

  /** Destinataires app (cadre / chef / directeur / secrétariat) */
  async listForwardRecipients(filters?: {
    directionId?: string
    roles?: Profile['role'][]
  }): Promise<Profile[]> {
    const roles = filters?.roles ?? [
      'cadre',
      'chef_service',
      'directeur',
      'secretariat',
    ]
    let query = supabase
      .from('tb_profiles')
      .select('*, direction:tb_directions(*), service:tb_services(*)')
      .in('role', roles)
      .order('full_name')
    if (filters?.directionId) {
      query = query.eq('direction_id', filters.directionId)
    }
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Profile[]
  },

  /** Documents accessibles pour lecture PDF (périmètre utilisateur) */
  async listReadableDocuments(profile: Profile): Promise<Circulation[]> {
    // Seul le Superuser dispose d'une lecture transverse.
    if (profile.role === 'dir_administrative') {
      const { data, error } = await supabase
        .from('tb_circulations')
        .select(CIRCULATION_SELECT)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as Circulation[]
    }

    // Secrétariat / Cadre / Archives : uniquement envoyés ou reçus (ou CC) par l’utilisateur
    const { data, error } = await supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .or(personalCirculationOrFilter(profile))
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) throw error
    return (data ?? []) as Circulation[]
  },

  /** Contrôle & Audit — uniquement les circuits où le profil est impliqué. */
  async listControleCirculations(profile: Profile): Promise<Circulation[]> {
    const { data, error } = await supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .or(personalCirculationOrFilter(profile))
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) throw error
    return (data ?? []) as Circulation[]
  },

  async broadcastToAllSecretariats(input: {
    concerne: string
    reference?: string
    file: File
    note?: string
    entite?: string
  }): Promise<Circulation> {
    const directions = await this.listDirections()
    const da =
      directions.find((d) => /administrative/i.test(d.libelle)) ?? directions[0]
    if (!da) throw new Error('Direction Administrative introuvable')

    return this.createDocument({
      concerne: input.concerne,
      reference: input.reference,
      receiverDirectionId: da.id,
      parcoursType: 'BROADCAST',
      file: input.file,
      note: input.note,
      entite: input.entite,
    })
  },

  /** Vue globale superuser (Direction Administrative) */
  async getGlobalDashboard(): Promise<GlobalDashboardData> {
    const [
      directions,
      agents,
      { data: circulations, error: circErr },
      { data: archives, error: archErr },
    ] = await Promise.all([
      this.listDirections(),
      this.listAgents(),
      supabase
        .from('tb_circulations')
        .select(CIRCULATION_SELECT)
        .order('created_at', { ascending: false }),
      supabase.from('tb_archives').select('*').order('date_doc', { ascending: false }),
    ])

    if (circErr) throw circErr
    if (archErr) throw archErr

    const all = (circulations ?? []) as Circulation[]
    const allArchives = (archives ?? []) as Archive[]

    const byStatus: Record<CirculationStatus, number> = {
      en_attente_orientation: 0,
      en_attente_aval: 0,
      oriente: 0,
      recu: 0,
      traite: 0,
      repondu: 0,
    }
    const byParcours: Record<ParcoursType, number> = {
      P1: 0,
      P2: 0,
      P3: 0,
      P4: 0,
      BROADCAST: 0,
    }

    for (const c of all) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1
      byParcours[c.parcours_type] = (byParcours[c.parcours_type] ?? 0) + 1
    }

    const directionQueues = directions.map((d) => {
      const related = all.filter(
        (c) =>
          c.sender_direction_id === d.id || c.receiver_direction_id === d.id,
      )
      return {
        direction_id: d.id,
        libelle: d.libelle,
        code: d.code,
        a_orienter: related.filter(
          (c) =>
            c.receiver_direction_id === d.id &&
            c.status === 'en_attente_orientation',
        ).length,
        a_expedier: related.filter(
          (c) =>
            c.sender_direction_id === d.id &&
            ['P1', 'P3', 'BROADCAST'].includes(c.parcours_type) &&
            ['en_attente_orientation', 'oriente'].includes(c.status),
        ).length,
        en_cours: related.filter((c) =>
          ['oriente', 'recu'].includes(c.status),
        ).length,
        traites: related.filter((c) =>
          ['traite', 'repondu'].includes(c.status),
        ).length,
      }
    })

    return {
      totalCirculations: all.length,
      totalArchives: allArchives.length,
      totalFolios: allArchives.filter((a) => a.num_folio).length,
      totalAgents: agents.length,
      byStatus,
      byParcours,
      directionQueues,
      recent: all.slice(0, 12),
      allCirculations: all,
      folios: allArchives.filter((a) => a.num_folio),
    }
  },

  /**
   * Rapport — récapitulatif de circuit :
   * circulations de la période + archives (toutes extensions) du périmètre.
   */
  async searchDocumentReport(
    profile: Profile,
    filters: DocumentReportFilters,
  ): Promise<DocumentReportRow[]> {
    let query = supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (filters.dateFrom) {
      query = query.gte('created_at', `${filters.dateFrom}T00:00:00`)
    }
    if (filters.dateTo) {
      query = query.lte('created_at', `${filters.dateTo}T23:59:59.999`)
    }

    // Périmètre : Superuser / Contrôle = tout ; autres = leurs courriers
    if (
      profile.role !== 'dir_administrative' &&
      profile.role !== 'controle'
    ) {
      query = query.or(personalCirculationOrFilter(profile))
    }

    const { data, error } = await query
    if (error) throw error

    const circRows = (data ?? []) as Circulation[]
    const seenArchiveIds = new Set<number>()

    const fromCirc = circRows.map((c): DocumentReportRow => {
      const arch = c.archive
      if (arch?.id) seenArchiveIds.add(arch.id)
      if (c.archive_id) seenArchiveIds.add(c.archive_id)
      const dest =
        arch?.recepteur ||
        c.receiver?.full_name ||
        c.receiver_matr ||
        '—'
      const emit =
        arch?.emetteur ||
        c.sender?.full_name ||
        c.sender_matr ||
        '—'
      const nomDoc = arch?.nom_doc_phys || arch?.concerne || '—'

      return {
        id: c.id,
        nom_document: nomDoc,
        date_envoye: c.created_at,
        destinataire: dest,
        objet: arch?.concerne ?? '—',
        reference: arch?.reference ?? '—',
        folio: arch?.num_folio ?? '—',
        emetteur: emit,
        statut: c.status,
        parcours: c.parcours_type,
        circuit: `${PARCOURS_LABELS[c.parcours_type]} · ${STATUS_LABELS[c.status]}`,
        extension: fileExtension(arch?.nom_doc_phys || arch?.file_path),
      }
    })

    // Compléter avec les documents archivés (toutes extensions) hors / sans circuit
    const archives = await this.searchArchivesByPeriod(profile, filters)
    const fromArchives: DocumentReportRow[] = archives
      .filter((a) => !seenArchiveIds.has(a.id))
      .map((a) => ({
        id: `archive-${a.id}`,
        nom_document: a.nom_doc_phys?.trim() || a.concerne,
        date_envoye: a.updated_at || a.created_at || a.date_doc,
        destinataire: a.recepteur?.trim() || '—',
        objet: a.concerne,
        reference: a.reference?.trim() || '—',
        folio: a.num_folio?.trim() || '—',
        emetteur: a.emetteur?.trim() || '—',
        statut: 'archive' as const,
        parcours: 'ARCHIVE' as const,
        circuit: 'Document archivé',
        extension: fileExtension(a.nom_doc_phys || a.file_path),
      }))

    return [...fromCirc, ...fromArchives].sort(
      (a, b) => +new Date(b.date_envoye) - +new Date(a.date_envoye),
    )
  },

  /**
   * Rapport notes de frais / mises à disposition — avec chaîne d’aval.
   */
  async searchFinancialReport(
    profile: Profile,
    filters: DocumentReportFilters,
  ): Promise<FinancialReportRow[]> {
    let query = supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (filters.dateFrom) {
      query = query.gte('created_at', `${filters.dateFrom}T00:00:00`)
    }
    if (filters.dateTo) {
      query = query.lte('created_at', `${filters.dateTo}T23:59:59.999`)
    }

    if (
      profile.role !== 'dir_administrative' &&
      profile.role !== 'controle'
    ) {
      query = query.or(personalFinancialOrFilter(profile))
    }

    const { data, error } = await query
    if (error) throw error

    const circs = ((data ?? []) as Circulation[]).filter((c) =>
      isDocumentFinancier(c.archive?.type_document),
    )

    if (circs.length === 0) return []

    const ids = circs.map((c) => c.id)
    const { data: stepsData, error: stepsErr } = await supabase
      .from('tb_aval_etapes')
      .select('*')
      .in('circulation_id', ids)
      .order('step_order', { ascending: true })
    if (stepsErr) throw stepsErr

    const stepsByCirc = new Map<string, AvalEtape[]>()
    for (const s of (stepsData ?? []) as AvalEtape[]) {
      const list = stepsByCirc.get(s.circulation_id) ?? []
      list.push(s)
      stepsByCirc.set(s.circulation_id, list)
    }

    return circs
      .map((c): FinancialReportRow => {
        const arch = c.archive
        const type =
          arch?.type_document === 'mise_disposition'
            ? 'mise_disposition'
            : 'note_frais'
        const steps = stepsByCirc.get(c.id) ?? []
        const signataires: FinancialAvalSignataire[] = steps.map((s) => ({
          role_label: s.role_label,
          actor_full_name: s.actor_full_name,
          avis: s.avis,
          signed_at: s.signed_at,
        }))

        return {
          id: c.id,
          type_document: type,
          date_doc: arch?.date_doc || c.created_at,
          date_creation: c.created_at,
          folio: arch?.num_folio?.trim() || '—',
          concerne: arch?.concerne || '—',
          reference: arch?.reference?.trim() || '—',
          emetteur:
            arch?.emetteur?.trim() ||
            c.sender?.full_name ||
            c.sender_matr ||
            '—',
          montant: Number(arch?.montant) || 0,
          devise: (arch?.devise || 'CDF').toUpperCase(),
          statut: c.status,
          avis_aval: c.avis_aval,
          signataires,
          chaine_aval: formatAvalChain(signataires),
        }
      })
      .sort((a, b) => {
        if (a.type_document !== b.type_document) {
          return a.type_document === 'note_frais' ? -1 : 1
        }
        return +new Date(b.date_creation) - +new Date(a.date_creation)
      })
  },

  /** Demande de document adressée uniquement à Documentation & Archives */
  async createDemandeDoc(input: {
    recipientId: string
    message: string
    reference?: string
  }): Promise<DemandeDoc> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const profile = await getProfile(auth.user.id)
    const msg = input.message.trim()
    if (!msg) throw new Error('Indiquez le contenu de la demande.')
    if (!input.recipientId || input.recipientId === profile.id) {
      throw new Error('Sélectionnez un autre profil destinataire.')
    }

    const { data, error } = await supabase
      .from('tb_demandes_docs')
      .insert({
        requester_id: profile.id,
        recipient_id: input.recipientId,
        requester_matr: profile.matr,
        requester_name: profile.full_name,
        message: msg,
        reference_souhaitee: input.reference?.trim() || null,
        status: 'envoyee',
      })
      .select('*')
      .single()
    if (error) throw error
    return data as DemandeDoc
  },

  /** Mes demandes (émetteur) */
  async listMyDemandesDocs(): Promise<DemandeDoc[]> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const { data, error } = await supabase
      .from('tb_demandes_docs')
      .select('*')
      .eq('requester_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return (data ?? []) as DemandeDoc[]
  },

  /** Demandes adressées au compte connecté (filtrées aussi par RLS) */
  async listDemandesDocsForProfile(_profile: Profile): Promise<DemandeDoc[]> {
    const { data, error } = await supabase
      .from('tb_demandes_docs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) throw error
    return (data ?? []) as DemandeDoc[]
  },

  /** Ancien nom conservé pour les appels existants. */
  async listDemandesDocsForArchives(profile: Profile): Promise<DemandeDoc[]> {
    return this.listDemandesDocsForProfile(profile)
  },

  /** Signale au demandeur l'avancement de sa demande. */
  async signalDemandeDoc(input: {
    id: string
    status: Extract<
      DemandeDocStatus,
      'message_recu' | 'document_inexistant' | 'en_cours'
    >
    note?: string
  }): Promise<DemandeDoc> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')

    const { data, error } = await supabase
      .from('tb_demandes_docs')
      .update({
        status: input.status,
        signal_note: input.note?.trim() || null,
        signal_at: new Date().toISOString(),
        signal_by: auth.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw error
    return data as DemandeDoc
  },

  /** Le destinataire joint le document et le renvoie au demandeur. */
  async replyDemandeDoc(input: {
    id: string
    file: File
    note?: string
  }): Promise<DemandeDoc> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const path = await this.uploadDocument(input.file, auth.user.id)

    const { data, error } = await supabase
      .from('tb_demandes_docs')
      .update({
        status: 'livree',
        reply_file_path: path,
        reply_file_name: input.file.name,
        reply_note: input.note?.trim() || null,
        replied_at: new Date().toISOString(),
        replied_by: auth.user.id,
        signal_at: new Date().toISOString(),
        signal_by: auth.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw error
    return data as DemandeDoc
  },

  async listGedMessages(): Promise<GedMessage[]> {
    const { data, error } = await supabase
      .from('tb_ged_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return (data ?? []) as GedMessage[]
  },

  async sendGedMessage(input: {
    recipientId: string | null
    subject?: string
    message: string
    file?: File | null
    archiveId?: number
  }): Promise<GedMessage> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const profile = await getProfile(auth.user.id)
    const message = input.message.trim()
    if (!message) throw new Error('Le message ne peut pas être vide.')
    if (input.recipientId === profile.id) {
      throw new Error('Vous ne pouvez pas vous envoyer un message.')
    }
    if (!input.recipientId && profile.role !== 'dir_administrative') {
      throw new Error('La diffusion à tous les profils est réservée au Superuser.')
    }
    if (input.file && profile.role !== 'documentation_archives') {
      throw new Error('Seul le service Documentation & Archives peut joindre un document.')
    }
    if (input.archiveId && profile.role !== 'documentation_archives') {
      throw new Error('Seul le service Documentation & Archives peut transmettre une archive.')
    }
    if (input.file && input.archiveId) {
      throw new Error('Choisissez un fichier ou une archive existante, pas les deux.')
    }

    let attachmentPath: string | null = null
    let attachmentName: string | null = null
    if (input.file) {
      attachmentPath = await this.uploadDocument(input.file, profile.id)
      attachmentName = input.file.name
    } else if (input.archiveId) {
      const { data: archive, error: archiveError } = await supabase
        .from('tb_archives')
        .select('file_path, nom_doc_phys')
        .eq('id', input.archiveId)
        .single()
      if (archiveError) throw archiveError
      if (!archive.file_path) {
        throw new Error('Cette archive ne contient pas de document numérique.')
      }
      attachmentPath = archive.file_path
      attachmentName = archive.nom_doc_phys || 'Document archivé'
    }
    const { data, error } = await supabase
      .from('tb_ged_messages')
      .insert({
        sender_id: profile.id,
        recipient_id: input.recipientId,
        subject: input.subject?.trim() || null,
        message,
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
      })
      .select('*')
      .single()

    if (error) {
      if (input.file && attachmentPath) {
        const { error: cleanupError } = await supabase.storage
          .from('archives')
          .remove([attachmentPath])
        if (cleanupError) {
          throw new Error(`${error.message} (le fichier temporaire n’a pas pu être supprimé : ${cleanupError.message})`)
        }
      }
      throw error
    }
    return data as GedMessage
  },

  async getProfileActivityStats(profileId: string): Promise<ProfileActivityStats> {
    const { data, error } = await supabase.rpc('ged_profile_activity_stats', {
      p_profile_id: profileId,
    })
    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error('Statistiques indisponibles pour le moment.')
      }
      throw new Error(error.message)
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      throw new Error('Les statistiques du profil sont indisponibles.')
    }
    return {
      archived: Number(row.archived ?? 0),
      sent: Number(row.sent ?? 0),
      requested: Number(row.requested ?? 0),
      unanswered: Number(row.unanswered ?? 0),
    }
  },

  /** Autres secrétariats (messagerie / expédition) */
  async listSecretariatPeers(profile: Profile): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('tb_profiles')
      .select('*, direction:tb_directions(*), service:tb_services(*)')
      .eq('role', 'secretariat')
      .neq('id', profile.id)
      .order('full_name')
    if (error) throw error
    return (data ?? []) as Profile[]
  },

  async listMessagerieSec(profile: Profile): Promise<MessagerieSec[]> {
    const { data, error } = await supabase
      .from('tb_messagerie_sec')
      .select(
        '*, from_profile:tb_profiles!tb_messagerie_sec_from_profile_id_fkey(*), to_profile:tb_profiles!tb_messagerie_sec_to_profile_id_fkey(*)',
      )
      .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return (data ?? []) as MessagerieSec[]
  },

  async sendMessagerieSec(input: {
    toProfileId: string
    toDesk?: string | null
    circulationId?: string | null
    subject?: string
    message: string
  }): Promise<MessagerieSec> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const me = await getProfile(auth.user.id)
    if (me.role !== 'secretariat' && me.role !== 'dir_administrative') {
      throw new Error('Messagerie réservée aux secrétariats')
    }
    const { data, error } = await supabase
      .from('tb_messagerie_sec')
      .insert({
        from_profile_id: me.id,
        to_profile_id: input.toProfileId,
        from_desk: me.secretariat_code ?? null,
        to_desk: input.toDesk ?? null,
        circulation_id: input.circulationId ?? null,
        subject: input.subject?.trim() || null,
        message: input.message.trim(),
        status: 'envoyee',
      })
      .select(
        '*, from_profile:tb_profiles!tb_messagerie_sec_from_profile_id_fkey(*), to_profile:tb_profiles!tb_messagerie_sec_to_profile_id_fkey(*)',
      )
      .single()
    if (error) throw error
    return data as MessagerieSec
  },

  async acceptMessagerieSec(
    messageId: string,
    note?: string,
  ): Promise<MessagerieSec> {
    const { data, error } = await supabase.rpc('ged_accept_messagerie_sec', {
      p_message_id: messageId,
      p_note: note ?? null,
    })
    if (error) throw error
    return data as MessagerieSec
  },

  async refuseMessagerieSec(
    messageId: string,
    note?: string,
  ): Promise<MessagerieSec> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const { data, error } = await supabase
      .from('tb_messagerie_sec')
      .update({
        status: 'refusee',
        response_note: note?.trim() || null,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('to_profile_id', auth.user.id)
      .select(
        '*, from_profile:tb_profiles!tb_messagerie_sec_from_profile_id_fkey(*), to_profile:tb_profiles!tb_messagerie_sec_to_profile_id_fkey(*)',
      )
      .single()
    if (error) throw error
    return data as MessagerieSec
  },
}
