import * as XLSX from 'xlsx'
import { format } from '@/lib/format'
import type { DocumentReportRow, Profile } from '@/types/ged'
import { ROLE_LABELS } from '@/types/ged'

export function exportDocumentReportExcel(params: {
  rows: DocumentReportRow[]
  profile: Profile
  periodLabel: string
  filename?: string
}) {
  const { rows, profile, periodLabel } = params
  const stamp = new Date().toISOString().slice(0, 10)

  const meta = [
    ["SONAL S.A. — Rapport d'archivage — récapitulatif de circuit"],
    [`Période : ${periodLabel}`],
    [
      `Émis par : ${profile.full_name} (${ROLE_LABELS[profile.role]})`,
    ],
    [`Direction : ${profile.direction?.libelle ?? '— (vue globale)'}`],
    [`Généré le : ${format.datetime(new Date().toISOString())}`],
    [`Nombre de résultats : ${rows.length}`],
    [],
  ]

  const header = [
    'N°',
    'Nom document',
    'Extension',
    'Date envoi / maj.',
    'Émetteur',
    'Destinataire',
    'Objet',
    'Référence',
    'Folio',
    'Circuit',
  ]

  const body = rows.map((r, idx) => [
    idx + 1,
    r.nom_document,
    r.extension || '—',
    format.datetime(r.date_envoye),
    r.emetteur,
    r.destinataire,
    r.objet,
    r.reference,
    r.folio,
    r.circuit,
  ])

  const sheetData = [...meta, header, ...body]
  const ws = XLSX.utils.aoa_to_sheet(sheetData)

  ws['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 10 },
    { wch: 18 },
    { wch: 22 },
    { wch: 22 },
    { wch: 36 },
    { wch: 18 },
    { wch: 10 },
    { wch: 32 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Circuit documentaire')
  XLSX.writeFile(
    wb,
    params.filename ?? `rapport-circuit-sonal-${stamp}.xlsx`,
  )
}
