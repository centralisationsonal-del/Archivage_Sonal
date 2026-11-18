import {
  SONAL_LOGO_ALT,
  SONAL_LOGO_PATH,
  SONAL_LOGO_URL,
} from '@/lib/branding'
import { useState } from 'react'

interface Props {
  className?: string
  /** Logo Splash officiel (sans texte) */
  size?: 'sm' | 'md' | 'lg' | 'hero' | 'header'
}

const SIZE_CLASS = {
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  header: 'h-14 w-14',
  hero: 'h-28 w-28 sm:h-32 sm:w-32',
} as const

/**
 * Logo Splash SONAL sans texte (New_Logo_Sona_Splash.png).
 */
export function SonalLogo({ className = '', size = 'md' }: Props) {
  const [src, setSrc] = useState(SONAL_LOGO_URL || SONAL_LOGO_PATH)
  return (
    <img
      src={src}
      alt={SONAL_LOGO_ALT}
      className={`${SIZE_CLASS[size]} shrink-0 rounded-lg bg-transparent object-contain ${className}`.trim()}
      loading="eager"
      decoding="async"
      onError={() => {
        if (src !== SONAL_LOGO_PATH) setSrc(SONAL_LOGO_PATH)
      }}
    />
  )
}
