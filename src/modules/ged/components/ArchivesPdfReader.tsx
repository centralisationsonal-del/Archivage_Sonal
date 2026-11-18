import { useEffect, useMemo, useState } from 'react'
import { FormBrandBar } from '@/modules/ged/components/DashboardShared'
import { circulationService } from '@/services/circulationService'
import { format } from '@/lib/format'
import { formatDocumentAge } from '@/modules/ged/lib/archivePrivileges'
import type { Archive, Profile } from '@/types/ged'
import { ExternalLink, FileText, Loader2, Search } from 'lucide-react'

interface Props {
  profile: Profile
  entite?: string
}

export function ArchivesPdfReader({ profile, entite }: Props) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [items, setItems] = useState<Archive[]>([])
  const [selected, setSelected] = useState<Archive | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [docLoading, setDocLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const periodLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return 'Période non définie'
    return `Du ${format.date(dateFrom)} au ${format.date(dateTo)}`
  }, [dateFrom, dateTo])

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!dateFrom || !dateTo) {
      setError('Indiquez la date de début et la date de fin.')
      return
    }
    if (dateFrom > dateTo) {
      setError('La date de début doit être antérieure ou égale à la date de fin.')
      return
    }

    setLoading(true)
    setError(null)
    setUrl(null)
    try {
      const rows = await circulationService.searchArchivesByPeriod(profile, {
        dateFrom,
        dateTo,
        entite,
      })
      const withFile = rows.filter((a) => a.file_path)
      setItems(withFile)
      setSearched(true)
      setSelected(withFile[0] ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
      setItems([])
      setSelected(null)
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!selected?.file_path) {
      setUrl(null)
      return
    }
    let cancelled = false
    void (async () => {
      setDocLoading(true)
      setError(null)
      try {
        const signed = await circulationService.getFileUrl(selected.file_path!)
        if (!cancelled) {
          if (!signed) throw new Error('Impossible d’ouvrir le PDF')
          setUrl(signed)
        }
      } catch (err) {
        if (!cancelled) {
          setUrl(null)
          setError(err instanceof Error ? err.message : 'Échec lecture PDF')
        }
      } finally {
        if (!cancelled) setDocLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected])

  return (
    <div className="space-y-4">
      <FormBrandBar title="Lecture documents archivés" />
      <form
        onSubmit={(e) => void handleSearch(e)}
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <p className="mb-1 text-sm font-medium text-slate-800">
          Lecture — documents archivés par période
        </p>
        <p className="mb-3 text-xs text-slate-500">
          Toutes extensions · tri par date de mise à jour (décroissant). Les PDF
          s’affichent en aperçu ; les autres types s’ouvrent via le lien.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Du
            </span>
            <input
              type="date"
              required
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Au
            </span>
            <input
              type="date"
              required
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c75] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0c3d5e] disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Afficher
          </button>
        </div>
        {error && !searched && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </form>

      {!searched ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
          Choisissez une période puis cliquez sur Afficher.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-medium text-slate-900">
                Documents archivés (par année)
              </h3>
              <p className="text-xs text-slate-500">
                {items.length} fichier(s) — {periodLabel} · regroupés pour
                récupération rapide
              </p>
            </div>
            <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
              {items.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-slate-500">
                  Aucun document archivé pour cette période.
                </li>
              )}
              {(() => {
                const byYear = new Map<string, Archive[]>()
                for (const item of items) {
                  const y = item.date_doc
                    ? String(new Date(item.date_doc).getFullYear())
                    : 'Sans date'
                  const list = byYear.get(y) ?? []
                  list.push(item)
                  byYear.set(y, list)
                }
                const years = Array.from(byYear.keys()).sort((a, b) =>
                  b.localeCompare(a),
                )
                return years.map((year) => (
                  <li key={year}>
                    <div className="bg-[#e8f1f8]/70 px-4 py-1.5 text-xs font-semibold text-[#0f4c75]">
                      Année {year} · {byYear.get(year)!.length}
                    </div>
                    <ul>
                      {byYear.get(year)!.map((item) => {
                        const active = selected?.id === item.id
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => setSelected(item)}
                              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                                active ? 'bg-sky-50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <FileText
                                className={`mt-0.5 h-4 w-4 shrink-0 ${
                                  active ? 'text-[#0f4c75]' : 'text-slate-400'
                                }`}
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-900">
                                  {item.nom_doc_phys || item.concerne}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-slate-500">
                                  {item.concerne}
                                  {item.num_folio
                                    ? ` · Folio ${item.num_folio}`
                                    : ''}
                                  {item.emplacement
                                    ? ` · ${item.emplacement}`
                                    : ''}
                                  {' · Âge '}
                                  {formatDocumentAge(
                                    item.date_creation || item.date_doc,
                                  )}
                                </span>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))
              })()}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            {!selected ? (
              <p className="py-16 text-center text-sm text-slate-500">
                Sélectionnez un document pour le lire.
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">
                      {selected.concerne}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selected.nom_doc_phys ?? 'Document PDF'}
                      {selected.reference
                        ? ` · Réf. ${selected.reference}`
                        : ''}
                      {selected.num_folio
                        ? ` · Folio ${selected.num_folio}`
                        : ''}
                      {' · Création '}
                      {format.date(
                        selected.date_creation || selected.date_doc,
                      )}
                      {' · Âge '}
                      {formatDocumentAge(
                        selected.date_creation || selected.date_doc,
                      )}
                      {' · Maj. '}
                      {format.datetime(
                        selected.updated_at || selected.created_at,
                      )}
                    </p>
                  </div>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ouvrir
                    </a>
                  )}
                </div>

                {error && (
                  <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}

                {docLoading ? (
                  <div className="flex h-[28rem] items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ouverture du PDF…
                  </div>
                ) : url ? (
                  (selected.nom_doc_phys || selected.file_path || '')
                    .toLowerCase()
                    .endsWith('.pdf') ? (
                    <iframe
                      title="Lecture PDF archive"
                      src={url}
                      className="h-[28rem] w-full rounded-lg border border-slate-200 bg-slate-50"
                    />
                  ) : (
                    <div className="flex h-[28rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
                      <p className="text-sm text-slate-600">
                        Aperçu intégré disponible pour les PDF. Ce fichier (
                        {(selected.nom_doc_phys || '')
                          .split('.')
                          .pop()
                          ?.toUpperCase() || 'fichier'}
                        ) peut être ouvert ou téléchargé.
                      </p>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c75] px-4 py-2 text-sm font-medium text-white hover:bg-[#0c3d5e]"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Ouvrir / télécharger
                      </a>
                    </div>
                  )
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">
                    Aperçu indisponible.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
