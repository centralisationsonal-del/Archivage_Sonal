import { useCallback, useEffect, useState } from 'react'
import { CirculationList } from '@/modules/ged/components/CirculationList'
import { DocumentTimeline } from '@/modules/ged/components/DocumentTimeline'
import { useDocumentWorkflow } from '@/modules/ged/useDocumentWorkflow'
import { circulationService } from '@/services/circulationService'
import { format } from '@/lib/format'
import type { Archive, Circulation, CirculationEvent, GedAgent, Profile } from '@/types/ged'
import { BookOpen, Forward, Inbox, Send } from 'lucide-react'

interface Props {
  profile: Profile
}

type Tab = 'orienter' | 'expedier' | 'folios'

export function SecretariatView({ profile }: Props) {
  const { orient, loading } = useDocumentWorkflow(profile)
  const [tab, setTab] = useState<Tab>('orienter')
  const [aOrienter, setAOrienter] = useState<Circulation[]>([])
  const [aExpedier, setAExpedier] = useState<Circulation[]>([])
  const [folios, setFolios] = useState<Archive[]>([])
  const [selected, setSelected] = useState<Circulation | null>(null)
  const [events, setEvents] = useState<CirculationEvent[]>([])
  const [agents, setAgents] = useState<GedAgent[]>([])
  const [receiverMatr, setReceiverMatr] = useState('')
  const [numFolio, setNumFolio] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    if (!profile.direction_id) return
    const queue = await circulationService.getSecretariatQueue(profile.direction_id)
    setAOrienter(queue.aOrienter)
    setAExpedier(queue.aExpedier)
    setFolios(await circulationService.getFolioRegister(profile.direction_id))
    setAgents(
      await circulationService.listAgents({ directionId: profile.direction_id }),
    )
  }, [profile.direction_id])

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

  async function handleOrient(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !receiverMatr) return
    await orient({
      circulationId: selected.id,
      receiverMatr,
      numFolio: numFolio || undefined,
      noteInstruction: note || undefined,
    })
    setSelected(null)
    setReceiverMatr('')
    setNumFolio('')
    setNote('')
    await load()
  }

  const tabs: { id: Tab; label: string; icon: typeof Inbox; count?: number }[] = [
    { id: 'orienter', label: 'Courrier à orienter', icon: Inbox, count: aOrienter.length },
    { id: 'expedier', label: 'Courrier à expédier', icon: Send, count: aExpedier.length },
    { id: 'folios', label: 'Registre des folios', icon: BookOpen, count: folios.length },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-slate-900">Parapheur virtuel</h2>
        <p className="mt-1 text-sm text-slate-500">
          Secrétariat — {profile.direction?.libelle ?? 'Direction'}
        </p>
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
              {typeof t.count === 'number' && (
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {tab === 'orienter' && (
            <CirculationList
              items={aOrienter}
              emptyLabel="Aucun courrier en attente d’orientation"
              onSelect={setSelected}
            />
          )}
          {tab === 'expedier' && (
            <CirculationList
              items={aExpedier}
              emptyLabel="Aucun courrier à expédier"
              onSelect={setSelected}
            />
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
        </div>

        <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-medium text-slate-900">Détail & orientation</h3>
          {!selected ? (
            <p className="text-sm text-slate-500">Sélectionnez un courrier pour le traiter.</p>
          ) : (
            <>
              <div>
                <p className="text-lg font-medium text-slate-900">
                  {selected.archive?.concerne}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Émetteur : {selected.sender?.full_name}
                </p>
              </div>

              <form onSubmit={handleOrient} className="space-y-3 border-t border-slate-100 pt-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Numéro de folio
                  </span>
                  <input
                    value={numFolio}
                    onChange={(e) => setNumFolio(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                    placeholder="Ex. 0042"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Orienter vers (agent RH)
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
                </label>
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
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                >
                  <Forward className="h-4 w-4" />
                  Orienter
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
    </div>
  )
}
