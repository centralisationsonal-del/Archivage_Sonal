import { SonalLogo } from '@/modules/ged/components/SonalLogo'

type Props = {
  /** Affiche le sous-titre sous SONAL */
  subtitle?: string
  /** Taille du logo splash (sans texte) */
  size?: 'sm' | 'md' | 'lg' | 'header'
  /** Variante sombre (login) */
  dark?: boolean
  className?: string
}

/**
 * Marque SONAL : logo Splash (sans texte) + libellé « SONAL » en Braggadocio.
 * Version compacte pour laisser de la place aux textes de droite.
 */
export function SonalBrandMark({
  subtitle,
  size = 'sm',
  dark = false,
  className = '',
}: Props) {
  return (
    <div className={`flex min-w-0 max-w-full items-center gap-2 ${className}`.trim()}>
      <SonalLogo
        size={size === 'md' || size === 'header' ? 'sm' : size}
        className="shrink-0 object-contain !h-9 !w-9"
      />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p
          className={
            dark
              ? 'font-brand text-sonal-brand text-base leading-none tracking-wide sm:text-lg'
              : 'font-brand text-sonal-brand-header text-sm leading-none tracking-wide sm:text-base'
          }
        >
          SONAL
        </p>
        {subtitle ? (
          <p
            className={`mt-0.5 truncate text-[11px] leading-tight sm:text-xs ${
              dark ? 'text-teal-100/80' : 'text-slate-500'
            }`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  )
}
