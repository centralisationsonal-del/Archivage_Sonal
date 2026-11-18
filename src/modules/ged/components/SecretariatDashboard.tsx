import { useCallback, useEffect, useRef, useState } from 'react'
import { CirculationList } from '@/modules/ged/components/CirculationList'
import { CreateDocumentForm } from '@/modules/ged/components/CreateDocumentForm'
import { DemandeDocRequesterPanel } from '@/modules/ged/components/DemandeDocRequesterPanel'
import { SecretariatMessageriePanel } from '@/modules/ged/components/SecretariatMessageriePanel'
import { AgendaChefPanel } from '@/modules/ged/components/AgendaChefPanel'
import { ArchivesSearchPanel } from '@/modules/ged/components/ArchivesSearchPanel'
import { CadreArchivesTools } from '@/modules/ged/components/CadreArchivesTools'
import {
  EntiteFilter,
  useEntiteFilter,
} from '@/modules/ged/components/EntiteFilter'
import { groupedArchiveOptions } from '@/modules/ged/components/ArchivesGroupedRegister'
import {
  DashboardHeader,
  DashboardKpi,
} from '@/modules/ged/components/DashboardShared'
import { DocumentPdfReader } from '@/modules/ged/components/DocumentPdfReader'
import { DocumentReport } from '@/modules/ged/components/DocumentReport'
import { DocumentTimeline } from '@/modules/ged/components/DocumentTimeline'
import {
  TransferProofModal,
  type TransferProofPayload,
} from '@/modules/ged/components/TransferProofModal'
import { ACCEPTED_DOCUMENT_ACCEPT } from '@/lib/documentFiles'
import { circulationService } from '@/services/circulationService'
import { format } from '@/lib/format'
import { formatDocumentAge } from '@/modules/ged/lib/archivePrivileges'
import { countPdfPages } from '@/lib/pdfPages'
import type {
  Archive,
  Circulation,
  CirculationEvent,
  Direction,
  EmplacementSecretariat,
  GedAgent,
  Profile,
} from '@/types/ged'
import {
  SECRETARIAT_CODE_LABELS,
  type SecretariatCode,
} from '@/types/ged'
import {
  Archive as ArchiveIcon,
  BookOpen,
  FileText,
  Forward,
  Inbox,
  Loader2,
  PenLine,
  RefreshCw,
  Send,
} from 'lucide-react'

interface Props {
  profile: Profile
}

type Tab =
  | 'vue'
  | 'orienter'
  | 'expedier'
  | 'folios'
  | 'archiver'
  | 'envoyer_archives'
  | 'rechercher'
  | 'nettoyer'
  | 'lecture'
  | 'rapport'
  | 'demande_archives'
  | 'messagerie'
  | 'agenda'
  | 'creer'

