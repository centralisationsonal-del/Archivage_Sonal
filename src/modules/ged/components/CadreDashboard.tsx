import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CadreArchivesTools } from '@/modules/ged/components/CadreArchivesTools'
import { CirculationList } from '@/modules/ged/components/CirculationList'
import { CreateDocumentForm } from '@/modules/ged/components/CreateDocumentForm'
import { DemandeDocRequesterPanel } from '@/modules/ged/components/DemandeDocRequesterPanel'
import {
  DashboardHeader,
  DashboardKpi,
} from '@/modules/ged/components/DashboardShared'
import {
  EntiteFilter,
  useEntiteFilter,
} from '@/modules/ged/components/EntiteFilter'
import { DocumentPdfReader, PdfPreviewPanel } from '@/modules/ged/components/DocumentPdfReader'
import { DocumentReport } from '@/modules/ged/components/DocumentReport'
import { FinancialReport } from '@/modules/ged/components/FinancialReport'
import { DocumentTimeline } from '@/modules/ged/components/DocumentTimeline'
import { FieldHint } from '@/modules/ged/components/FieldHint'
import { SaveProgressBar } from '@/modules/ged/components/SaveProgressBar'
import { ringBellThreeTimes } from '@/lib/bellAlert'
import { format } from '@/lib/format'
import { formatDocumentAge } from '@/modules/ged/lib/archivePrivileges'
import { circulationService } from '@/services/circulationService'
import {
  AVIS_AVAL_LABELS,
  isDocumentFinancier,
  TYPE_DOCUMENT_LABELS,
  type AvalEtape,
  type AvisAval,
  type Circulation,
  type CirculationEvent,
  type Profile,
  type TypeDocument,
} from '@/types/ged'
import {
  Archive as ArchiveIcon,
  CheckCheck,
  Inbox,
  PenLine,
  RefreshCw,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  Users,
} from 'lucide-react'

interface Props {
  profile: Profile
  /** Variante d’affichage selon le rôle */
  variant?: 'cadre' | 'chef_service' | 'directeur'
}

type Tab =
  | 'vue'
  | 'inbox'
  | 'outbox'
  | 'cc'
  | 'rechercher'
  | 'archiver'
  | 'envoyer'
  | 'nettoyer'
  | 'lecture'
  | 'rapport'
  | 'rapport_financier'
  | 'demande_archives'
  | 'create'


