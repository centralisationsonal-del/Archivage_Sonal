import { useMemo, useState } from 'react'
import { fileExtension } from '@/lib/documentFiles'
import { format } from '@/lib/format'
import type { Archive } from '@/types/ged'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'

type GroupMode = 'annee' | 'emplacement' | 'folio' | 'extension'

interface Group {
  key: string
  label: string
  items: Archive[]
}

function yearOf(a: Archive): string {
  const d = a.date_doc || a.created_at
  if (!d) return 'Sans date'
  const y = new Date(d).getFullYear()
  return Number.isFinite(y) ? String(y) : 'Sans date'
}

function folioKey(a: Archive): string {
  const f = a.num_folio?.trim()
  if (!f) return 'Sans folio'
  // Regrouper par préfixe / série (ex. 2024-, A-, etc.)
  const m = f.match(/^([A-Za-z]+|[0-9]{4})/)
  if (m) return `Série ${m[1]}`
  return f
}

function buildGroups(archives: Archive[], mode: GroupMode): Group[] {
  const map = new Map<string, Archive[]>()

  for (const a of archives) {
    let key: string
    switch (mode) {
      case 'emplacement':
        key = a.emplacement?.trim() || 'Emplacement non renseigné'
        break
      case 'folio':
        key = folioKey(a)
        break
      case 'extension': {
        const ext = fileExtension(a.nom_doc_phys || a.file_path)
        key = ext === '—' ? 'Sans fichier' : `Format ${ext}`
        break
      }
      case 'annee':
      default:
        key = yearOf(a)
        break
    }
    const list = map.get(key) ?? []
    list.push(a)
    map.set(key, list)
  }

  const groups: Group[] = Array.from(map.entries()).map(([key, items]) => {
    const sorted = [...items].sort((x, y) => {
      // Folio numérique si possible, sinon date décroissante
      const fx = x.num_folio?.trim() || ''
      const fy = y.num_folio?.trim() || ''
      if (fx && fy) {
        const nx = Number(fx.replace(/\D/g, ''))
        const ny = Number(fy.replace(/\D/g, ''))
        if (Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny) {
          return nx - ny
        }
        return fx.localeCompare(fy, 'fr')
      }
      return (
        +new Date(y.updated_at || y.created_at || y.date_doc) -
        +new Date(x.updated_at || x.created_at || x.date_doc)
      )
    })
    return {
      key,
      label: key,
      items: sorted,
    }
  })

  groups.sort((a, b) => {
    if (mode === 'annee') {
      if (a.key === 'Sans date') return 1
      if (b.key === 'Sans date') return -1
      return b.key.localeCompare(a.key, 'fr') // années récentes d’abord
    }
    if (a.key.startsWith('Sans') || a.key.includes('non renseigné')) return 1
    if (b.key.startsWith('Sans') || b.key.includes('non renseigné')) return -1
    return a.key.localeCompare(b.key, 'fr', { numeric: true })
  })

  return groups
}

interface Props {
  archives: Archive[]
  onSelectForSend?: (id: number) => void
}

export function ArchivesGroupedRegister({ archives, onSelectForSend }: Props) {
  const [mode, setMode] = useState<GroupMode>('annee')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return archives
    return archives.filter((a) => {
      const hay = [
        a.concerne,
        a.reference,
        a.num_folio,
        a.emetteur,
        a.recepteur,
        a.emplacement,
        a.nom_doc_phys,
        String(a.id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [archives, q])

  const groups = useMemo(() => buildGroups(filtered, mode), [filtered, mode])

  // Ouvrir le premier groupe par défaut
  const effectiveOpen = useMemo(() => {
    if (Object.keys(open).length > 0) return open
    if (groups[0]) return { [groups[0].key]: true }
    return open
  }, [open, groups])

  function toggle(key: string) {
    setOpen((prev) => {
      const base = Object.keys(prev).length ? prev : { [groups[0]?.key ?? '']: true }
      return { ...base, [key]: !base[key] }
    })
  }

  const modes: { id: GroupMode; label: string; hint: string }[] = [
    { id: 'annee', label: 'Par année', hint: 'Série chronologique (classement classique)' },
    { id: 'emplacement', label: 'Par emplacement', hint: 'Repérage physique rapide' },
    { id: 'folio', label: 'Par série de folio', hint: 'Ordre du registre' },
    { id: 'extension', label: 'Par format', hint: 'PDF, Word, images…' },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">
              Registre classé — aide à la récupération
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {modes.find((m) => m.id === mode)?.hint}. {filtered.length} document(s)
              {q ? ` (filtre actif)` : ''}.
            </p>
          </div>
          <label className="relative block min-w-[14rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher folio, objet, réf…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMode(m.id)
                setOpen({})
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                mode === m.id
                  ? 'bg-[#0f4c75] text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
          Aucun document archivé{q ? ' pour cette recherche' : ''}.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isOpen = Boolean(effectiveOpen[g.key])
            return (
              <div
                key={g.key}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggle(g.key)}
                  className="flex w-full items-center justify-between gap-3 bg-[#e8f1f8]/80 px-4 py-3 text-left hover:bg-[#e8f1f8]"
                >
                  <span className="flex items-center gap-2">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-[#0f4c75]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[#0f4c75]" />
                    )}
                    <span className="text-sm font-semibold text-[#0f4c75]">
                      {g.label}
                    </span>
                  </span>
                  <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                    {g.items.length} doc.
                  </span>
                </button>

                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">N°</th>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Folio</th>
                          <th className="px-3 py-2">Concerne</th>
                          <th className="px-3 py-2">Référence</th>
                          <th className="px-3 py-2">Emplacement</th>
                          <th className="px-3 py-2">Émetteur</th>
                          <th className="px-3 py-2">Fichier</th>
                          {onSelectForSend && (
                            <th className="px-3 py-2">Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((a) => (
                          <tr
                            key={a.id}
                            className="border-t border-slate-100 odd:bg-slate-50/40"
                          >
                            <td className="px-3 py-2 text-slate-500">{a.id}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                              {format.date(a.date_doc)}
                            </td>
                            <td className="px-3 py-2 font-medium text-[#0f4c75]">
                              {a.num_folio ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-900">{a.concerne}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {a.reference ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {a.emplacement ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {a.emetteur ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">
                              {a.nom_doc_phys ?? '—'}
                              {a.nom_doc_phys
                                ? ` (${fileExtension(a.nom_doc_phys)})`
                                : ''}
                            </td>
                            {onSelectForSend && (
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => onSelectForSend(a.id)}
                                  className="text-xs font-medium text-[#0f4c75] hover:underline"
                                >
                                  Envoyer
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Options select groupées pour l’envoi vers une direction */
export function groupedArchiveOptions(archives: Archive[]): {
  label: string
  options: { id: number; label: string }[]
}[] {
  return buildGroups(archives, 'annee').map((g) => ({
    label: g.label,
    options: g.items.map((a) => ({
      id: a.id,
      label: `#${a.id} — ${a.concerne}${a.num_folio ? ` (folio ${a.num_folio})` : ''}`,
    })),
  }))
}