export function SecretariatDashboard({ profile: initialProfile }: Props) {
  const [profile, setProfile] = useState(initialProfile)
  const profileRef = useRef(profile)
  profileRef.current = profile
  const [tab, setTab] = useState<Tab>('vue')
  const [aOrienter, setAOrienter] = useState<Circulation[]>([])
  const [aExpedier, setAExpedier] = useState<Circulation[]>([])
  const [kpiOrienter, setKpiOrienter] = useState(0)
  const [kpiExpedier, setKpiExpedier] = useState(0)
  const [folios, setFolios] = useState<Archive[]>([])
  const [selected, setSelected] = useState<Circulation | null>(null)
  const [events, setEvents] = useState<CirculationEvent[]>([])
  const [agents, setAgents] = useState<GedAgent[]>([])
  const [receiverMatr, setReceiverMatr] = useState('')
  const [numFolio, setNumFolio] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [docLoading, setDocLoading] = useState(false)

  const [secArchives, setSecArchives] = useState<Archive[]>([])
  const [emplacements, setEmplacements] = useState<EmplacementSecretariat[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [secConcerne, setSecConcerne] = useState('')
  const [secReference, setSecReference] = useState('')
  const [secEmplacement, setSecEmplacement] = useState('')
  const [secEmetteur, setSecEmetteur] = useState('')
  const [secRecepteur, setSecRecepteur] = useState('')
  const [secFolio, setSecFolio] = useState('')
  const [secFile, setSecFile] = useState<File | null>(null)
  const [secSaving, setSecSaving] = useState(false)
  const [dispatchArchiveId, setDispatchArchiveId] = useState('')
  const [dispatchDirId, setDispatchDirId] = useState('')
  const [dispatchNote, setDispatchNote] = useState('')
  const [proofOpen, setProofOpen] = useState(false)
  const [proof, setProof] = useState<TransferProofPayload | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const loadEntites = useCallback(() => circulationService.listEntites(), [])
  const { entites, entite, setEntite } = useEntiteFilter(loadEntites)

  useEffect(() => {
    setProfile((prev) => {
      const next = initialProfile
      if (
        prev.id === next.id &&
        prev.full_name === next.full_name &&
        prev.direction_id === next.direction_id &&
        prev.service_id === next.service_id &&
        prev.matr === next.matr &&
        (prev.secretariat_code ?? null) === (next.secretariat_code ?? null) &&
        (prev.privilege ?? null) === (next.privilege ?? null) &&
        (prev.direction?.libelle ?? null) === (next.direction?.libelle ?? null)
      ) {
        return prev
      }
      return next
    })
  }, [initialProfile])

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true)
    try {
      const activeProfile = profileRef.current
      const directionId = activeProfile.direction_id
      const deskCode = activeProfile.secretariat_code
      if (!directionId && !deskCode) {
        setAOrienter([])
        setAExpedier([])
        setKpiOrienter(0)
        setKpiExpedier(0)
        setFolios([])
        setAgents([])
        setSecArchives([])
        setEmplacements([])
        return
      }

      const matchEntite = (c: Circulation) => {
        if (!entite) return true
        return (
          (c.archive?.entite ?? '').toLowerCase() === entite.toLowerCase()
        )
      }

      const [queue, folioRows, agentRows, archives, empls, dirs] =
        await Promise.all([
          circulationService.getSecretariatQueue(activeProfile),
          circulationService.getFolioRegister(activeProfile),
          circulationService.listAgents({
            directionId: directionId || undefined,
            directionLibelle: activeProfile.direction?.libelle,
            entite: entite || undefined,
          }),
          circulationService.listMyArchives(activeProfile, 1000, {
            entite: entite || undefined,
          }),
          directionId
            ? circulationService.listEmplacementsSecretariat(directionId)
            : Promise.resolve([]),
          circulationService.listDirections(),
        ])

      setAOrienter(queue.aOrienter.filter(matchEntite))
      setAExpedier(queue.aExpedier.filter(matchEntite))
      setKpiOrienter(queue.allOrienter.filter(matchEntite).length)
      setKpiExpedier(queue.allExpedier.filter(matchEntite).length)
      setFolios(
        entite
          ? folioRows.filter(
              (f) =>
                (f.entite ?? '').toLowerCase() === entite.toLowerCase(),
            )
          : folioRows,
      )
      setAgents(agentRows)
      setSecArchives(archives)
      setEmplacements(empls)
      setDirections(dirs)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      if (!opts?.soft) setLoading(false)
    }
  }, [entite])

  const dashPrimedRef = useRef(false)

  useEffect(() => {
    // Premier passage : chargement complet ; suivants (ex. filtre entité) : soft, sans flash
    if (!dashPrimedRef.current) {
      dashPrimedRef.current = true
      void load()
    } else {
      void load({ soft: true })
    }
    const t = window.setInterval(() => void load({ soft: true }), 15000)
    return () => window.clearInterval(t)
  }, [load])

  useEffect(() => {
    if (tab === 'vue' && dashPrimedRef.current) void load({ soft: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab only
  }, [tab])

  useEffect(() => {
    if (!selected) {
      setEvents([])
      return
    }
    void circulationService.getTimeline(selected.id).then(setEvents).catch(() => setEvents([]))
  }, [selected])

  function resetForm() {
    setSelected(null)
    setReceiverMatr('')
    setNumFolio('')
    setNote('')
    setDocUrl(null)
    setPageCount(null)
    setDocLoading(false)
  }

  async function selectCirculation(item: Circulation, nextTab?: Tab) {
    setActionSuccess(null)
    setActionError(null)
    setReceiverMatr('')
    setNote('')
    setDocUrl(null)
    setPageCount(null)
    if (nextTab) setTab(nextTab)

    let claimed = item
    try {
      // Prise en charge exclusive : les collègues ne voient plus ce courrier
      claimed = await circulationService.claimCirculation(item.id)
      setSelected(claimed)
      // Retirer des files locales les items pris par soi (rafraîchir l’état)
      setAOrienter((prev) =>
        prev.map((c) => (c.id === claimed.id ? claimed : c)),
      )
      setAExpedier((prev) =>
        prev.map((c) => (c.id === claimed.id ? claimed : c)),
      )
    } catch (err) {
      setSelected(null)
      setActionError(
        err instanceof Error
          ? err.message
          : 'Impossible de prendre en charge ce courrier',
      )
      await load({ soft: true })
      return
    }

    const existingFolio = claimed.archive?.num_folio?.trim() || ''
    setNumFolio(existingFolio)

    const filePath = claimed.archive?.file_path
    if (!filePath) {
      setActionError('Aucun fichier PDF attaché à ce courrier.')
      return
    }

    setDocLoading(true)
    try {
      const url = await circulationService.getFileUrl(filePath)
      if (!url) throw new Error('Impossible de charger le document PDF.')
      setDocUrl(url)

      const pages = await countPdfPages(url)
      setPageCount(pages)
      // Par défaut : dernier numéro de page = nombre de pages du document chargé
      if (!existingFolio) {
        setNumFolio(String(pages))
      }
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Échec du chargement du document / décompte des pages',
      )
    } finally {
      setDocLoading(false)
    }
  }

  function removeFromQueues(circulationId: string) {
    setAOrienter((prev) => prev.filter((c) => c.id !== circulationId))
    setAExpedier((prev) => prev.filter((c) => c.id !== circulationId))
  }

  async function transmitToAgent(source: 'orienter' | 'expedier') {
    if (!selected) return
    if (!receiverMatr) {
      setActionError('Choisissez l’agent concerné (destinataire).')
      return
    }

    setActionLoading(true)
    setActionError(null)
    setActionSuccess(null)
    const circulationId = selected.id

    try {
      const result = await circulationService.assignToAgent({
        circulationId,
        receiverMatr,
        numFolio: numFolio || undefined,
        noteInstruction: note || undefined,
      })

      removeFromQueues(circulationId)
      const agentName =
        agents.find((a) => a.matr === receiverMatr)?.full_name ??
        result.archive?.recepteur ??
        'l’agent concerné'
      setProof({
        kind: 'sec_to_agent',
        title: 'Transmission au destinataire',
        concerne: selected.archive?.concerne,
        reference: selected.archive?.reference,
        fromLabel:
          profile.direction?.libelle
            ? `Secrétariat ${profile.direction.libelle}`
            : 'Secrétariat',
        toLabels: [agentName],
        note: note || undefined,
      })
      setProofOpen(true)
      resetForm()
      setActionSuccess(
        `Document transmis à ${agentName}.`,
      )
      // Actualisation complète des files
      await load({ soft: true })
      if (source === 'orienter') setTab('orienter')
      else setTab('expedier')
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Échec de la transmission',
      )
    } finally {
      setActionLoading(false)
    }
  }

  async function handleOrient(e: React.FormEvent) {
    e.preventDefault()
    await transmitToAgent('orienter')
  }

  async function handleExpedier(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return

    const sameDirection =
      !selected.receiver_direction_id ||
      selected.receiver_direction_id === profile.direction_id

    // Même direction ou agent choisi → transmission à l'agent
    if (sameDirection || receiverMatr) {
      await transmitToAgent('expedier')
      return
    }

    // Inter-directions sans agent : bascule vers secrétariat cible
    if (!selected.receiver_direction_id) {
      setActionError('Destination invalide.')
      return
    }

    setActionLoading(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      await circulationService.expedierVersDirection(
        selected.id,
        selected.receiver_direction_id,
      )
      const destDir =
        directions.find((d) => d.id === selected.receiver_direction_id)
          ?.libelle ?? 'direction destinataire'
      setProof({
        kind: 'sec_to_sec',
        title: 'Expédition inter-secrétariats',
        concerne: selected.archive?.concerne,
        reference: selected.archive?.reference,
        fromLabel:
          profile.direction?.libelle
            ? `Secrétariat ${profile.direction.libelle}`
            : 'Secrétariat émetteur',
        toLabels: [`Secrétariat ${destDir}`],
      })
      setProofOpen(true)
      removeFromQueues(selected.id)
      resetForm()
      setActionSuccess(`Courrier expédié vers ${destDir}.`)
      await load({ soft: true })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Échec de l’expédition')
    } finally {
      setActionLoading(false)
    }
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'vue', label: 'Tableau de bord' },
    { id: 'orienter', label: 'À orienter', count: aOrienter.length },
    { id: 'expedier', label: 'À expédier', count: aExpedier.length },
    { id: 'folios', label: 'Registre folios', count: folios.length },
    { id: 'archiver', label: 'Archiver' },
    { id: 'envoyer_archives', label: 'Envoyer archives' },
    { id: 'rechercher', label: 'Rechercher' },
    { id: 'nettoyer', label: 'Nettoyer' },
    { id: 'lecture', label: 'Lecture PDF' },
    { id: 'rapport', label: 'Rapport' },
    { id: 'demande_archives', label: 'Demande Archives' },
    { id: 'messagerie', label: 'Messagerie Sec_*', count: undefined },
    { id: 'agenda', label: 'Agenda du Chef' },
    { id: 'creer', label: 'Nouveau courrier' },
  ]

  const archiveGroups = groupedArchiveOptions(secArchives)
  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2'

  async function handleSecArchive(e: React.FormEvent) {
    e.preventDefault()
    if (!secFile || !secConcerne || !secReference.trim() || !secEmplacement) {
      setActionError('Objet, référence, emplacement et fichier sont obligatoires.')
      return
    }
    if (!entite) {
      setActionError('Sélectionnez l’entité / instance de provenance.')
      return
    }
    setSecSaving(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      const archived = await circulationService.registerSecretariatArchive({
        concerne: secConcerne,
        reference: secReference.trim(),
        emplacement: secEmplacement,
        emetteur: secEmetteur || undefined,
        recepteur: secRecepteur || undefined,
        numFolio: secFolio || undefined,
        entite,
        file: secFile,
      })
      setActionSuccess(
        `Document archivé (réf. ${archived.reference}) — ${entite} — création ${format.date(today)} — âge ${formatDocumentAge(today)}.`,
      )
      setSecConcerne('')
      setSecReference('')
      setSecEmplacement('')
      setSecEmetteur('')
      setSecRecepteur('')
      setSecFolio('')
      setSecFile(null)
      await load({ soft: true })
      setTab('rechercher')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Échec archivage')
    } finally {
      setSecSaving(false)
    }
  }

  async function handleSecDispatch(e: React.FormEvent) {
    e.preventDefault()
    if (!dispatchArchiveId || !dispatchDirId) return
    setSecSaving(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      await circulationService.dispatchArchiveToDirection({
        archiveId: Number(dispatchArchiveId),
        receiverDirectionId: dispatchDirId,
        note: dispatchNote || undefined,
      })
      const dir = directions.find((d) => d.id === dispatchDirId)
      const arch = secArchives.find((a) => a.id === Number(dispatchArchiveId))
      const isArchives =
        /document|archiv/i.test(dir?.libelle ?? '') ||
        /document|archiv/i.test(dir?.code ?? '')
      setProof({
        kind: isArchives ? 'sec_to_archives' : 'sec_to_sec',
        title: isArchives
          ? 'Envoi vers Documentation & Archives'
          : 'Envoi d’archive vers un secrétariat',
        concerne: arch?.concerne,
        reference: arch?.reference,
        fromLabel:
          profile.direction?.libelle
            ? `Secrétariat ${profile.direction.libelle}`
            : 'Secrétariat',
        toLabels: [
          isArchives
            ? 'Documentation & Archives'
            : `Secrétariat ${dir?.libelle ?? 'cible'}`,
        ],
        note: dispatchNote || undefined,
      })
      setProofOpen(true)
      setActionSuccess(
        `Archive envoyée au secrétariat de ${dir?.libelle ?? 'la direction'} (partage par envoi).`,
      )
      setDispatchArchiveId('')
      setDispatchDirId('')
      setDispatchNote('')
      await load({ soft: true })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Échec envoi')
    } finally {
      setSecSaving(false)
    }
  }

  if (!profile.direction_id && !profile.secretariat_code && !loading) {
    return (
      <div className="space-y-4">
        <DashboardHeader
          eyebrow="Secrétariat de direction"
          title="Parapheur virtuel"
          subtitle="Affectation de bureau Sec_* / direction requise"
        />
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800">
          Aucun bureau secrétariat (Sec_Adg, Sec_Df, …) ni direction n’est
          rattaché à votre profil. Contactez le Superuser pour renseigner le
          profil TbLogin / secretariat_code, puis actualisez.
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </button>
      </div>
    )
  }

  const agentSelect = (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        Destinataire concerné (agent)
      </span>
      <select
        required
        value={receiverMatr}
        onChange={(e) => setReceiverMatr(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
      >
        <option value="">Choisir un agent…</option>
        {agents.map((a) => (
          <option key={a.matr} value={a.matr}>
            {a.full_name} — {a.fonction ?? a.service_libelle ?? a.matr}
          </option>
        ))}
      </select>
      {agents.length === 0 && (
        <p className="mt-1 text-xs text-amber-700">
          Aucun agent trouvé pour votre direction. Vérifiez l’affectation du profil.
        </p>
      )}
    </label>
  )

  return (
    <div className="space-y-6">
      <DashboardHeader
        eyebrow="Secrétariat de direction"
        title="Parapheur virtuel"
        subtitle={`Réception, orientation et expédition — ${
          profile.secretariat_code
            ? (SECRETARIAT_CODE_LABELS[
                profile.secretariat_code as SecretariatCode
              ] ?? profile.secretariat_code)
            : (profile.direction?.libelle ?? 'Direction')
        }`}
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <EntiteFilter
          value={entite}
          options={entites}
          onChange={setEntite}
          required
          label="Entité / instance (filtre listes, agents & archivage)"
          className="max-w-md"
        />
        {!entite && (
          <p className="mt-2 text-xs text-amber-700">
            Sélectionnez une entité pour n’afficher que les documents et agents
            actifs de cette instance.
          </p>
        )}
      </div>

      {(actionSuccess || actionError) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            actionSuccess
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {actionSuccess ?? actionError}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpi
          icon={Inbox}
          label="À orienter"
          value={kpiOrienter}
          hint="Courriers entrants à diriger (direction)"
          tone="amber"
        />
        <DashboardKpi
          icon={Send}
          label="À expédier"
          value={kpiExpedier}
          hint="Sorties / transmissions (direction)"
          tone="sky"
        />
        <DashboardKpi
          icon={BookOpen}
          label="Folios"
          value={folios.length}
          hint={
            entite
              ? `Registre de la direction · ${entite}`
              : 'Registre de la direction'
          }
        />
        <DashboardKpi
          icon={ArchiveIcon}
          label="Archivés"
          value={secArchives.length}
          hint={
            entite
              ? `Archives du secrétariat · ${entite}`
              : 'Documents archivés dans ce compte secrétariat'
          }
          tone="slate"
        />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setActionSuccess(null)
                setActionError(null)
              }}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'border-teal-700 text-teal-800'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'vue' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-800">Priorité — à orienter</h3>
            <CirculationList
              items={aOrienter.slice(0, 5)}
              emptyLabel="Rien à orienter"
              onSelect={(item) => {
                void selectCirculation(item, 'orienter')
              }}
            />
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-800">Priorité — à expédier</h3>
            <CirculationList
              items={aExpedier.slice(0, 5)}
              emptyLabel="Rien à expédier"
              onSelect={(item) => {
                void selectCirculation(item, 'expedier')
              }}
            />
          </div>
        </div>
      )}

      {tab === 'creer' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-800">
            <PenLine className="h-4 w-4 text-teal-700" />
            Initier un courrier
          </div>
          <CreateDocumentForm
            profile={profile}
            onCreated={() => {
              void (async () => {
                setActionSuccess('Document créé.')
                await load({ soft: true })
                setTab('expedier')
              })()
            }}
          />
        </div>
      )}

      {(tab === 'orienter' || tab === 'expedier') && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {tab === 'orienter' ? (
              <CirculationList
                items={aOrienter}
                emptyLabel="Aucun courrier en attente d’orientation"
                onSelect={(item) => {
                  void selectCirculation(item)
                }}
              />
            ) : (
              <CirculationList
                items={aExpedier}
                emptyLabel="Aucun courrier à expédier"
                onSelect={(item) => {
                  void selectCirculation(item)
                }}
                actionSlot={(item) => (
                  <button
                    type="button"
                    onClick={() => {
                      void selectCirculation(item)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-teal-800 px-2.5 py-1.5 text-xs text-white hover:bg-teal-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Traiter
                  </button>
                )}
              />
            )}
          </div>

          <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-medium text-slate-900">
              {tab === 'orienter' ? 'Orientation' : 'Transmission'}
            </h3>

            {actionSuccess && (
              <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
                {actionSuccess}
              </p>
            )}
            {actionError && !selected && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </p>
            )}

            {!selected ? (
              <p className="text-sm text-slate-500">Sélectionnez un courrier.</p>
            ) : (
              <>
                <div>
                  <p className="text-lg font-medium text-slate-900">
                    {selected.archive?.concerne}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Émetteur : {selected.sender?.full_name ?? selected.sender_matr ?? '—'}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <FileText className="h-3.5 w-3.5" />
                    Document
                  </div>
                  {docLoading && (
                    <p className="text-sm text-slate-500">Chargement du PDF…</p>
                  )}
                  {!docLoading && pageCount != null && (
                    <p className="mb-2 text-sm text-teal-800">
                      {pageCount} page{pageCount > 1 ? 's' : ''} — folio prérempli avec le
                      dernier numéro de page
                    </p>
                  )}
                  {docUrl ? (
                    <iframe
                      title="Aperçu PDF"
                      src={docUrl}
                      className="h-56 w-full rounded-md border border-slate-200 bg-white"
                    />
                  ) : (
                    !docLoading && (
                      <p className="text-sm text-slate-500">Aperçu indisponible.</p>
                    )
                  )}
                </div>

                <form
                  onSubmit={tab === 'orienter' ? handleOrient : handleExpedier}
                  className="space-y-3 border-t border-slate-100 pt-4"
                >
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                      Numéro de folio
                    </span>
                    <input
                      value={numFolio}
                      onChange={(e) => setNumFolio(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                      placeholder={
                        docLoading
                          ? 'Calcul du nombre de pages…'
                          : pageCount != null
                            ? String(pageCount)
                            : 'Ex. 4'
                      }
                      inputMode="numeric"
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Par défaut : nombre de pages du document chargé
                      {pageCount != null ? ` (${pageCount})` : ''}
                    </span>
                  </label>

                  {agentSelect}

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                      Instruction
                    </span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                    />
                  </label>

                  {actionError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      {actionError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={actionLoading || !receiverMatr}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                  >
                    {tab === 'orienter' ? (
                      <Forward className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {actionLoading
                      ? 'Transmission…'
                      : tab === 'orienter'
                        ? 'Orienter vers l’agent'
                        : 'Transmettre à l’agent'}
                  </button>
                </form>

                <div className="border-t border-slate-100 pt-4">
                  <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Chronologie
                  </h4>
                  <DocumentTimeline events={events} />
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {tab === 'folios' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="font-medium text-slate-900">Registre des folios</h3>
            <p className="text-xs text-slate-500">
              Documents liés à votre direction / traités
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {folios.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Aucun folio enregistré.
              </p>
            )}
            {folios.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{f.concerne}</p>
                  <p className="text-xs text-slate-500">
                    Folio {f.num_folio || '—'} · {format.date(f.date_creation || f.date_doc)}
                    {' · Âge '}
                    {formatDocumentAge(f.date_creation || f.date_doc)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'archiver' && (
        <form
          onSubmit={(e) => void handleSecArchive(e)}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="inline-flex items-center gap-2 font-medium text-slate-900">
              <ArchiveIcon className="h-4 w-4 text-[#0f4c75]" />
              Archiver (secrétariat)
            </h3>
            <p className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-[#0f4c75]">
              Création : <strong>{format.date(today)}</strong> · Âge :{' '}
              <strong>{formatDocumentAge(today)}</strong>
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Documents visibles uniquement par votre secrétariat, jusqu’à envoi
            ordonné vers une autre direction.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <EntiteFilter
              value={entite}
              options={entites}
              onChange={setEntite}
              required
              className="sm:col-span-2"
            />
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Objet / concerne
              </span>
              <input
                required
                className={field}
                value={secConcerne}
                onChange={(e) => setSecConcerne(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Référence (unique secrétariat)
              </span>
              <input
                required
                className={field}
                value={secReference}
                onChange={(e) => setSecReference(e.target.value)}
                list="sec-refs"
              />
              <datalist id="sec-refs">
                {secArchives
                  .map((a) => a.reference)
                  .filter(Boolean)
                  .map((r) => (
                    <option key={r!} value={r!} />
                  ))}
              </datalist>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Emplacement
              </span>
              <select
                required
                className={field}
                value={secEmplacement}
                onChange={(e) => setSecEmplacement(e.target.value)}
              >
                <option value="">Choisir…</option>
                {emplacements.map((em) => (
                  <option key={em.id} value={em.libelle}>
                    {em.code} — {em.libelle}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Expéditeur
              </span>
              <input
                className={field}
                value={secEmetteur}
                onChange={(e) => setSecEmetteur(e.target.value)}
                placeholder={profile.full_name}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Destinataire
              </span>
              <input
                className={field}
                value={secRecepteur}
                onChange={(e) => setSecRecepteur(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Folio
              </span>
              <input
                className={field}
                value={secFolio}
                onChange={(e) => setSecFolio(e.target.value)}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Fichier
              </span>
              <input
                required
                type="file"
                accept={ACCEPTED_DOCUMENT_ACCEPT}
                onChange={(e) => setSecFile(e.target.files?.[0] ?? null)}
                className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#0f4c75] file:px-3 file:py-1.5 file:text-sm file:text-white"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={secSaving || !secFile}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c75] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0c3d5e] disabled:opacity-60"
          >
            {secSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArchiveIcon className="h-4 w-4" />
            )}
            Archiver
          </button>
        </form>
      )}

      {tab === 'envoyer_archives' && (
        <form
          onSubmit={(e) => void handleSecDispatch(e)}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <h3 className="font-medium text-slate-900">
            Envoyer une archive (ordre du secrétariat)
          </h3>
          <p className="text-sm text-slate-500">
            Partage = envoi : Documentation / autres directions ne voient le
            document qu’après cet envoi.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Archive du secrétariat
            </span>
            <select
              required
              className={field}
              value={dispatchArchiveId}
              onChange={(e) => setDispatchArchiveId(e.target.value)}
            >
              <option value="">Choisir…</option>
              {archiveGroups.map((g) => (
                <optgroup key={g.label} label={`Année ${g.label}`}>
                  {g.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Direction destinataire
            </span>
            <select
              required
              className={field}
              value={dispatchDirId}
              onChange={(e) => setDispatchDirId(e.target.value)}
            >
              <option value="">Choisir…</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Note
            </span>
            <textarea
              className={field}
              rows={2}
              value={dispatchNote}
              onChange={(e) => setDispatchNote(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={secSaving || !dispatchArchiveId || !dispatchDirId}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c75] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {secSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Envoyer
          </button>
        </form>
      )}

      {tab === 'rechercher' && (
        <ArchivesSearchPanel
          profile={profile}
          scope="secretariat"
          emplacementOptions={emplacements.map((e) => e.libelle)}
          lockedEntite={entite || undefined}
        />
      )}

      {tab === 'nettoyer' && (
        <CadreArchivesTools
          profile={profile}
          mode="nettoyer"
          scope="secretariat"
          onDone={() => void load({ soft: true })}
        />
      )}

      {tab === 'rapport' && <DocumentReport profile={profile} />}
      {tab === 'demande_archives' && (
        <DemandeDocRequesterPanel profile={profile} />
      )}
      {tab === 'messagerie' && (
        <SecretariatMessageriePanel profile={profile} />
      )}
      {tab === 'agenda' && <AgendaChefPanel profile={profile} />}
      {tab === 'lecture' && <DocumentPdfReader profile={profile} />}

      <TransferProofModal
        open={proofOpen}
        payload={proof}
        onClose={() => setProofOpen(false)}
      />
    </div>
  )
}
