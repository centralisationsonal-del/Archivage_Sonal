import { useMemo, useState } from 'react'
import { circulationService } from '@/services/circulationService'
import { exportFinancialReportExcel } from '@/modules/ged/lib/exportFinancialReportExcel'
import { exportFinancialReportPdf } from '@/modules/ged/lib/exportFinancialReportPdf'
import {
  globalTotalsByDevise,
  groupFinancialRows,
} from '@/modules/ged/lib/financialReportGroups'
import { ReportEtatHeader } from '@/modules/ged/components/DashboardShared'
import { format } from '@/lib/format'
import {
  AVIS_AVAL_LABELS,
  STATUS_LABELS,
  type DocumentReportFilters,
  type FinancialReportRow,
  type Profile,
} from '@/types/ged'
import { FileDown, FileSpreadsheet, Loader2, Search } from 'lucide-react'

interface Props {
  profile: Profile
}

const emptyFilters: DocumentReportFilters = {
  dateFrom: '',
  dateTo: '',
}

export function FinancialReport({ profile }: Props) {
  const [filters, setFilters] = useState<DocumentReportFilters>(emptyFilters)
  const [rows, setRows] = useState<FinancialReportRow[]>([])
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

  const groups = useMemo(() => groupFinancialRows(rows), [rows])
  const global = useMemo(() => globalTotalsByDevise(rows), [rows])

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
      const data = await circulationService.searchFinancialReport(profile, {
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
      await exportFinancialReportPdf({ rows, profile, periodLabel })
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
      exportFinancialReportExcel({ rows, profile, periodLabel })
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

  let rowNum = 0

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-900">
            Rapport financier — notes de frais & mises à disposition
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Groupé par type de document, cumuls par devise, chaîne d’aval
            (autorités). Export PDF A4 paysage et Excel.
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
            searched
              ? `Résultats financiers — ${rows.length}`
              : 'Résultats financiers'
          }
          subtitle={periodLabel}
          right={
            global.length > 0 ? (
              <div className="hidden text-right text-xs text-slate-600 sm:block">
                {global.map((t) => (
                  <p key={t.devise} className="font-medium text-[#0f4c75]">
                    Total {t.devise} : {format.money(t.total, t.devise)}
                  </p>
                ))}
              </div>
            ) : undefined
          }
        />

        {!searched && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Choisissez une période puis lancez la recherche.
          </p>
        )}
        {searched && rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Aucun document financier pour cette période.
          </p>
        )}

        {groups.map((g) => (
          <div key={g.type} className="border-t border-slate-100">
            <div className="bg-amber-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber-950">
              {g.label} — {g.items.length} dossier(s)
              {g.totalsByDevise.length > 0 && (
                <span className="ml-2 font-normal normal-case text-amber-800">
                  (
                  {g.totalsByDevise
                    .map((t) => format.money(t.total, t.devise))
                    .join(' · ')}
                  )
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#0f4c75] text-xs uppercase tracking-wide text-white">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">N°</th>
                    <th className="px-3 py-2.5 font-medium">Date</th>
                    <th className="px-3 py-2.5 font-medium">Folio</th>
                    <th className="px-3 py-2.5 font-medium">Concerne</th>
                    <th className="px-3 py-2.5 font-medium">Référence</th>
                    <th className="px-3 py-2.5 font-medium">Émetteur</th>
                    <th className="px-3 py-2.5 font-medium">Montant</th>
                    <th className="px-3 py-2.5 font-medium">Statut</th>
                    <th className="px-3 py-2.5 font-medium">Avis</th>
                    <th className="px-3 py-2.5 font-medium">Chaîne d’aval</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((r) => {
                    rowNum += 1
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-slate-100 odd:bg-slate-50/50"
                      >
                        <td className="px-3 py-2.5 text-slate-500">{rowNum}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                          {format.date(r.date_doc)}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[#0f4c75]">
                          {r.folio}
                        </td>
                        <td className="px-3 py-2.5 text-slate-900">
                          {r.concerne}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {r.reference}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {r.emetteur}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                          {format.money(r.montant, r.devise)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {STATUS_LABELS[r.statut]}
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {r.avis_aval
                            ? AVIS_AVAL_LABELS[r.avis_aval]
                            : 'En attente'}
                        </td>
                        <td className="max-w-xs px-3 py-2.5 text-xs text-slate-600">
                          {r.chaine_aval}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
