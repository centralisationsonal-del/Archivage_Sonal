import type { ReactNode } from 'react'
import { STATUS_LABELS, PARCOURS_LABELS, type Circulation } from '@/types/ged'
import { format } from '@/lib/format'
import { formatDocumentAge } from '@/modules/ged/lib/archivePrivileges'
import { Eye, FileText } from 'lucide-react'

interface Props {
  items: Circulation[]
  emptyLabel?: string
  onSelect?: (item: Circulation) => void
  actionSlot?: (item: Circulation) => ReactNode
}

const statusTone: Record<string, string> = {
  en_attente_orientation: 'bg-amber-50 text-amber-800 ring-amber-200',
  oriente: 'bg-sky-50 text-sky-800 ring-sky-200',
  recu: 'bg-teal-50 text-teal-800 ring-teal-200',
  traite: 'bg-slate-100 text-slate-700 ring-slate-200',
  repondu: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  en_attente_aval: 'bg-amber-50 text-amber-900 ring-amber-200',
}

export function CirculationList({
  items,
  emptyLabel = 'Aucun courrier',
  onSelect,
  actionSlot,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
        <FileText className="mb-3 h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-500">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {items.map((item) => {
        const creation =
          item.archive?.date_creation ||
          item.archive?.date_doc ||
          item.created_at?.slice(0, 10)
        return (
          <li
            key={item.id}
            className="flex flex-col gap-3 px-4 py-4 transition hover:bg-slate-50/80 sm:flex-row sm:items-center sm:justify-between"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => onSelect?.(item)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">
                  {item.archive?.concerne ?? 'Document'}
                </span>
                <span
                  className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusTone[item.status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'}`}
                >
                  {STATUS_LABELS[item.status]}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {PARCOURS_LABELS[item.parcours_type]}
                </span>
                {item.archive?.entite && (
                  <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs text-[#0f4c75]">
                    {item.archive.entite}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                De {item.sender?.full_name ?? '—'}
                {item.receiver ? ` → ${item.receiver.full_name}` : ''}
                {' · '}
                Création {format.date(creation)}
                {' · Âge '}
                {formatDocumentAge(creation)}
                {item.archive?.reference
                  ? ` · Réf. ${item.archive.reference}`
                  : ''}
                {item.archive?.num_folio
                  ? ` · Folio ${item.archive.num_folio}`
                  : ''}
              </p>
            </button>
            <div className="flex shrink-0 items-center gap-2">
              {actionSlot?.(item)}
              {onSelect && (
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-white"
                >
                  <Eye className="h-4 w-4" />
                  Détail
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