export function CadreDashboard({ profile, variant = 'cadre' }: Props) {
  const [tab, setTab] = useState<Tab>('vue')
  const [inbox, setInbox] = useState<Circulation[]>([])
  const [outbox, setOutbox] = useState<Circulation[]>([])
  const [selected, setSelected] = useState<Circulation | null>(null)
  const [events, setEvents] = useState<CirculationEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [avalNote, setAvalNote] = useState('')
  const [avalProgress, setAvalProgress] = useState(0)
  const [avalLabel, setAvalLabel] = useState('')
  const [avalError, setAvalError] = useState<string | null>(null)
  const [avalSuccess, setAvalSuccess] = useState<string | null>(null)
  const [avalBusy, setAvalBusy] = useState(false)
  const [avalSteps, setAvalSteps] = useState<AvalEtape[]>([])

  const [qConcerne, setQConcerne] = useState('')
  const [qReference, setQReference] = useState('')
  const [archivesCount, setArchivesCount] = useState(0)
  const knownInboxIds = useRef<Set<string>>(new Set())
  const inboxPrimed = useRef(false)
  const profileRef = useRef(profile)
  profileRef.current = profile

  const loadEntites = useCallback(() => circulationService.listEntites(), [])
  const { entites, entite, setEntite } = useEntiteFilter(loadEntites)

  const titles = {
    cadre: {
      eyebrow: 'Espace cadre',
      title: 'Boîte documentaire',
      subtitle: 'Création, réception, archivage et suivi (P2 / P3 / P4)',
    },
    chef_service: {
      eyebrow: 'Chef de service',
      title: 'Pilotage de service',
      subtitle:
        'Vos courriers + copies conformes automatiques (P2 / P4) de votre service',
    },
    directeur: {
      eyebrow: 'Directeur de direction',
      title: 'Vue direction',
      subtitle:
        'Vos dossiers et copies conformes (P3 / P4) au niveau de la direction',
    },
  }[variant]

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true)
    try {
      const p = profileRef.current
      const [inItems, outItems, myArchives] = await Promise.all([
        circulationService.getInbox(p.id, p.matr),
        circulationService.getOutbox(p.id),
        circulationService.listMyArchives(p, 1000, {
          entite: entite || undefined,
        }),
      ])

      if (inboxPrimed.current) {
        const newOnes = inItems.filter((c) => !knownInboxIds.current.has(c.id))
        if (newOnes.length > 0) void ringBellThreeTimes()
      }
      knownInboxIds.current = new Set(inItems.map((c) => c.id))
      inboxPrimed.current = true

      setInbox(inItems)
      setOutbox(outItems)
      // listMyArchives filtre déjà par agent_archive_id pour cadre / chef / directeur
      setArchivesCount(myArchives.length)
    } catch (e) {
      console.error('Chargement boîte documentaire', e)
    } finally {
      if (!opts?.soft) setLoading(false)
    }
  }, [entite])

  const dashPrimedRef = useRef(false)

  useEffect(() => {
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
      setAvalSteps([])
      return
    }
    void circulationService.getTimeline(selected.id).then(setEvents)
    if (isDocumentFinancier(selected.archive?.type_document)) {
      void circulationService
        .listAvalEtapes(selected.id)
        .then(setAvalSteps)
        .catch(() => setAvalSteps([]))
    } else {
      setAvalSteps([])
    }
  }, [selected])

  const matchSearch = useCallback(
    (c: Circulation) => {
      const concerne = (c.archive?.concerne ?? '').toLowerCase()
      const reference = (c.archive?.reference ?? '').toLowerCase()
      const qC = qConcerne.trim().toLowerCase()
      const qR = qReference.trim().toLowerCase()
      if (qC && !concerne.includes(qC)) return false
      if (qR && !reference.includes(qR)) return false
      if (entite) {
        const e = (c.archive?.entite ?? '').toLowerCase()
        if (e !== entite.toLowerCase()) return false
      }
      return true
    },
    [qConcerne, qReference, entite],
  )

  const directInbox = useMemo(
    () =>
      inbox.filter(
        (c) =>
          (c.receiver_id === profile.id ||
            (profile.matr && c.receiver_matr === profile.matr) ||
            c.approver_id === profile.id ||
            (profile.matr != null && c.approver_matr === profile.matr)) &&
          matchSearch(c),
      ),
    [inbox, profile.id, profile.matr, matchSearch],
  )

  const ccInbox = useMemo(
    () =>
      inbox.filter(
        (c) =>
          c.receiver_id !== profile.id &&
          c.receiver_matr !== profile.matr &&
          c.approver_id !== profile.id &&
          c.approver_matr !== profile.matr &&
          (c.cc_users?.includes(profile.id) ||
            (profile.matr != null && c.cc_matrs?.includes(profile.matr))) &&
          matchSearch(c),
      ),
    [inbox, profile.id, profile.matr, matchSearch],
  )

  const filteredOutbox = useMemo(
    () => outbox.filter(matchSearch),
    [outbox, matchSearch],
  )

  const searchPool = useMemo(() => {
    const map = new Map<string, Circulation>()
    for (const c of [...inbox, ...outbox]) {
      if (matchSearch(c)) map.set(c.id, c)
    }
    return [...map.values()]
  }, [inbox, outbox, matchSearch])

  const aTraiter = directInbox.filter((c) =>
    ['oriente', 'recu', 'en_attente_aval'].includes(c.status),
  ).length

  async function markReceived(item: Circulation) {
    await circulationService.markReceived(item.id)
    await load({ soft: true })
  }

  async function markTraite(item: Circulation) {
    await circulationService.markTraite(item.id)
    await load({ soft: true })
  }

  async function giveAval(item: Circulation, avis: AvisAval) {
    setAvalBusy(true)
    setAvalError(null)
    setAvalSuccess(null)
    setAvalProgress(10)
    setAvalLabel('Enregistrement de l’aval…')
    try {
      const updated = await circulationService.submitAval({
        circulationId: item.id,
        avis,
        note: avalNote || undefined,
        onProgress: (pct, label) => {
          setAvalProgress(pct)
          setAvalLabel(label)
        },
      })
      setSelected(updated)
      const steps = await circulationService
        .listAvalEtapes(item.id)
        .catch(() => [] as AvalEtape[])
      setAvalSteps(steps)
      const next = steps.find((s) => s.is_current && !s.avis)
      setAvalSuccess(
        avis === 'defavorable'
          ? 'Avis défavorable — dossier clôturé.'
          : next
            ? `${AVIS_AVAL_LABELS[avis]} enregistré — prochaine étape : ${next.role_label}.`
            : `${AVIS_AVAL_LABELS[avis]} — chaîne d’aval terminée (aval autoritaire).`,
      )
      setAvalNote('')
      await load({ soft: true })
      const ev = await circulationService.getTimeline(item.id)
      setEvents(ev)
    } catch (e) {
      setAvalError(e instanceof Error ? e.message : 'Échec de l’aval')
      setAvalProgress(0)
    } finally {
      setAvalBusy(false)
    }
  }

  const showCcTab = variant === 'chef_service' || variant === 'directeur'

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'vue', label: 'Tableau de bord' },
    { id: 'inbox', label: 'Réception', count: directInbox.length },
    { id: 'outbox', label: 'Envois', count: filteredOutbox.length },
    ...(showCcTab
      ? [{ id: 'cc' as const, label: 'Copies conformes', count: ccInbox.length }]
      : []),
    { id: 'rechercher', label: 'Rechercher' },
    { id: 'archiver', label: 'Archiver' },
    { id: 'envoyer', label: 'Envoyer' },
    { id: 'nettoyer', label: 'Nettoyer' },
    { id: 'rapport', label: 'Rapport' },
    { id: 'rapport_financier', label: 'Rapport financier' },
    { id: 'demande_archives', label: 'Demande Archives' },
    { id: 'lecture', label: 'Lecture PDF' },
    { id: 'create', label: 'Nouveau document' },
  ]

  return (
    <div className="space-y-6">
      <DashboardHeader
        eyebrow={titles.eyebrow}
        title={titles.title}
        subtitle={`${titles.subtitle}${
          profile.service ? ` · ${profile.service.libelle}` : ''
        }${profile.direction ? ` · ${profile.direction.libelle}` : ''}`}
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

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <EntiteFilter
          value={entite}
          options={entites}
          onChange={setEntite}
          label="Entité / instance"
        />
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          Objet / concerne
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
            value={qConcerne}
            onChange={(e) => setQConcerne(e.target.value)}
            placeholder="Rechercher…"
          />
        </label>
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          Référence
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
            value={qReference}
            onChange={(e) => setQReference(e.target.value)}
            placeholder="Réf. document…"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setTab('rechercher')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Search className="h-4 w-4" />
            Voir résultats
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <DashboardKpi
          icon={Inbox}
          label="Réception"
          value={directInbox.length}
          hint="Courriers qui vous sont adressés"
          tone="amber"
        />
        <DashboardKpi
          icon={CheckCheck}
          label="À traiter"
          value={aTraiter}
          hint="Orientés ou déjà reçus"
          tone="sky"
        />
        <DashboardKpi
          icon={Send}
          label="Envois"
          value={filteredOutbox.length}
          hint="Documents que vous avez initiés"
        />
        <DashboardKpi
          icon={ArchiveIcon}
          label="Archivés"
          value={archivesCount}
          hint={
            entite
              ? `Documents archivés dans votre compte · ${entite}`
              : 'Documents archivés dans votre compte'
          }
          tone="sky"
        />
        <DashboardKpi
          icon={Users}
          label="En CC"
          value={ccInbox.length}
          hint={
            variant === 'cadre'
              ? 'Documents où vous êtes en copie'
              : 'Copies automatiques de parcours'
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
              onClick={() => setTab(t.id)}
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
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-800">Derniers reçus</h3>
            <CirculationList
              items={directInbox.slice(0, 6)}
              emptyLabel="Boîte de réception vide"
              onSelect={(item) => {
                setSelected(item)
                setTab('inbox')
              }}
            />
          </div>
          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-medium text-slate-800">Actions rapides</h3>
              <button
                type="button"
                onClick={() => setTab('create')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
              >
                <PenLine className="h-4 w-4" />
                Créer un document
              </button>
              <p className="mt-3 text-xs text-slate-500">
                P2 : même service · P3 : autre direction · P4 : autre service
                (via secrétariat)
              </p>
            </div>
            {showCcTab && ccInbox.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-800">CC récentes</h3>
                <CirculationList
                  items={ccInbox.slice(0, 4)}
                  emptyLabel="Aucune copie"
                  onSelect={(item) => {
                    setSelected(item)
                    setTab('cc')
                  }}
                />
              </div>
            )}
          </aside>
        </div>
      )}

      {tab === 'create' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <CreateDocumentForm
            profile={profile}
            onCreated={() => {
              void load({ soft: true })
              setTab('outbox')
            }}
          />
        </div>
      )}

      {tab === 'rapport' && <DocumentReport profile={profile} />}
      {tab === 'rapport_financier' && <FinancialReport profile={profile} />}
      {tab === 'demande_archives' && (
        <DemandeDocRequesterPanel profile={profile} />
      )}

      {(tab === 'inbox' || tab === 'outbox' || tab === 'cc') && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {tab === 'inbox' && (
              <CirculationList
                items={directInbox}
                emptyLabel="Votre boîte de réception est vide"
                onSelect={setSelected}
                actionSlot={(item) => (
                  <div className="flex flex-wrap gap-2">
                    {circulationService.canGiveAval(profile, item) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(item)
                          setAvalError(null)
                          setAvalSuccess(null)
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs text-white hover:bg-amber-500"
                      >
                        Aval requis
                      </button>
                    )}
                    {item.status === 'oriente' && (
                      <button
                        type="button"
                        onClick={() => void markReceived(item)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-white"
                      >
                        Réceptionner
                      </button>
                    )}
                    {(item.status === 'recu' || item.status === 'oriente') &&
                      !circulationService.canGiveAval(profile, item) && (
                      <button
                        type="button"
                        onClick={() => void markTraite(item)}
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-800 px-2.5 py-1.5 text-xs text-white hover:bg-teal-700"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Traiter
                      </button>
                    )}
                  </div>
                )}
              />
            )}
            {tab === 'outbox' && (
              <CirculationList
                items={filteredOutbox}
                emptyLabel="Aucun envoi pour le moment"
                onSelect={setSelected}
              />
            )}
            {tab === 'cc' && (
              <CirculationList
                items={ccInbox}
                emptyLabel="Aucune copie conforme"
                onSelect={setSelected}
              />
            )}
          </div>

          <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-medium text-slate-900">Fil d’Ariane</h3>
            {!selected ? (
              <p className="text-sm text-slate-500">
                Sélectionnez un document pour voir son parcours.
              </p>
            ) : (
              <>
                <div>
                  <p className="font-medium text-slate-900">
                    {selected.archive?.concerne}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {selected.archive?.reference ?? 'Sans référence'}
                    {selected.archive?.entite
                      ? ` · ${selected.archive.entite}`
                      : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Création{' '}
                    {format.date(
                      selected.archive?.date_creation ||
                        selected.archive?.date_doc ||
                        selected.created_at,
                    )}
                    {' · Âge '}
                    {formatDocumentAge(
                      selected.archive?.date_creation ||
                        selected.archive?.date_doc ||
                        selected.created_at,
                    )}
                  </p>
                  {isDocumentFinancier(selected.archive?.type_document) && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                      {
                        TYPE_DOCUMENT_LABELS[
                          (selected.archive?.type_document as TypeDocument) ||
                            'courrier'
                        ]
                      }
                      {selected.archive?.montant != null
                        ? ` · ${Number(selected.archive.montant).toLocaleString('fr-FR')} ${selected.archive.devise || 'CDF'}`
                        : ''}
                      {selected.avis_aval
                        ? ` · ${AVIS_AVAL_LABELS[selected.avis_aval]}`
                        : ' · En attente d’aval'}
                    </p>
                  )}
                </div>

                {avalSteps.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Chaîne d’aval
                    </p>
                    <ol className="space-y-1.5 text-xs text-slate-700">
                      {avalSteps.map((s) => (
                        <li
                          key={s.id}
                          className={
                            s.is_current && !s.avis
                              ? 'font-medium text-amber-900'
                              : s.avis
                                ? 'text-slate-600'
                                : 'text-slate-400'
                          }
                        >
                          {s.step_order}. {s.role_label}
                          {s.avis
                            ? ` — ${AVIS_AVAL_LABELS[s.avis]}${
                                s.actor_full_name
                                  ? ` (${s.actor_full_name})`
                                  : ''
                              }`
                            : s.is_current
                              ? ' — en cours'
                              : ' — en attente'}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {circulationService.canGiveAval(profile, selected) && (
                  <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                    <p className="text-sm font-medium text-amber-950">
                      Aval protégé
                      <FieldHint text="Seul le titulaire de l’étape courante peut signer. L’avis est irrévocable. Un avis défavorable clôture le dossier." />
                    </p>
                    {avalSteps.find((s) => s.is_current)?.role_label && (
                      <p className="text-xs text-amber-900">
                        Étape :{' '}
                        <strong>
                          {avalSteps.find((s) => s.is_current)?.role_label}
                        </strong>
                      </p>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium uppercase text-amber-900">
                        Motif / observation
                        <FieldHint text="Facultatif — précisez les raisons de votre avis." />
                      </span>
                      <textarea
                        value={avalNote}
                        onChange={(e) => setAvalNote(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-amber-500/30 focus:ring-2"
                        placeholder="Observation de l’autorité…"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={avalBusy}
                        onClick={() => void giveAval(selected, 'favorable')}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Favorable
                      </button>
                      <button
                        type="button"
                        disabled={avalBusy}
                        onClick={() => void giveAval(selected, 'defavorable')}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3 py-2 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        Défavorable
                      </button>
                    </div>
                    {(avalBusy || avalProgress > 0) && (
                      <SaveProgressBar
                        value={avalProgress}
                        label={avalLabel || 'Certification en cours…'}
                        tone={avalProgress >= 100 ? 'success' : 'aval'}
                      />
                    )}
                    {avalError && (
                      <p className="text-xs text-red-700">{avalError}</p>
                    )}
                    {avalSuccess && (
                      <p className="text-xs text-emerald-800">{avalSuccess}</p>
                    )}
                  </div>
                )}

                {selected.avis_aval && (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    Aval déjà certifié :{' '}
                    <strong>{AVIS_AVAL_LABELS[selected.avis_aval]}</strong>
                    {selected.avis_aval_note
                      ? ` — ${selected.avis_aval_note}`
                      : ''}
                    . Non modifiable.
                  </p>
                )}

                <DocumentTimeline events={events} />
                <div className="border-t border-slate-100 pt-4">
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Pièce jointe
                  </h4>
                  <PdfPreviewPanel
                    filePath={selected.archive?.file_path}
                    title={selected.archive?.nom_doc_phys ?? undefined}
                  />
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {tab === 'rechercher' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Résultats filtrés par objet / référence
            {entite ? ` · entité ${entite}` : ''} :{' '}
            <strong>{searchPool.length}</strong>
          </p>
          <CirculationList
            items={searchPool}
            emptyLabel="Aucun document trouvé pour ces critères"
            onSelect={(item) => {
              setSelected(item)
              setTab('inbox')
            }}
          />
        </div>
      )}

      {tab === 'archiver' && (
        <CadreArchivesTools
          profile={profile}
          mode="archiver"
          onDone={() => void load({ soft: true })}
        />
      )}
      {tab === 'envoyer' && (
        <CadreArchivesTools
          profile={profile}
          mode="envoyer"
          onDone={() => {
            void load({ soft: true })
            setTab('outbox')
          }}
        />
      )}
      {tab === 'nettoyer' && (
        <CadreArchivesTools
          profile={profile}
          mode="nettoyer"
          onDone={() => void load({ soft: true })}
        />
      )}

      {tab === 'lecture' && <DocumentPdfReader profile={profile} />}
    </div>
  )
}
