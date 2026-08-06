import { useCallback, useEffect, useState } from 'react'
import { CirculationList } from '@/modules/ged/components/CirculationList'
import { CreateDocumentForm } from '@/modules/ged/components/CreateDocumentForm'
import {
  DashboardHeader,
  DashboardKpi,
} from '@/modules/ged/components/DashboardShared'
import { DocumentPdfReader } from '@/modules/ged/components/DocumentPdfReader'
import { DocumentReport } from '@/modules/ged/components/DocumentReport'
import { DocumentTimeline } from '@/modules/ged/components/DocumentTimeline'
import { useAuth } from '@/contexts/AuthContext'
import { circulationService } from '@/services/circulationService'
import { format } from '@/lib/format'
import { countPdfPages } from '@/lib/pdfPages'
import type { Archive, Circulation, CirculationEvent, GedAgent, Profile } from '@/types/ged'
import {
  BookOpen,
  Clock3,
  FileText,
  Forward,
  Inbox,
  PenLine,
  RefreshCw,
  Send,
} from 'lucide-react'

interface Props {
  profile: Profile
}

type Tab = 'vue' | 'orienter' | 'expedier' | 'folios' | 'lecture' | 'rapport' | 'creer'

export function SecretariatDashboard({ profile: initialProfile }: Props) {
  const { refreshProfile } = useAuth()
  const [profile, setProfile] = useState(initialProfile)
  const [tab, setTab] = useState<Tab>('vue')
  const [aOrienter, setAOrienter] = useState<Circulation[]>([])
  const [aExpedier, setAExpedier] = useState<Circulation[]>([])
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

  useEffect(() => {
    setProfile(initialProfile)
  }, [initialProfile])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Recharger le profil (ex. direction réparée côté BDD)
      const fresh = await circulationService.getCurrentProfile()
      if (fresh) {
        setProfile(fresh)
        await refreshProfile()
      }
      const directionId = fresh?.direction_id ?? initialProfile.direction_id
      if (!directionId) {
        setAOrienter([])
        setAExpedier([])
        setFolios([])
        setAgents([])
        return
      }

      const [queue, folioRows, agentRows] = await Promise.all([
        circulationService.getSecretariatQueue(directionId),
        circulationService.getFolioRegister(directionId),
        circulationService.listAgents({
          directionId,
          directionLibelle: fresh?.direction?.libelle ?? initialProfile.direction?.libelle,
        }),
      ])

      setAOrienter(queue.aOrienter)
      setAExpedier(queue.aExpedier)
      setFolios(folioRows)
      setAgents(agentRows)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [initialProfile.direction_id, initialProfile.direction?.libelle, refreshProfile])

  useEffect(() => {
    void load()
  }, [load])

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
    setSelected(item)
    setActionSuccess(null)
    setActionError(null)
    setReceiverMatr('')
    setNote('')
    setDocUrl(null)
    setPageCount(null)
    if (nextTab) setTab(nextTab)

    const existingFolio = item.archive?.num_folio?.trim() || ''
    setNumFolio(existingFolio)

    const filePath = item.archive?.file_path
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
      resetForm()
      setActionSuccess(
        `Document transmis à ${result.archive?.recepteur ?? 'l’agent concerné'}.`,
      )
      // Actualisation complète des files
      await load()
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
      removeFromQueues(selected.id)
      resetForm()
      setActionSuccess('Courrier expédié vers la direction destinataire.')
      await load()
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
    { id: 'lecture', label: 'Lecture PDF' },
    { id: 'rapport', label: 'Rapport' },
    { id: 'creer', label: 'Nouveau courrier' },
  ]

  if (!profile.direction_id && !loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800">
          Aucune direction n’est rattachée à votre profil secrétariat. Contactez le
          superuser pour l’affectation, puis actualisez.
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
        subtitle={`Réception, orientation et expédition — ${profile.direction?.libelle ?? 'Direction'}`}
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
          value={aOrienter.length}
          hint="Courriers entrants à diriger"
          tone="amber"
        />
        <DashboardKpi
          icon={Send}
          label="À expédier"
          value={aExpedier.length}
          hint="Sorties / transmissions"
          tone="sky"
        />
        <DashboardKpi
          icon={BookOpen}
          label="Folios"
          value={folios.length}
          hint="Registre de la direction"
        />
        <DashboardKpi
          icon={Clock3}
          label="En file"
          value={aOrienter.length + aExpedier.length}
          hint="Charge totale du parapheur"
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
                await load()
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
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Concerne</th>
                <th className="px-4 py-3">Référence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {folios.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    Aucun folio enregistré
                  </td>
                </tr>
              ) : (
                folios.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-teal-800">{f.num_folio}</td>
                    <td className="px-4 py-3 text-slate-600">{format.date(f.date_doc)}</td>
                    <td className="px-4 py-3 text-slate-800">{f.concerne}</td>
                    <td className="px-4 py-3 text-slate-500">{f.reference ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rapport' && <DocumentReport profile={profile} />}

      {tab === 'lecture' && <DocumentPdfReader profile={profile} />}
    </div>
  )
}
