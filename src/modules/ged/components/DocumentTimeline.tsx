import { format } from '@/lib/format'
import type { CirculationEvent } from '@/types/ged'
import { CheckCircle2, FileText, Forward, Inbox, Send } from 'lucide-react'

const EVENT_ICONS: Record<string, typeof FileText> = {
  created: FileText,
  oriented: Forward,
  expedited: Send,
  received: Inbox,
  processed: CheckCircle2,
}

interface Props {
  events: CirculationEvent[]
}

export function DocumentTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-500">Aucun événement enregistré.</p>
    )
  }

  return (
    <ol className="relative space-y-0 border-l-2 border-teal-200 pl-6">
      {events.map((event, index) => {
        const Icon = EVENT_ICONS[event.event_type] ?? FileText
        const isLast = index === events.length - 1
        return (
          <li key={event.id} className="relative pb-8 last:pb-0">
            <span
              className={`absolute -left-[1.95rem] flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                isLast
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-teal-300 bg-white text-teal-700'
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="font-medium text-slate-800">{event.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {event.actor?.full_name ?? 'Système'} · {format.datetime(event.created_at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
