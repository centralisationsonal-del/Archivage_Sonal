import { useState } from 'react'
import { format } from '@/lib/format'
import {
  formatDocumentAge,
  PURGE_MIN_AGE_YEARS,
} from '@/modules/ged/lib/archivePrivileges'
import { circulationService } from '@/services/circulationService'
import type { Archive } from '@/types/ged'
import { Loader2, Search, Trash2 } from 'lucide-react'

type Props = {
  onPurged?: () => void
}

export function ArchivesPurgePanel({ onPurged }: Props) {
  const [purgeYears, setPurgeYears] = useState(PURGE_MIN_AGE_YEARS)
  const [purgeRows, setPurgeRows] = useState<Archive[]>([])
  const [purgeSelected, setPurgeSelected] = useState<Set<number>>(new Set())
  const [purgeLoading, setPurgeLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2'

  function normalizedYears() {
    return Math.max(PURGE_MIN_AGE_YEARS, Number(purgeYears) || PURGE_MIN_AGE_YEARS)
  }

  async function listPurgeCandidates() {
    const years = normalizedYears()
    if (years !== purgeYears) setPurgeYears(years)
    setPurgeLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const rows = await circulationService.listArchivesByMinAgeYears(years)
      setPurgeRows(rows)
      setPurgeSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du listing purge')
    } finally {
      setPurgeLoading(false)
    }
  }

  async function confirmPurge() {
    const years = normalizedYears()
    const ids = [...purgeSelected]
    if (ids.length === 0) return
    const ok = window.confirm(
      `Supprimer physiquement ${ids.length} document(s) ayant atteint au moins ${years} an(s) ? Cette action est irréversible.`,
    )
    if (!ok) return
    setPurgeLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await circulationService.purgeArchives(ids)
      setSuccess(`${res.deleted} document(s) supprimé(s) définitivement.`)
      setPurgeSelected(new Set())
      await listPurgeCandidates()
      onPurged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la purge')
    } finally {
      setPurgeLoading(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="font-medium text-slate-900">
        Zone réfléchie — purge par âge
      </h3>
      <p className="text-sm text-slate-500">
        Lister les documents dont l’âge (date de création) atteint le seuil
        (minimum {PURGE_MIN_AGE_YEARS} ans), puis supprimer physiquement après
        confirmation.
      </p>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
            Âge minimum (années)
          </span>
          <input
            type="number"
            min={PURGE_MIN_AGE_YEARS}
            max={100}
            value={purgeYears}
            onChange={(e) =>
              setPurgeYears(
                Math.max(
                  PURGE_MIN_AGE_YEARS,
                  Number(e.target.value) || PURGE_MIN_AGE_YEARS,
                ),
              )
            }
            className={`${field} w-32`}
          />
        </label>
        <button
          type="button"
          onClick={() => void listPurgeCandidates()}
          disabled={purgeLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c75] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0c3d5e] disabled:opacity-60"
        >
          {purgeLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Lister
        </button>
        <button
          type="button"
          onClick={() => void confirmPurge()}
          disabled={purgeLoading || purgeSelected.size === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" />
          Supprimer ({purgeSelected.size})
        </button>
      </div>
      {purgeRows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2" />
                <th className="px-3 py-2">Réf.</th>
                <th className="px-3 py-2">Objet</th>
                <th className="px-3 py-2">Création</th>
                <th className="px-3 py-2">Âge</th>
              </tr>
            </thead>
            <tbody>
              {purgeRows.map((a) => {
                const creation = a.date_creation || a.date_doc
                const checked = purgeSelected.has(a.id)
                return (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setPurgeSelected((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(a.id)
                            else next.delete(a.id)
                            return next
                          })
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">{a.reference || '—'}</td>
                    <td className="px-3 py-2">{a.concerne}</td>
                    <td className="px-3 py-2">{format.date(creation)}</td>
                    <td className="px-3 py-2">{formatDocumentAge(creation)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
