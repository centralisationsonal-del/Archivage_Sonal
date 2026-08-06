import { useCallback, useEffect, useState } from 'react'
import { CirculationList } from '@/modules/ged/components/CirculationList'
import { CreateDocumentForm } from '@/modules/ged/components/CreateDocumentForm'
import { DocumentTimeline } from '@/modules/ged/components/DocumentTimeline'
import { circulationService } from '@/services/circulationService'
import type { Circulation, CirculationEvent, Profile } from '@/types/ged'
import { CheckCheck, Inbox, PenLine, Send } from 'lucide-react'

interface Props {
  profile: Profile
}

type Tab = 'inbox' | 'outbox' | 'create'

export function CadreView({ profile }: Props) {
  const [tab, setTab] = useState<Tab>('inbox')
  const [inbox, setInbox] = useState<Circulation[]>([])
  const [outbox, setOutbox] = useState<Circulation[]>([])
  const [selected, setSelected] = useState<Circulation | null>(null)
  const [events, setEvents] = useState<CirculationEvent[]>([])

  const load = useCallback(async () => {
    const [inItems, outItems] = await Promise.all([
      circulationService.getInbox(profile.id, profile.matr),
      circulationService.getOutbox(profile.id),
    ])
    setInbox(inItems)
    setOutbox(outItems)
  }, [profile.id, profile.matr])

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

  async function markReceived(item: Circulation) {
    await circulationService.markReceived(item.id)
    await load()
  }

  async function markTraite(item: Circulation) {
    await circulationService.markTraite(item.id)
    await load()
  }

  const tabs: { id: Tab; label: string; icon: typeof Inbox }[] = [
    { id: 'inbox', label: 'Boîte de réception', icon: Inbox },
    { id: 'outbox', label: 'Boîte d’envoi', icon: Send },
    { id: 'create', label: 'Nouveau document', icon: PenLine },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-slate-900">Espace cadre</h2>
        <p className="mt-1 text-sm text-slate-500">
          {profile.full_name}
          {profile.service ? ` — ${profile.service.libelle}` : ''}
          {profile.direction ? ` · ${profile.direction.libelle}` : ''}
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
            </button>
          )
        })}
      </div>

      {tab === 'create' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <CreateDocumentForm profile={profile} onCreated={() => { void load(); setTab('outbox') }} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {tab === 'inbox' && (
              <CirculationList
                items={inbox}
                emptyLabel="Votre boîte de réception est vide"
                onSelect={setSelected}
                actionSlot={(item) => (
                  <div className="flex gap-2">
                    {item.status === 'oriente' && (
                      <button
                        type="button"
                        onClick={() => void markReceived(item)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-white"
                      >
                        Réceptionner
                      </button>
                    )}
                    {(item.status === 'recu' || item.status === 'oriente') && (
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
                items={outbox}
                emptyLabel="Aucun envoi pour le moment"
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
                  <p className="font-medium text-slate-900">{selected.archive?.concerne}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {selected.archive?.reference ?? 'Sans référence'}
                  </p>
                </div>
                <DocumentTimeline events={events} />
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
