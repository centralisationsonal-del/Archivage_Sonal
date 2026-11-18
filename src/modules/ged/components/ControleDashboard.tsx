import { useCallback, useEffect, useMemo, useState } from 'react'
import { CirculationList } from '@/modules/ged/components/CirculationList'
import {
  DashboardHeader,
  DashboardKpi,
} from '@/modules/ged/components/DashboardShared'
import { DocumentPdfReader, PdfPreviewPanel } from '@/modules/ged/components/DocumentPdfReader'
import { DocumentReport } from '@/modules/ged/components/DocumentReport'
import { DemandeDocRequesterPanel } from '@/modules/ged/components/DemandeDocRequesterPanel'
import { FinancialReport } from '@/modules/ged/components/FinancialReport'
import { DocumentTimeline } from '@/modules/ged/components/DocumentTimeline'
import { FieldHint } from '@/modules/ged/components/FieldHint'
import { circulationService } from '@/services/circulationService'
import { format } from '@/lib/format'
import {
  AVIS_AVAL_LABELS,
  canEditFinancialDocs,
  isDocumentFinancier,
  STATUS_LABELS,
  TYPE_DOCUMENT_LABELS,
  type AvalEtape,
  type Circulation,
  type CirculationEvent,
  type Profile,
  type TypeDocument,
} from '@/types/ged'
import {
  Eye,
  FileSearch,
  Loader2,
  PencilLine,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
} from 'lucide-react'

interface Props {
  profile: Profile
}

type Tab =
  | 'vue'
  | 'tracabilite'
  | 'lecture'
  | 'rapport'
  | 'rapport_financier'
  | 'demande_archives'

