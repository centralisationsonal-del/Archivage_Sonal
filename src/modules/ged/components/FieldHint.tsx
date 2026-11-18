import { HelpCircle } from 'lucide-react'

/** Infobulle au survol (zone de saisie / option) */
export function FieldHint({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <HelpCircle
        className="h-3.5 w-3.5 cursor-help text-slate-400 group-hover:text-[#0f4c75]"
        aria-hidden
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-white shadow-lg group-hover:block"
      >
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
      </span>
    </span>
  )
}
