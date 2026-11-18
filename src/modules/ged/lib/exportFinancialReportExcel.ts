import * as XLSX from 'xlsx'
import { format } from '@/lib/format'
import {
  globalTotalsByDevise,
  groupFinancialRows,
} from '@/modules/ged/lib/financialReportGroups'
import {
  AVIS_AVAL_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  type FinancialReportRow,
  type Profile,
} from '@/types/ged'

export function exportFinancialReportExcel(params: {
  rows: FinancialReportRow[]
  profile: Profile
  periodLabel: string
  filename?: string
}) {
  const { rows, profile, periodLabel } = params
  const stamp = new Date().toISOString().slice(0, 10)
  const groups = groupFinancialRows(rows)
  const global = globalTotalsByDevise(rows)

  const sheetData: (string | number)[][] = [
    ['SONAL S.A. — Rapport financier (notes de frais & mises à disposition)'],
    [`Période : ${periodLabel}`],
    [`Émis par : ${profile.full_name} (${ROLE_LABELS[profile.role]})`],
    [
      `Service : ${profile.direction?.libelle ?? profile.service?.libelle ?? '—'}`,
    ],
    [`Généré le : ${format.datetime(new Date().toISOString())}`],
    [`Nombre de dossiers : ${rows.length}`],
    [],
  ]

  const header = [
    'N°',
    'Date doc.',
    'Folio',
    'Concerne',
    'Référence',
    'Émetteur',
    'Montant',
    'Devise',
    'Statut',
    'Avis final',
    'Chaîne d’aval (autorités)',
  ]

  let globalNum = 0
  for (const g of groups) {
    sheetData.push([`▸ ${g.label.toUpperCase()} — ${g.items.length} dossier(s)`])
    sheetData.push(header)

    g.items.forEach((r) => {
      globalNum += 1
      sheetData.push([
        globalNum,
        format.date(r.date_doc),
        r.folio,
        r.concerne,
        r.reference,
        r.emetteur,
        Number(r.montant) || 0,
        r.devise,
        STATUS_LABELS[r.statut] ?? r.statut,
        r.avis_aval ? AVIS_AVAL_LABELS[r.avis_aval] : 'En attente d’aval',
        r.chaine_aval,
      ])
    })

    sheetData.push([])
    sheetData.push([`Cumul ${g.label}`])
    for (const t of g.totalsByDevise) {
      sheetData.push([
        `${t.count} ligne(s)`,
        '',
        '',
        '',
        '',
        '',
        t.total,
        t.devise,
        '',
        '',
        `Sous-total ${t.devise}`,
      ])
    }
    sheetData.push([])
  }

  if (global.length > 0) {
    sheetData.push(['══ TOTAL GÉNÉRAL PAR DEVISE ══'])
    for (const t of global) {
      sheetData.push([
        `${t.count} dossier(s)`,
        '',
        '',
        '',
        '',
        '',
        t.total,
        t.devise,
        '',
        '',
        `Total ${t.devise}`,
      ])
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  ws['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 10 },
    { wch: 32 },
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 8 },
    { wch: 16 },
    { wch: 16 },
    { wch: 70 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Rapport financier')
  XLSX.writeFile(
    wb,
    params.filename ?? `rapport-financier-sonal-${stamp}.xlsx`,
  )
}
