export const format = {
  date(value: string | null | undefined) {
    if (!value) return '—'
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  },
  datetime(value: string | null | undefined) {
    if (!value) return '—'
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  },
  money(value: number | null | undefined, devise = 'CDF') {
    const n = Number(value ?? 0)
    return `${new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)} ${devise}`
  },
}
