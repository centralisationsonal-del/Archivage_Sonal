import { useState } from 'react'
import { format } from '@/lib/format'
import { formatDocumentAge } from '@/modules/ged/lib/archivePrivileges'
import { circulationService } from '@/services/circulationService'
import type { Archive, ArchiveSearchFilters, Profile } from '@/types/ged'
import { Loader2, Search } from 'lucide-react'

type Props = {
  profile: Profile
  scope: 'docs' | 'secretariat'
  onSelect?: (archive: Archive) => void
  emplacementOptions?: string[]
  /** Si fourni, force le filtre entité (sans champ libre) */
  lockedEntite?: string
}

const empty: ArchiveSearchFilters = {
  concerne: '',
  reference: '',
  emplacement: '',
  dateFrom: '',
  dateTo: '',
  emetteur: '',
  recepteur: '',
  entite: '',
}

export function ArchivesSearchPanel({
  profile,
  scope,
  onSelect,
  emplacementOptions = [],
  lockedEntite,
}: Props) {
  const [filters, setFilters] = useState<ArchiveSearchFilters>({ ...empty })
  const [rows, setRows] = useState<Archive[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const data = await circulationService.searchArchives(profile, {
        ...filters,
        entite: lockedEntite || filters.entite,
        scope,
        directionId: profile.direction_id,
      })
      setRows(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de recherche')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2'

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => void runSearch(e)}
        className="rounded-xl border border-slate-200 bg-white p-4"
      >
        <p className="mb-3 text-sm font-medium text-slate-800">
          Rechercher un document archivé
          {lockedEntite ? ` — entité ${lockedEntite}` : ''}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!lockedEntite && (
            <label className="block text-xs font-medium text-slate-600">
              Entité
              <input
                className={`${field} mt-1`}
                value={filters.entite ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, entite: e.target.value }))
                }
                placeholder="Ex. Kinshasa"
              />
            </label>
          )}
          <label className="block text-xs font-medium text-slate-600">
            Objet / concerne
            <input
              className={`${field} mt-1`}
              value={filters.concerne ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, concerne: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Référence
            <input
              className={`${field} mt-1`}
              value={filters.reference ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, reference: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Emplacement
            {emplacementOptions.length > 0 ? (
              <select
                className={`${field} mt-1`}
                value={filters.emplacement ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, emplacement: e.target.value }))
                }
              >
                <option value="">Tous</option>
                {emplacementOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={`${field} mt-1`}
                value={filters.emplacement ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, emplacement: e.target.value }))
                }
              />
            )}
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Date création (du)
            <input
              type="date"
              className={`${field} mt-1`}
              value={filters.dateFrom ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateFrom: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Date création (au)
            <input
              type="date"
              className={`${field} mt-1`}
              value={filters.dateTo ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateTo: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Expéditeur
            <input
              className={`${field} mt-1`}
              value={filters.emetteur ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, emetteur: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Destinataire
            <input
              className={`${field} mt-1`}
              value={filters.recepteur ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, recepteur: e.target.value }))
              }
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
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
            onClick={() => {
              setFilters({ ...empty })
              setRows([])
              setSearched(false)
            }}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Réinitialiser
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {searched && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Référence</th>
                <th className="px-3 py-2">Entité</th>
                <th className="px-3 py-2">Objet</th>
                <th className="px-3 py-2">Création</th>
                <th className="px-3 py-2">Âge</th>
                <th className="px-3 py-2">Emplacement</th>
                <th className="px-3 py-2">Expéditeur</th>
                <th className="px-3 py-2">Destinataire</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    Aucun document trouvé
                  </td>
                </tr>
              ) : (
                rows.map((a) => {
                  const creation = a.date_creation || a.date_doc
                  return (
                    <tr
                      key={a.id}
                      className={`border-t border-slate-100 ${
                        onSelect ? 'cursor-pointer hover:bg-sky-50/60' : ''
                      }`}
                      onClick={() => onSelect?.(a)}
                    >
                      <td className="px-3 py-2 font-medium text-[#0f4c75]">
                        {a.reference || '—'}
                      </td>
                      <td className="px-3 py-2">{a.entite || '—'}</td>
                      <td className="max-w-[14rem] truncate px-3 py-2">
                        {a.concerne}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {format.date(creation)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                        {formatDocumentAge(creation)}
                      </td>
                      <td className="px-3 py-2">{a.emplacement || '—'}</td>
                      <td className="px-3 py-2">{a.emetteur || '—'}</td>
                      <td className="px-3 py-2">{a.recepteur || '—'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
