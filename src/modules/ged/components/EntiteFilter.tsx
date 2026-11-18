import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'

const STORAGE_KEY = 'ged_entite_filtre'
const DEFAULT_ENTITE = 'Kinshasa'

type Props = {
  value: string
  options: string[]
  onChange: (entite: string) => void
  required?: boolean
  label?: string
  className?: string
}

export function readStoredEntite(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULT_ENTITE
    return raw.trim()
  } catch {
    return DEFAULT_ENTITE
  }
}

export function storeEntite(entite: string) {
  try {
    localStorage.setItem(STORAGE_KEY, entite)
  } catch {
    /* ignore */
  }
}

/** Sélecteur d’entité / instance — filtre listes et provenance document */
export function EntiteFilter({
  value,
  options,
  onChange,
  required = false,
  label = 'Entité / instance',
  className = '',
}: Props) {
  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2'

  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Building2 className="h-3.5 w-3.5" />
        {label}
        {required ? ' *' : ''}
      </span>
      <select
        required={required}
        className={field}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          storeEntite(next)
          onChange(next)
        }}
      >
        <option value="">
          {required ? 'Choisir l’entité…' : 'Toutes les entités'}
        </option>
        {options.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Charge la liste d’entités et restaure la sélection mémorisée */
export function useEntiteFilter(loadEntites: () => Promise<string[]>) {
  const [entites, setEntites] = useState<string[]>([])
  const [entite, setEntite] = useState(() => {
    const stored = readStoredEntite()
    return stored || DEFAULT_ENTITE
  })

  useEffect(() => {
    void loadEntites()
      .then((rows) => {
        setEntites(rows)
        const stored = readStoredEntite()
        const apply = (next: string) => {
          setEntite((prev) => (prev === next ? prev : next))
        }
        // Première visite / clé absente → Kinshasa
        if (localStorage.getItem(STORAGE_KEY) === null && rows.includes(DEFAULT_ENTITE)) {
          apply(DEFAULT_ENTITE)
          storeEntite(DEFAULT_ENTITE)
          return
        }
        if (stored && rows.includes(stored)) {
          apply(stored)
          return
        }
        if ((!stored || !rows.includes(stored)) && rows.includes(DEFAULT_ENTITE)) {
          apply(DEFAULT_ENTITE)
          storeEntite(DEFAULT_ENTITE)
          return
        }
        if (stored && !rows.includes(stored)) {
          const fallback = rows.includes(DEFAULT_ENTITE)
            ? DEFAULT_ENTITE
            : rows[0] || DEFAULT_ENTITE
          apply(fallback)
          storeEntite(fallback)
        }
      })
      .catch(() => setEntites([]))
  }, [loadEntites])

  function selectEntite(next: string) {
    storeEntite(next)
    setEntite((prev) => (prev === next ? prev : next))
  }

  return { entites, entite, setEntite: selectEntite }
}
