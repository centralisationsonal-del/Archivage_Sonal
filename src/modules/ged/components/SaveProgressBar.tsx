interface Props {
  /** 0–100 */
  value: number
  label?: string
  tone?: 'save' | 'aval' | 'success' | 'error'
}

const tones = {
  save: 'bg-[#0f4c75]',
  aval: 'bg-amber-600',
  success: 'bg-emerald-600',
  error: 'bg-red-600',
}

/** Barre de progression enregistrement / aval */
export function SaveProgressBar({ value, label, tone = 'save' }: Props) {
  const pct = Math.max(0, Math.min(100, value))
  if (pct <= 0 && !label) return null

  return (
    <div className="space-y-1.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      {label && (
        <p className="text-xs font-medium text-slate-600">{label}</p>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${tones[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-right text-[10px] tabular-nums text-slate-400">{pct} %</p>
    </div>
  )
}
