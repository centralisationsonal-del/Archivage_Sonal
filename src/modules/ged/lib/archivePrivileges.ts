import type { Profile } from '@/types/ged'

/** Documentation & Archives avec privilege > 9 */
export function canManageDocsFull(profile: Profile | null | undefined): boolean {
  if (!profile) return false
  return (
    profile.role === 'documentation_archives' &&
    Number(profile.privilege ?? 0) > 9
  )
}

/** Peut cocher « Invisible de tous » */
export function canUseInvisibleFlag(profile: Profile | null | undefined): boolean {
  return canManageDocsFull(profile)
}

/** Peut voir les archives marquées Invisible de tous */
export function canSeeInvisible(profile: Profile | null | undefined): boolean {
  if (!profile) return false
  return (
    profile.role === 'dir_administrative' || canManageDocsFull(profile)
  )
}

/** Envoi d’archives vers d’autres comptes / directions */
export function canSendArchives(profile: Profile | null | undefined): boolean {
  if (!profile) return false
  if (profile.role === 'dir_administrative') return true
  if (profile.role === 'secretariat') return true
  return canManageDocsFull(profile)
}

/** Âge minimum (années) pour toute purge de documents */
export const PURGE_MIN_AGE_YEARS = 10

/** Zone purge par âge */
export function canPurgeByAge(profile: Profile | null | undefined): boolean {
  if (!profile) return false
  return (
    profile.role === 'dir_administrative' || canManageDocsFull(profile)
  )
}

/** Âge lisible depuis date_creation / date_doc */
export function formatDocumentAge(
  dateCreation: string | null | undefined,
): string {
  if (!dateCreation) return '—'
  const start = new Date(`${dateCreation.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(start.getTime())) return '—'
  const now = new Date()
  let years = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  let days = now.getDate() - start.getDate()
  if (days < 0) {
    months -= 1
    const prev = new Date(now.getFullYear(), now.getMonth(), 0)
    days += prev.getDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years <= 0 && months <= 0) {
    const diffMs = now.getTime() - start.getTime()
    const d = Math.max(0, Math.floor(diffMs / 86400000))
    return d <= 1 ? `${d} jour` : `${d} jours`
  }
  const parts: string[] = []
  if (years > 0) parts.push(years === 1 ? '1 an' : `${years} ans`)
  if (months > 0) parts.push(months === 1 ? '1 mois' : `${months} mois`)
  return parts.join(' · ') || '—'
}

export function archiveMinAgeDate(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}
