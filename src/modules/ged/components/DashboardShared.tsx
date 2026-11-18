import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { SonalBrandMark } from '@/modules/ged/components/SonalBrandMark'

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
    teal: 'bg-[#eef6fb] text-[#255f8a]',
    amber: 'bg-[#fffbeb] text-[#9a7600]',
    sky: 'bg-[#eef6fb] text-[#255f8a]',
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

/** En-tête formulaire de tous les comptes : petit logo Splash + titres. */
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
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
        <SonalBrandMark size="sm" className="shrink-0" />
        <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#b58d00]">
            {eyebrow}
          </p>
          <h2 className="font-display mt-1 text-3xl text-[#1a364d]">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  )
}

/**
 * Bandeau d’état / rapport à l’écran :
 * logo Splash officiel à gauche, libellés à droite (sans doublon de marque).
 */
export function ReportEtatHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-[#e8f1f8] to-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-4">
        <SonalBrandMark size="sm" className="shrink-0" />
        <div className="min-w-0 border-l border-slate-200/80 pl-4">
          <p className="text-sm font-semibold text-[#0f4c75]">{title}</p>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  )
}

/** Bandeau compact logo + SONAL (Braggadocio) pour formulaires internes. */
export function FormBrandBar({ title }: { title?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3">
      <SonalBrandMark size="sm" />
      {title ? (
        <p className="border-l border-slate-200 pl-3 text-sm font-medium text-slate-700">
          {title}
        </p>
      ) : null}
    </div>
  )
}
