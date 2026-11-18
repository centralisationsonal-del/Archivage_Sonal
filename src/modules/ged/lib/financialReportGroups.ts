import {
  TYPE_DOCUMENT_LABELS,
  type FinancialReportRow,
  type TypeDocument,
} from '@/types/ged'

export type FinancialTypeKey = Extract<
  TypeDocument,
  'note_frais' | 'mise_disposition'
>

export interface FinancialReportGroup {
  type: FinancialTypeKey
  label: string
  items: FinancialReportRow[]
  /** Cumuls par devise (ex. CDF, USD) */
  totalsByDevise: { devise: string; total: number; count: number }[]
}

const TYPE_ORDER: FinancialTypeKey[] = ['note_frais', 'mise_disposition']

function totalsByDevise(
  items: FinancialReportRow[],
): FinancialReportGroup['totalsByDevise'] {
  const map = new Map<string, { total: number; count: number }>()
  for (const r of items) {
    const devise = (r.devise || 'CDF').toUpperCase()
    const cur = map.get(devise) ?? { total: 0, count: 0 }
    cur.total += Number(r.montant) || 0
    cur.count += 1
    map.set(devise, cur)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([devise, v]) => ({ devise, total: v.total, count: v.count }))
}

/** Groupe les lignes par type de document + cumuls par monnaie */
export function groupFinancialRows(
  rows: FinancialReportRow[],
): FinancialReportGroup[] {
  return TYPE_ORDER.map((type) => {
    const items = rows.filter((r) => r.type_document === type)
    return {
      type,
      label: TYPE_DOCUMENT_LABELS[type],
      items,
      totalsByDevise: totalsByDevise(items),
    }
  }).filter((g) => g.items.length > 0)
}

/** Totaux globaux par devise (tous types confondus) */
export function globalTotalsByDevise(
  rows: FinancialReportRow[],
): FinancialReportGroup['totalsByDevise'] {
  return totalsByDevise(rows)
}
