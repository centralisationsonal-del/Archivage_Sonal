import { useCallback, useEffect, useMemo, useState } from 'react'
import { CirculationList } from '@/modules/ged/components/CirculationList'
import { CreateDocumentForm } from '@/modules/ged/components/CreateDocumentForm'
import {
  DashboardHeader,
  DashboardKpi,
} from '@/modules/ged/components/DashboardShared'
import { DocumentPdfReader, PdfPreviewPanel } from '@/modules/ged/components/DocumentPdfReader'
import { DocumentReport } from '@/modules/ged/components/DocumentReport'
import { DocumentTimeline } from '@/modules/ged/components/DocumentTimeline'
import { circulationService } from '@/services/circulationService'
import type { Circulation, CirculationEvent, Profile } from '@/types/ged'
import {
  CheckCheck,
  Inbox,
  PenLine,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react'

interface Props {
  profile: Profile
  /** Variante d’affichage selon le rôle */
  variant?: 'cadre' | 'chef_service' | 'directeur'
}

type Tab = 'vue' | 'inbox' | 'outbox' | 'cc' | 'lecture' | 'rapport' | 'create'

export function CadreDashboard({ profile, variant = 'cadre' }: Props) {
  const [tab, setTab] = useState<Tab>('vue')
  const [inbox, setInbox] = useState<Circulation[]>([])
  const [outbox, setOutbox] = useState<Circulation[]>([])
  const [selected, setSelected] = useState<Circulation | null>(null)
  const [events, setEvents] = useState<CirculationEvent[]>([])
  const [loading, setLoading] = useState(true)

  const titles = {
    cadre: {
      eyebrow: 'Espace cadre',
      title: 'Boîte documentaire',
      subtitle: 'Création, réception et suivi de vos courriers (P2 / P3 / P4)',
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inItems, outItems] = await Promise.all([
        circulationService.getInbox(profile.id, profile.matr),
        circulationService.getOutbox(profile.id),
      ])
      setInbox(inItems)
      setOutbox(outItems)
    } finally {
      setLoading(false)
    }
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

  const directInbox = useMemo(
    () =>
      inbox.filter(
        (c) =>
          c.receiver_id === profile.id ||
          (profile.matr && c.receiver_matr === profile.matr),
      ),
    [inbox, profile.id, profile.matr],
  )

  const ccInbox = useMemo(
    () =>
      inbox.filter(
        (c) =>
          c.receiver_id !== profile.id &&
          c.receiver_matr !== profile.matr &&
          (c.cc_users?.includes(profile.id) ||
            (profile.matr != null && c.cc_matrs?.includes(profile.matr))),
      ),
    [inbox, profile.id, profile.matr],
  )

  const aTraiter = directInbox.filter((c) =>
    ['oriente', 'recu'].includes(c.status),
  ).length

  async function markReceived(item: Circulation) {
    await circulationService.markReceived(item.id)
    await load()
  }

  async function markTraite(item: Circulation) {
    await circulationService.markTraite(item.id)
    await load()
  }

  const showCcTab = variant === 'chef_service' || variant === 'directeur'

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'vue', label: 'Tableau de bord' },
    { id: 'inbox', label: 'Réception', count: directInbox.length },
    { id: 'outbox', label: 'Envois', count: outbox.length },
    ...(showCcTab
      ? [{ id: 'cc' as const, label: 'Copies conformes', count: ccInbox.length }]
      : []),
    { id: 'rapport', label: 'Rapport' },
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          value={outbox.length}
          hint="Documents que vous avez initiés"
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
              void load()
              setTab('outbox')
            }}
          />
        </div>
      )}

      {tab === 'rapport' && <DocumentReport profile={profile} />}

      {(tab === 'inbox' || tab === 'outbox' || tab === 'cc') && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {tab === 'inbox' && (
              <CirculationList
                items={directInbox}
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
                  </p>
                </div>
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

      {tab === 'lecture' && <DocumentPdfReader profile={profile} />}
    </div>
  )
}
