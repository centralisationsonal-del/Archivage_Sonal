import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArchivesPurgePanel } from '@/modules/ged/components/ArchivesPurgePanel'
import { ArchivesSearchPanel } from '@/modules/ged/components/ArchivesSearchPanel'
import { CirculationList } from '@/modules/ged/components/CirculationList'
import { CreateDocumentForm } from '@/modules/ged/components/CreateDocumentForm'
import { DocumentPdfReader, PdfPreviewPanel } from '@/modules/ged/components/DocumentPdfReader'
import { DocumentReport } from '@/modules/ged/components/DocumentReport'
import { DemandeDocRequesterPanel } from '@/modules/ged/components/DemandeDocRequesterPanel'
import { FinancialReport } from '@/modules/ged/components/FinancialReport'
import { DocumentTimeline } from '@/modules/ged/components/DocumentTimeline'
import { circulationService } from '@/services/circulationService'
import { format } from '@/lib/format'
import { formatDocumentAge } from '@/modules/ged/lib/archivePrivileges'
import {
  PARCOURS_LABELS,
  STATUS_LABELS,
  type Circulation,
  type CirculationEvent,
  type CirculationStatus,
  type GlobalDashboardData,
  type ParcoursType,
  type Profile,
} from '@/types/ged'
import { AgendaChefPanel } from '@/modules/ged/components/AgendaChefPanel'
import { BackupRestorePanel } from '@/modules/ged/components/BackupRestorePanel'
import { ProfileManagement } from '@/modules/ged/components/ProfileManagement'
import { DashboardHeader } from '@/modules/ged/components/DashboardShared'
import {
  Activity,
  ArrowRightLeft,
  BookOpen,
  Building2,
  CalendarDays,
  Clock3,
  Database,
  FileBarChart,
  FileStack,
  FileText,
  Filter,
  Megaphone,
  RefreshCw,
  Search,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react'

interface Props {
  profile: Profile
}

type Tab =
  | 'vue'
  | 'flux'
  | 'parcours'
  | 'folios'
  | 'rechercher'
  | 'purge'
  | 'rapport'
  | 'rapport_financier'
  | 'demande_archives'
  | 'lecture'
  | 'profils'
  | 'agenda'
  | 'sauvegarde'
  | 'diffusion'

const PARCOURS_ORDER: ParcoursType[] = ['P1', 'P2', 'P3', 'P4', 'BROADCAST']
const STATUS_ORDER: CirculationStatus[] = [
  'en_attente_orientation',
  'oriente',
  'recu',
  'traite',
  'repondu',
]

const PARCOURS_HINT: Record<ParcoursType, string> = {
  P1: 'Inter-directions via secrétariats',
  P2: 'Intra-direction, même service (CC chef)',
  P3: 'Inter-directions via cadres (CC directeur)',
  P4: 'Intra-direction, services différents (CC chefs + directeur)',
  BROADCAST: 'Diffusion DA → tous secrétariats',
}

export function SuperuserDashboard({ profile }: Props) {
  const [tab, setTab] = useState<Tab>('vue')
  const [data, setData] = useState<GlobalDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Circulation | null>(null)
  const [events, setEvents] = useState<CirculationEvent[]>([])
  const [filterParcours, setFilterParcours] = useState<ParcoursType | 'ALL'>('ALL')
  const [filterStatus, setFilterStatus] = useState<CirculationStatus | 'ALL'>('ALL')
  const [filterDirection, setFilterDirection] = useState<string>('ALL')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await circulationService.getGlobalDashboard())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selected) {
      setEvents([])
      return
    }
    void circulationService.getTimeline(selected.id).then(setEvents)
  }, [selected])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.allCirculations.filter((c) => {
      if (filterParcours !== 'ALL' && c.parcours_type !== filterParcours) return false
      if (filterStatus !== 'ALL' && c.status !== filterStatus) return false
      if (
        filterDirection !== 'ALL' &&
        c.sender_direction_id !== filterDirection &&
        c.receiver_direction_id !== filterDirection
      ) {
        return false
      }
      return true
    })
  }, [data, filterParcours, filterStatus, filterDirection])

  const pendingGlobal = data?.byStatus.en_attente_orientation ?? 0
  const inFlight =
    (data?.byStatus.oriente ?? 0) + (data?.byStatus.recu ?? 0)

  const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
    { id: 'vue', label: 'Vue globale', icon: Activity },
    { id: 'flux', label: 'Flux documentaire', icon: ArrowRightLeft },
    { id: 'parcours', label: 'Parcours P1–P4', icon: Filter },
    { id: 'folios', label: 'Registre folios', icon: BookOpen },
    { id: 'rechercher', label: 'Rechercher', icon: Search },
    { id: 'purge', label: 'Purge âge', icon: Trash2 },
    { id: 'rapport', label: 'Rapport', icon: FileBarChart },
    { id: 'rapport_financier', label: 'Financier', icon: FileBarChart },
    { id: 'demande_archives', label: 'Demande Archives', icon: FileText },
    { id: 'lecture', label: 'Lecture PDF', icon: FileText },
    { id: 'profils', label: 'Gestion profils', icon: UserCog },
    { id: 'agenda', label: 'Agenda du Chef', icon: CalendarDays },
    { id: 'sauvegarde', label: 'Sauvegarde & Restauration', icon: Database },
    { id: 'diffusion', label: 'Diffusion générale', icon: Megaphone },
  ]

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
        {error}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 underline"
        >
          Réessayer
        </button>
      </div>
    )
  }

  if (!data) return null

  const maxParcours = Math.max(...Object.values(data.byParcours), 1)
  const maxQueue = Math.max(
    ...data.directionQueues.map((d) => d.a_orienter + d.a_expedier),
    1,
  )

  return (
    <div className="space-y-6">
      <DashboardHeader
        eyebrow="Superuser"
        title="Pilotage GED"
        subtitle="Vue transverse des circulations inter/intra-directions, files secrétariat, parcours P1–P4 et diffusion générale."
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

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={FileStack}
          label="Circulations"
          value={data.totalCirculations}
          hint={`${pendingGlobal} en attente d’orientation`}
        />
        <Kpi
          icon={Clock3}
          label="En cours"
          value={inFlight}
          hint="Orientés ou reçus"
          tone="amber"
        />
        <Kpi
          icon={BookOpen}
          label="Folios enregistrés"
          value={data.totalFolios}
          hint={`${data.totalArchives} archives`}
        />
        <Kpi
          icon={Users}
          label="Agents RH actifs"
          value={data.totalAgents}
          hint={`${data.directionQueues.length} directions`}
        />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {tabs.map((t) => {
          const Icon = t.icon
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
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'vue' && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <Building2 className="h-4 w-4 text-teal-700" />
              Pression par direction
            </h3>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Direction</th>
                    <th className="px-4 py-3">À orienter</th>
                    <th className="px-4 py-3">À expédier</th>
                    <th className="px-4 py-3">En cours</th>
                    <th className="px-4 py-3">Traité</th>
                    <th className="px-4 py-3">Charge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.directionQueues.map((d) => {
                    const charge = d.a_orienter + d.a_expedier
                    return (
                      <tr key={d.direction_id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {d.libelle}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={d.a_orienter > 0 ? 'amber' : 'muted'}>
                            {d.a_orienter}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={d.a_expedier > 0 ? 'sky' : 'muted'}>
                            {d.a_expedier}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{d.en_cours}</td>
                        <td className="px-4 py-3 text-slate-600">{d.traites}</td>
                        <td className="px-4 py-3">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-teal-700"
                              style={{ width: `${(charge / maxQueue) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <h3 className="pt-2 text-sm font-medium text-slate-800">
              Derniers mouvements
            </h3>
            <CirculationList
              items={data.recent}
              emptyLabel="Aucune circulation pour le moment"
              onSelect={setSelected}
            />
          </section>

          <aside className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-4 text-sm font-medium text-slate-800">
                Répartition des statuts
              </h3>
              <ul className="space-y-3">
                {STATUS_ORDER.map((s) => (
                  <li key={s}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-600">{STATUS_LABELS[s]}</span>
                      <span className="font-medium text-slate-800">
                        {data.byStatus[s]}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-teal-600/80"
                        style={{
                          width: `${
                            data.totalCirculations
                              ? (data.byStatus[s] / data.totalCirculations) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-medium text-slate-800">
                Fil d’Ariane
              </h3>
              {!selected ? (
                <p className="text-sm text-slate-500">
                  Sélectionnez un courrier pour retracer son parcours jusqu’à
                  l’archivage.
                </p>
              ) : (
                <>
                  <p className="mb-3 font-medium text-slate-900">
                    {selected.archive?.concerne}
                  </p>
                  <DocumentTimeline events={events} />
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {tab === 'flux' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <select
              value={filterParcours}
              onChange={(e) =>
                setFilterParcours(e.target.value as ParcoursType | 'ALL')
              }
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="ALL">Tous les parcours</option>
              {PARCOURS_ORDER.map((p) => (
                <option key={p} value={p}>
                  {p} — {PARCOURS_LABELS[p]}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as CirculationStatus | 'ALL')
              }
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="ALL">Tous les statuts</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="ALL">Toutes les directions</option>
              {data.directionQueues.map((d) => (
                <option key={d.direction_id} value={d.direction_id}>
                  {d.libelle}
                </option>
              ))}
            </select>
            <span className="self-center text-xs text-slate-500">
              {filtered.length} document(s)
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <CirculationList
              items={filtered}
              emptyLabel="Aucun flux pour ces filtres"
              onSelect={setSelected}
            />
            <aside className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-medium text-slate-800">Chronologie</h3>
              {!selected ? (
                <p className="text-sm text-slate-500">Sélectionnez un document.</p>
              ) : (
                <>
                  <p className="mb-1 font-medium text-slate-900">
                    {selected.archive?.concerne}
                  </p>
                  <p className="mb-4 text-xs text-slate-500">
                    {PARCOURS_LABELS[selected.parcours_type]} ·{' '}
                    {STATUS_LABELS[selected.status]}
                  </p>
                  <DocumentTimeline events={events} />
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <PdfPreviewPanel
                      filePath={selected.archive?.file_path}
                      title={selected.archive?.nom_doc_phys ?? undefined}
                    />
                  </div>
                </>
              )}
            </aside>
          </div>
        </div>
      )}

      {tab === 'parcours' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PARCOURS_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setFilterParcours(p)
                setTab('flux')
              }}
              className="rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-teal-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">
                    {p}
                  </p>
                  <h3 className="mt-1 font-medium text-slate-900">
                    {PARCOURS_LABELS[p]}
                  </h3>
                </div>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-lg font-semibold text-slate-800">
                  {data.byParcours[p]}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-500">{PARCOURS_HINT[p]}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-700"
                  style={{
                    width: `${(data.byParcours[p] / maxParcours) * 100}%`,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      )}

      {tab === 'folios' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Âge</th>
                <th className="px-4 py-3">Concerne</th>
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Émetteur</th>
                <th className="px-4 py-3">Récepteur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.folios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    Aucun folio enregistré globalement
                  </td>
                </tr>
              ) : (
                data.folios.map((f) => {
                  const creation = f.date_creation || f.date_doc
                  return (
                    <tr key={f.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-teal-800">
                        {f.num_folio}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {format.date(creation)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDocumentAge(creation)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{f.concerne}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {f.reference ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{f.emetteur ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {f.recepteur ?? '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rechercher' && (
        <ArchivesSearchPanel
          profile={profile}
          scope="docs"
          lockedEntite={undefined}
        />
      )}

      {tab === 'purge' && <ArchivesPurgePanel onPurged={() => void load()} />}

      {tab === 'lecture' && <DocumentPdfReader profile={profile} />}

      {tab === 'rapport' && <DocumentReport profile={profile} />}
      {tab === 'rapport_financier' && <FinancialReport profile={profile} />}
      {tab === 'demande_archives' && (
        <DemandeDocRequesterPanel profile={profile} />
      )}

      {tab === 'profils' && <ProfileManagement currentUserId={profile.id} />}

      {tab === 'agenda' && <AgendaChefPanel profile={profile} />}

      {tab === 'sauvegarde' && <BackupRestorePanel profile={profile} />}

      {tab === 'diffusion' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Émission d’un document d’utilité commune adressé à l’ensemble des
            secrétariats (parcours BROADCAST).
          </p>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <CreateDocumentForm profile={profile} onCreated={() => void load()} />
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'teal',
}: {
  icon: typeof FileStack
  label: string
  value: number
  hint: string
  tone?: 'teal' | 'amber'
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <span
          className={`rounded-lg p-2 ${
            tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-800'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 font-display text-3xl text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  )
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'amber' | 'sky' | 'muted'
}) {
  const cls =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-800 ring-amber-200'
      : tone === 'sky'
        ? 'bg-sky-50 text-sky-800 ring-sky-200'
        : 'bg-slate-100 text-slate-600 ring-slate-200'
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {children}
    </span>
  )
}