export function ControleDashboard({ profile }: Props) {
  const [tab, setTab] = useState<Tab>('vue')
  const [items, setItems] = useState<Circulation[]>([])
  const [selected, setSelected] = useState<Circulation | null>(null)
  const [events, setEvents] = useState<CirculationEvent[]>([])
  const [avalSteps, setAvalSteps] = useState<AvalEtape[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    concerne: '',
    reference: '',
    montant: '',
    devise: 'CDF',
    emetteur: '',
    note: '',
  })

  const canEdit = canEditFinancialDocs(profile)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await circulationService.listControleCirculations(profile)
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selected) {
      setEvents([])
      setAvalSteps([])
      setEditMsg(null)
      return
    }
    void circulationService.getTimeline(selected.id).then(setEvents)
    if (isDocumentFinancier(selected.archive?.type_document)) {
      void circulationService
        .listAvalEtapes(selected.id)
        .then(setAvalSteps)
        .catch(() => setAvalSteps([]))
      setEditForm({
        concerne: selected.archive?.concerne ?? '',
        reference: selected.archive?.reference ?? '',
        montant:
          selected.archive?.montant != null
            ? String(selected.archive.montant)
            : '',
        devise: selected.archive?.devise || 'CDF',
        emetteur: selected.archive?.emetteur ?? '',
        note: '',
      })
    } else {
      setAvalSteps([])
    }
    setEditMsg(null)
  }, [selected])

  async function saveFinancialEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !canEdit) return
    setEditBusy(true)
    setEditMsg(null)
    setError(null)
    try {
      const updated = await circulationService.updateFinancialDocument({
        circulationId: selected.id,
        concerne: editForm.concerne.trim(),
        reference: editForm.reference.trim(),
        montant: editForm.montant ? Number(editForm.montant) : null,
        devise: editForm.devise,
        emetteur: editForm.emetteur.trim(),
        note: editForm.note.trim() || undefined,
      })
      setSelected(updated)
      setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setEditMsg('Document financier mis à jour (traçabilité enregistrée).')
      const ev = await circulationService.getTimeline(updated.id)
      setEvents(ev)
    } catch (err) {
      setEditMsg(err instanceof Error ? err.message : 'Échec de la modification')
    } finally {
      setEditBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((c) => {
      const hay = [
        c.archive?.concerne,
        c.archive?.reference,
        c.archive?.num_folio,
        c.archive?.emetteur,
        c.sender?.full_name,
        c.receiver?.full_name,
        c.archive?.type_document,
        STATUS_LABELS[c.status],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [items, q])

  const financiers = items.filter((c) =>
    isDocumentFinancier(c.archive?.type_document),
  ).length
  const enAval = items.filter((c) => c.status === 'en_attente_aval').length
  const traites = items.filter((c) => c.status === 'traite').length

  const tabs: { id: Tab; label: string }[] = [
    { id: 'vue', label: 'Tableau de bord' },
    { id: 'tracabilite', label: 'Traçabilité' },
    { id: 'lecture', label: 'Lecture PDF' },
    { id: 'rapport', label: 'Rapport' },
    { id: 'rapport_financier', label: 'Rapport financier' },
    { id: 'demande_archives', label: 'Demande Archives' },
  ]

  return (
    <div className="space-y-6">
      <DashboardHeader
        eyebrow="Contrôle & Audit"
        title="Traçabilité documentaire"
        subtitle="Consultation et suivi des circuits — sans pouvoir d’aval ni de modification"
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

      <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
        <p className="inline-flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4" />
          {canEdit
            ? `Contrôle — privilège ${profile.privilege ?? 0} (édition financière autorisée)`
            : 'Profil lecture seule'}
          <FieldHint
            text={
              canEdit
                ? 'Privilège > 10 : vous pouvez corriger les notes de frais et mises à disposition. L’aval reste interdit.'
                : 'Consultation de la traçabilité uniquement. L’édition des documents financiers nécessite un privilège > 10.'
            }
          />
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpi
          icon={FileSearch}
          label="Dossiers visibles"
          value={items.length}
          hint="Périmètre Contrôle"
        />
        <DashboardKpi
          icon={Route}
          label="En attente d’aval"
          value={enAval}
          hint="Chaîne financière"
          tone="amber"
        />
        <DashboardKpi
          icon={Eye}
          label="Documents financiers"
          value={financiers}
          hint="Notes de frais & MAD"
        />
        <DashboardKpi
          icon={ShieldCheck}
          label="Traités"
          value={traites}
          hint="Circuits clôturés"
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
            </button>
          )
        })}
      </div>

      {tab === 'vue' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-medium text-slate-800">
            Derniers dossiers
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Sélectionnez un dossier dans l’onglet Traçabilité pour le fil
            d’Ariane complet.
          </p>
          <div className="mt-4">
            <CirculationList
              items={filtered.slice(0, 8)}
              emptyLabel="Aucun dossier à contrôler"
              onSelect={(item) => {
                setSelected(item)
                setTab('tracabilite')
              }}
            />
          </div>
        </div>
      )}

      {tab === 'tracabilite' && (
        <div className="space-y-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher (objet, folio, émetteur, statut…)"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-teal-600/30 focus:ring-2"
            />
          </label>

          <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <CirculationList
              items={filtered}
              emptyLabel="Aucun dossier pour ces critères"
              onSelect={setSelected}
            />

            <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-medium text-slate-900">Fil d’Ariane</h3>
              {!selected ? (
                <p className="text-sm text-slate-500">
                  Sélectionnez un document pour suivre sa traçabilité.
                </p>
              ) : (
                <>
                  <div>
                    <p className="font-medium text-slate-900">
                      {selected.archive?.concerne}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {selected.archive?.reference ?? 'Sans référence'}
                      {selected.archive?.num_folio
                        ? ` · Folio ${selected.archive.num_folio}`
                        : ''}
                    </p>
                    <p className="mt-2 text-xs text-slate-600">
                      {STATUS_LABELS[selected.status]} ·{' '}
                      {format.datetime(selected.created_at)}
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
                          ? ` · ${format.money(
                              Number(selected.archive.montant),
                              selected.archive.devise || 'CDF',
                            )}`
                          : ''}
                        {selected.avis_aval
                          ? ` · ${AVIS_AVAL_LABELS[selected.avis_aval]}`
                          : ''}
                      </p>
                    )}
                  </div>

                  {avalSteps.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                        Chaîne d’aval (consultation)
                      </p>
                      <ol className="space-y-1.5 text-xs text-slate-700">
                        {avalSteps.map((s) => (
                          <li key={s.id}>
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

                  {canEdit &&
                    isDocumentFinancier(selected.archive?.type_document) && (
                      <form
                        onSubmit={(e) => void saveFinancialEdit(e)}
                        className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3"
                      >
                        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-950">
                          <PencilLine className="h-4 w-4" />
                          Édition document financier
                          <FieldHint text="Correction Contrôle (privilège > 10). Aucun aval ne peut être accordé depuis ce profil." />
                        </p>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-amber-900">
                            Objet / Concerne
                          </span>
                          <input
                            required
                            value={editForm.concerne}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                concerne: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-amber-500/30 focus:ring-2"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-amber-900">
                            Référence
                          </span>
                          <input
                            value={editForm.reference}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                reference: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-amber-500/30 focus:ring-2"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-amber-900">
                              Montant
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editForm.montant}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  montant: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-amber-500/30 focus:ring-2"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-amber-900">
                              Devise
                            </span>
                            <select
                              value={editForm.devise}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  devise: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-amber-500/30 focus:ring-2"
                            >
                              <option value="CDF">CDF</option>
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                            </select>
                          </label>
                        </div>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-amber-900">
                            Émetteur
                          </span>
                          <input
                            value={editForm.emetteur}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                emetteur: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-amber-500/30 focus:ring-2"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-amber-900">
                            Motif de correction
                          </span>
                          <textarea
                            value={editForm.note}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                note: e.target.value,
                              }))
                            }
                            rows={2}
                            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-amber-500/30 focus:ring-2"
                            placeholder="Observation de contrôle…"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={editBusy}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-800 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                        >
                          {editBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <PencilLine className="h-3.5 w-3.5" />
                          )}
                          Enregistrer la correction
                        </button>
                        {editMsg && (
                          <p className="text-xs text-amber-950">{editMsg}</p>
                        )}
                      </form>
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
        </div>
      )}

      {tab === 'lecture' && <DocumentPdfReader profile={profile} />}
      {tab === 'rapport' && <DocumentReport profile={profile} />}
      {tab === 'rapport_financier' && <FinancialReport profile={profile} />}
      {tab === 'demande_archives' && (
        <DemandeDocRequesterPanel profile={profile} />
      )}
    </div>
  )
}
