import { useCallback, useEffect, useState } from 'react'
import { circulationService } from '@/services/circulationService'
import type { Profile, ProfileActivityStats } from '@/types/ged'
import { ROLE_LABELS } from '@/types/ged'
import { Activity, RefreshCw } from 'lucide-react'

interface Props {
  profile: Profile
}

const SERIES: {
  key: keyof ProfileActivityStats
  label: string
  color: string
}[] = [
  { key: 'archived', label: 'Archives créées', color: '#255f8a' },
  { key: 'sent', label: 'Envois documentaires', color: '#e3b600' },
  { key: 'requested', label: 'Demandes émises', color: '#4894c4' },
  { key: 'unanswered', label: 'Demandes non signalées', color: '#c2413b' },
]

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message
    if (typeof message === 'string' && message.length > 0) return message
  }
  return fallback
}

export function ProfileActivityChart({ profile }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedId, setSelectedId] = useState(profile.id)
  const [stats, setStats] = useState<ProfileActivityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isSuperuser = profile.role === 'dir_administrative'

  useEffect(() => {
    if (!isSuperuser) {
      setSelectedId(profile.id)
      return
    }
    let active = true
    void circulationService
      .listProfiles()
      .then((data) => {
        if (!active) return
        setProfiles(data)
        setSelectedId((current) =>
          data.some((item) => item.id === current) ? current : profile.id,
        )
      })
      .catch((err: unknown) => {
        if (active) {
          setError(getErrorMessage(err, 'Impossible de charger les profils'))
        }
      })
    return () => {
      active = false
    }
  }, [isSuperuser, profile.id])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStats(await circulationService.getProfileActivityStats(selectedId))
    } catch (err) {
      setError(getErrorMessage(err, 'Impossible de charger les statistiques'))
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    void load()
  }, [load])

  const selectedProfile = profiles.find((item) => item.id === selectedId) ?? profile
  const max = Math.max(1, ...(stats ? SERIES.map((item) => stats[item.key]) : [1]))

  return (
    <section className="mb-5 rounded-xl border border-[#d7e0e8] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-[#eef6fb] p-2 text-[#255f8a]">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[#1a364d]">
              Activité documentaire
            </h2>
            <p className="text-xs text-slate-500">
              {selectedProfile.full_name} · {ROLE_LABELS[selectedProfile.role]}
            </p>
            <p className="text-xs text-slate-400">
              Volumes cumulés · activité documentaire
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSuperuser && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="max-w-[16rem] rounded-md border border-[#d7e0e8] bg-white px-2.5 py-1.5 text-xs text-[#1a2b3a]"
              aria-label="Profil à afficher"
            >
              {profiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name} · {ROLE_LABELS[item.role]}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Actualiser les statistiques"
            className="rounded-md border border-[#d7e0e8] p-1.5 text-slate-600 hover:bg-[#eef6fb]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : (
        <div
          className="mt-5 grid grid-cols-2 items-end gap-3 sm:grid-cols-4 sm:gap-5"
          role="img"
          aria-label="Histogramme des archives créées, envois documentaires, demandes émises et demandes non signalées"
        >
          {SERIES.map((item) => {
            const value = stats?.[item.key] ?? 0
            const height = value === 0 ? 3 : Math.max(8, (value / max) * 100)
            return (
              <div key={item.key} className="min-w-0 text-center">
                <p className="mb-1 text-lg font-semibold tabular-nums text-[#1a364d]">
                  {loading ? '—' : value}
                </p>
                <div className="mx-auto flex h-20 max-w-24 items-end justify-center rounded-t-md bg-[#f3f5f6] px-3">
                  <div
                    className="w-full rounded-t-sm transition-[height] duration-300"
                    style={{ height: `${height}%`, backgroundColor: item.color }}
                  />
                </div>
                <p className="mt-2 text-xs leading-tight text-slate-600">
                  {item.label}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
