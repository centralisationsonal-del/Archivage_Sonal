import { supabase } from '@/lib/supabase'
import type {
  Annotation,
  Archive,
  Circulation,
  CirculationEvent,
  CirculationStatus,
  CreateDocumentInput,
  DocumentReportFilters,
  DocumentReportRow,
  GedAgent,
  GlobalDashboardData,
  OrientDocumentInput,
  ParcoursType,
  Profile,
} from '@/types/ged'
import { PARCOURS_LABELS, STATUS_LABELS } from '@/types/ged'
import { resolveCcMatrs, resolveCcUsers } from '@/modules/ged/workflowRules'

const CIRCULATION_SELECT = `
  *,
  archive:tb_archives(*),
  sender:tb_profiles!tb_circulations_sender_id_fkey(*),
  receiver:tb_profiles!tb_circulations_receiver_id_fkey(*)
`

async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('tb_profiles')
    .select('*, direction:tb_directions(*), service:tb_services(*)')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data as Profile
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

  async listDirections() {
    const { data, error } = await supabase
      .from('tb_directions')
      .select('*')
      .order('libelle')
    if (error) throw error
    return data ?? []
  },

  async listServices(directionId?: string) {
    let query = supabase.from('tb_services').select('*').order('libelle')
    if (directionId) query = query.eq('direction_id', directionId)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  /** Agents actifs depuis TbPersonnels (projet principal) */
  async listAgents(filters?: {
    directionId?: string
    directionLibelle?: string
    serviceId?: string
  }): Promise<GedAgent[]> {
    const { data, error } = await supabase.rpc('ged_list_agents', {
      p_direction: filters?.directionLibelle ?? filters?.directionId ?? null,
      p_service: filters?.serviceId ?? null,
    })
    if (error) throw error

    let agents = (data ?? []) as GedAgent[]

    // Filtre local de secours si le RPC a renvoyé trop large
    if (filters?.directionId) {
      const byId = agents.filter((a) => a.direction_id === filters.directionId)
      if (byId.length > 0) agents = byId
    }
    if (filters?.directionLibelle) {
      const lib = filters.directionLibelle.toLowerCase()
      const byLib = agents.filter(
        (a) => a.direction_libelle?.toLowerCase() === lib,
      )
      if (byLib.length > 0) agents = byLib
    }

    return agents
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
    const { data: profile, error: profileError } = await supabase
      .from('tb_profiles')
      .select('*, direction:tb_directions(*), service:tb_services(*)')
      .eq('id', created.id)
      .single()

    if (profileError) throw profileError
    return profile as Profile
  },

  async uploadPdf(file: File, userId: string): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${userId}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('archives').upload(path, file, {
      contentType: 'application/pdf',
      upsert: false,
    })
    if (error) throw error
    return path
  },

  async createDocument(input: CreateDocumentInput): Promise<Circulation> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')

    const sender = await getProfile(auth.user.id)
    const filePath = await this.uploadPdf(input.file, sender.id)

    let recepteurName: string | null = null
    if (input.receiverMatr) {
      const agents = await this.listAgents()
      recepteurName = agents.find((a) => a.matr === input.receiverMatr)?.full_name ?? null
    }

    const { data: archive, error: archiveError } = await supabase
      .from('tb_archives')
      .insert({
        date_doc: new Date().toISOString().slice(0, 10),
        emetteur: sender.full_name,
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
        type_doc: 'Pdf',
        nom_doc_phys: input.file.name,
      })
      .select('*')
      .single()

    if (archiveError) throw archiveError

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

    const { data: circulation, error: circError } = await supabase
      .from('tb_circulations')
      .insert({
        archive_id: (archive as Archive).id,
        sender_id: sender.id,
        sender_matr: sender.matr,
        receiver_id: needsSecretariat ? null : receiverProfileId,
        receiver_matr: needsSecretariat ? null : input.receiverMatr ?? null,
        sender_direction_id: sender.direction_id,
        receiver_direction_id: input.receiverDirectionId,
        parcours_type: input.parcoursType,
        status: needsSecretariat ? 'en_attente_orientation' : 'oriente',
        cc_users: ccUsers,
        cc_matrs: ccMatrs,
        note_expedition: input.note ?? null,
      })
      .select(CIRCULATION_SELECT)
      .single()

    if (circError) throw circError

    await logEvent(
      (circulation as Circulation).id,
      sender.id,
      'created',
      `Document créé — parcours ${input.parcoursType}`,
      { archive_id: (archive as Archive).id },
      sender.matr,
    )

    return circulation as Circulation
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
    let filter = `receiver_id.eq.${userId},cc_users.cs.{${userId}}`
    if (matr) filter += `,receiver_matr.eq.${matr},cc_matrs.cs.{${matr}}`

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

  async getSecretariatQueue(directionId: string): Promise<{
    aOrienter: Circulation[]
    aExpedier: Circulation[]
  }> {
    const { data: aOrienter, error: e1 } = await supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .eq('receiver_direction_id', directionId)
      .eq('status', 'en_attente_orientation')
      .order('created_at', { ascending: false })

    if (e1) throw e1

    const { data: aExpedier, error: e2 } = await supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .eq('sender_direction_id', directionId)
      .in('parcours_type', ['P1', 'P3', 'P4', 'BROADCAST'])
      .in('status', ['en_attente_orientation', 'oriente'])
      .is('receiver_matr', null)
      .order('created_at', { ascending: false })

    if (e2) throw e2

    return {
      aOrienter: (aOrienter ?? []) as Circulation[],
      aExpedier: (aExpedier ?? []) as Circulation[],
    }
  },

  async getFolioRegister(directionId: string): Promise<Archive[]> {
    const { data, error } = await supabase
      .from('tb_archives')
      .select('*')
      .or(`direction_emet_id.eq.${directionId},direction_recept_id.eq.${directionId}`)
      .not('num_folio', 'is', null)
      .order('date_doc', { ascending: false })

    if (error) throw error
    return (data ?? []) as Archive[]
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

  /** Registre global (Documentation & Archives) */
  async listAllArchives(limit = 200): Promise<Archive[]> {
    const { data, error } = await supabase
      .from('tb_archives')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as Archive[]
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
    file: File
  }): Promise<Archive> {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error('Non authentifié')
    const sender = await getProfile(auth.user.id)
    const filePath = await this.uploadPdf(input.file, sender.id)

    const { data, error } = await supabase
      .from('tb_archives')
      .insert({
        date_doc: new Date().toISOString().slice(0, 10),
        emetteur: input.emetteur?.trim() || sender.full_name,
        recepteur: input.recepteur?.trim() || null,
        concerne: input.concerne,
        reference: input.reference ?? null,
        num_folio: input.numFolio ?? null,
        emplacement: input.emplacement ?? null,
        direction_emet_id: input.directionEmetId ?? sender.direction_id,
        direction_recept_id: input.directionReceptId ?? null,
        service_emet_id: sender.service_id,
        agent_archive_id: sender.id,
        agent_archive_matr: sender.matr,
        file_path: filePath,
        chemin: filePath,
        type_doc: 'Pdf',
        nom_doc_phys: input.file.name,
        activite: true,
      })
      .select('*')
      .single()

    if (error) throw error
    return data as Archive
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

    const { data: archive, error: archErr } = await supabase
      .from('tb_archives')
      .select('*')
      .eq('id', input.archiveId)
      .single()
    if (archErr) throw archErr

    const archiveId = (archive as Archive).id

    if (input.file) {
      const newPath = await this.uploadPdf(input.file, sender.id)
      const { error: upErr } = await supabase
        .from('tb_archives')
        .update({
          file_path: newPath,
          chemin: newPath,
          nom_doc_phys: input.file.name,
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

  /** Documents accessibles pour lecture PDF (périmètre rôle) */
  async listReadableDocuments(profile: Profile): Promise<Circulation[]> {
    if (
      profile.role === 'documentation_archives' ||
      profile.role === 'dir_administrative'
    ) {
      const { data, error } = await supabase
        .from('tb_circulations')
        .select(CIRCULATION_SELECT)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as Circulation[]
    }

    if (profile.role === 'secretariat' && profile.direction_id) {
      const { data, error } = await supabase
        .from('tb_circulations')
        .select(CIRCULATION_SELECT)
        .or(
          `sender_direction_id.eq.${profile.direction_id},receiver_direction_id.eq.${profile.direction_id}`,
        )
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as Circulation[]
    }

    const [inbox, outbox] = await Promise.all([
      this.getInbox(profile.id, profile.matr),
      this.getOutbox(profile.id),
    ])
    const map = new Map<string, Circulation>()
    ;[...inbox, ...outbox].forEach((c) => map.set(c.id, c))
    return Array.from(map.values()).sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
    )
  },

  async broadcastToAllSecretariats(input: {
    concerne: string
    reference?: string
    file: File
    note?: string
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
   * Recherche périodique du circuit documentaire (rôle secrétariat / cadre).
   */
  async searchDocumentReport(
    profile: Profile,
    filters: DocumentReportFilters,
  ): Promise<DocumentReportRow[]> {
    let query = supabase
      .from('tb_circulations')
      .select(CIRCULATION_SELECT)
      .order('created_at', { ascending: false })
      .limit(500)

    if (filters.dateFrom) {
      query = query.gte('created_at', `${filters.dateFrom}T00:00:00`)
    }
    if (filters.dateTo) {
      query = query.lte('created_at', `${filters.dateTo}T23:59:59`)
    }

    // Périmètre selon le rôle
    if (profile.role === 'secretariat' && profile.direction_id) {
      query = query.or(
        `sender_direction_id.eq.${profile.direction_id},receiver_direction_id.eq.${profile.direction_id}`,
      )
    } else if (profile.role === 'documentation_archives') {
      // Accès global — pas de filtre direction
    } else if (
      profile.role === 'cadre' ||
      profile.role === 'chef_service' ||
      profile.role === 'directeur'
    ) {
      const parts = [
        `sender_id.eq.${profile.id}`,
        `receiver_id.eq.${profile.id}`,
        `cc_users.cs.{${profile.id}}`,
      ]
      if (profile.matr) {
        parts.push(`sender_matr.eq.${profile.matr}`)
        parts.push(`receiver_matr.eq.${profile.matr}`)
        parts.push(`cc_matrs.cs.{${profile.matr}}`)
      }
      query = query.or(parts.join(','))
    }

    const { data, error } = await query
    if (error) throw error

    const rows = (data ?? []) as Circulation[]

    return rows.map((c): DocumentReportRow => {
      const arch = c.archive
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
      const nomDoc =
        arch?.nom_doc_phys ||
        arch?.concerne ||
        '—'

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
      }
    })
  },
}
