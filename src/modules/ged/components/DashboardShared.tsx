import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function DashboardKpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'teal',
}: {
  icon: LucideIcon
  label: string
  value: number
  hint: string
  tone?: 'teal' | 'amber' | 'sky' | 'slate'
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-800',
    amber: 'bg-amber-50 text-amber-700',
    sky: 'bg-sky-50 text-sky-700',
    slate: 'bg-slate-100 text-slate-700',
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <span className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 font-display text-3xl text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  )
}

export function DashboardHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string
  title: string
  subtitle: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-800/70">
          {eyebrow}
        </p>
        <h2 className="font-display mt-1 text-3xl text-slate-900">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  )
}
