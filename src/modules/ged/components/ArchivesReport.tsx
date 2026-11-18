import { useMemo, useState } from 'react'
import { circulationService } from '@/services/circulationService'
import { exportArchivesReportExcel } from '@/modules/ged/lib/exportArchivesReportExcel'
import { exportArchivesReportPdf } from '@/modules/ged/lib/exportArchivesReportPdf'
import { ReportEtatHeader } from '@/modules/ged/components/DashboardShared'
import { format } from '@/lib/format'
import type { ArchiveReportRow, DocumentReportFilters, Profile } from '@/types/ged'
import { FileDown, FileSpreadsheet, Loader2, Search } from 'lucide-react'

interface Props {
  profile: Profile
}

const emptyFilters: DocumentReportFilters = {
  dateFrom: '',
  dateTo: '',
}

export function ArchivesReport({ profile }: Props) {
  const [filters, setFilters] = useState<DocumentReportFilters>(emptyFilters)
  const [rows, setRows] = useState<ArchiveReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null)

  const periodLabel = useMemo(() => {
    const from = filters.dateFrom ? format.date(filters.dateFrom) : '…'
    const to = filters.dateTo ? format.date(filters.dateTo) : '…'
    if (!filters.dateFrom && !filters.dateTo) return 'Période non définie'
    return `Du ${from} au ${to}`
  }, [filters.dateFrom, filters.dateTo])

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!filters.dateFrom || !filters.dateTo) {
      setError('Indiquez la date de début et la date de fin.')
      return
    }
    if (filters.dateFrom > filters.dateTo) {
      setError('La date de début doit être antérieure ou égale à la date de fin.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await circulationService.searchArchivesReport(profile, {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      })
      setRows(data)
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de recherche')
      setRows([])
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setFilters(emptyFilters)
    setRows([])
    setSearched(false)
    setError(null)
  }

  async function exportPdf() {
    if (rows.length === 0) return
    setExporting('pdf')
    setError(null)
    try {
      await exportArchivesReportPdf({ rows, profile, periodLabel })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Échec de la génération du PDF',
      )
    } finally {
      setExporting(null)
    }
  }

  function exportExcel() {
    if (rows.length === 0) return
    setExporting('excel')
    setError(null)
    try {
      exportArchivesReportExcel({ rows, profile, periodLabel })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Échec de la génération Excel',
      )
    } finally {
      setExporting(null)
    }
  }

  const fieldClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2'

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-900">
            Rapport de gestion documentaire
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Recherche sur la date de mise à jour des archives (ordre
            décroissant). Export PDF A4 paysage et Excel.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSearch(e)}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="block min-w-[10rem] flex-1">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Du
            </span>
            <input
              type="date"
              required
              value={filters.dateFrom ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateFrom: e.target.value }))
              }
              className={fieldClass}
            />
          </label>
          <label className="block min-w-[10rem] flex-1">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Au
            </span>
            <input
              type="date"
              required
              value={filters.dateTo ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateTo: e.target.value }))
              }
              className={fieldClass}
            />
          </label>
          <div className="flex flex-wrap gap-2">
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
              Rechercher
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              disabled={rows.length === 0 || exporting !== null}
              onClick={() => void exportPdf()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              PDF
            </button>
            <button
              type="button"
              disabled={rows.length === 0 || exporting !== null}
              onClick={exportExcel}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting === 'excel' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Excel
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ReportEtatHeader
          title={
            searched ? `Résultats — ${rows.length} document(s)` : 'Résultats'
          }
          subtitle={periodLabel}
        />

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#0f4c75] text-xs uppercase tracking-wide text-white">
              <tr>
                <th className="px-3 py-2.5 font-medium">N°</th>
                <th className="px-3 py-2.5 font-medium">Date doc.</th>
                <th className="px-3 py-2.5 font-medium">Date maj.</th>
                <th className="px-3 py-2.5 font-medium">Folio</th>
                <th className="px-3 py-2.5 font-medium">Concerne</th>
                <th className="px-3 py-2.5 font-medium">Référence</th>
                <th className="px-3 py-2.5 font-medium">Émetteur</th>
                <th className="px-3 py-2.5 font-medium">Récepteur</th>
                <th className="px-3 py-2.5 font-medium">Emplacement</th>
                <th className="px-3 py-2.5 font-medium">Nom PDF</th>
              </tr>
            </thead>
            <tbody>
              {!searched && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    Choisissez une période (date du / au) puis lancez la
                    recherche.
                  </td>
                </tr>
              )}
              {searched && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    Aucun document archivé pour cette période.
                  </td>
                </tr>
              )}
              {rows.map((r, idx) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-100 odd:bg-slate-50/50"
                >
                  <td className="px-3 py-2.5 text-slate-500">{idx + 1}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                    {format.date(r.date_doc)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                    {format.datetime(r.date_maj)}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-[#0f4c75]">
                    {r.folio}
                  </td>
                  <td className="px-3 py-2.5 text-slate-900">{r.concerne}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.reference}</td>
                  <td className="px-3 py-2.5 text-slate-700">{r.emetteur}</td>
                  <td className="px-3 py-2.5 text-slate-700">{r.recepteur}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.emplacement}</td>
                  <td className="px-3 py-2.5 text-slate-800">{r.nom_document}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
