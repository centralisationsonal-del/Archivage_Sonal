import { useEffect, useState } from 'react'
import { circulationService } from '@/services/circulationService'
import { User } from 'lucide-react'

type Props = {
  matr: string | null | undefined
  fullName?: string
  className?: string
  size?: 'sm' | 'md'
}

/** Photo TbPersonnels via matricule — pastille circulaire pour l’en-tête */
export function UserPhotoAvatar({
  matr,
  fullName,
  className = '',
  size = 'sm',
}: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setFailed(false)
    if (!matr?.trim()) return

    void circulationService
      .getPersonnelPhotoDataUrl(matr)
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [matr])

  const dim = size === 'md' ? 'h-10 w-10' : 'h-9 w-9'

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={fullName ? `Photo de ${fullName}` : 'Photo utilisateur'}
        className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm ${className}`}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <span
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-2 ring-white ${className}`}
      aria-hidden
    >
      <User className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} />
    </span>
  )
}
