import { useMemo, useState } from 'react'
import { circulationService } from '@/services/circulationService'
import { exportDocumentReportPdf } from '@/modules/ged/lib/exportDocumentReportPdf'
import { format } from '@/lib/format'
import type {
  DocumentReportFilters,
  DocumentReportRow,
  Profile,
} from '@/types/ged'
import { FileDown, Loader2, Search } from 'lucide-react'

interface Props {
  profile: Profile
}

const emptyFilters: DocumentReportFilters = {
  dateFrom: '',
  dateTo: '',
}

export function DocumentReport({ profile }: Props) {
  const [filters, setFilters] = useState<DocumentReportFilters>(emptyFilters)
  const [rows, setRows] = useState<DocumentReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

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
      const data = await circulationService.searchDocumentReport(profile, {
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
    setPrinting(true)
    setError(null)
    try {
      await exportDocumentReportPdf({
        rows,
        profile,
        periodLabel,
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Échec de la génération du PDF',
      )
    } finally {
      setPrinting(false)
    }
  }

  const fieldClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2'

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h3 className="text-base font-medium text-slate-900">
            Rapport — recherche de circuit
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Recherche périodique uniquement par dates d’envoi. Les colonnes
            (nom, émetteur, destinataire, objet, référence, folio) s’affichent
            dans les résultats. Export PDF A4 paysage.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSearch(e)}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Date envoi (du)
            </span>
            <input
              type="date"
              required
              value={filters.dateFrom ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
              }
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Date envoi (au)
            </span>
            <input
              type="date"
              required
              value={filters.dateTo ?? ''}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
              }
              className={fieldClass}
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Rechercher
            </button>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Réinitialiser
            </button>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={rows.length === 0 || printing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-teal-700 bg-teal-50 px-4 py-2.5 text-sm font-medium text-teal-900 hover:bg-teal-100 disabled:opacity-50"
            >
              {printing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              PDF A4 paysage
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
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src="/assets/New_Logo_Sonal_avec_Texte.jpg"
              alt="SONAL S.A."
              className="h-10 w-auto object-contain"
            />
            <div>
              <p className="text-sm font-medium text-slate-800">
                Résultats
                {searched ? ` — ${rows.length}` : ''}
              </p>
              <p className="text-xs text-slate-500">{periodLabel}</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#0f4c75] text-xs uppercase tracking-wide text-white">
              <tr>
                <th className="px-3 py-2.5 font-medium">N°</th>
                <th className="px-3 py-2.5 font-medium">Nom document</th>
                <th className="px-3 py-2.5 font-medium">Date envoi</th>
                <th className="px-3 py-2.5 font-medium">Émetteur</th>
                <th className="px-3 py-2.5 font-medium">Destinataire</th>
                <th className="px-3 py-2.5 font-medium">Objet</th>
                <th className="px-3 py-2.5 font-medium">Référence</th>
                <th className="px-3 py-2.5 font-medium">Folio</th>
                <th className="px-3 py-2.5 font-medium">Circuit</th>
              </tr>
            </thead>
            <tbody>
              {!searched && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    Choisissez une période (date du / au) puis lancez la recherche.
                  </td>
                </tr>
              )}
              {searched && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    Aucun circuit trouvé pour cette période.
                  </td>
                </tr>
              )}
              {rows.map((r, idx) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-100 odd:bg-slate-50/60 hover:bg-sky-50/50"
                >
                  <td className="px-3 py-2.5 text-slate-500">{idx + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">
                    {r.nom_document}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                    {format.datetime(r.date_envoye)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{r.emetteur}</td>
                  <td className="px-3 py-2.5 text-slate-700">{r.destinataire}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2.5 text-slate-700">
                    {r.objet}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{r.reference}</td>
                  <td className="px-3 py-2.5 font-medium text-[#0f4c75]">{r.folio}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{r.circuit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
