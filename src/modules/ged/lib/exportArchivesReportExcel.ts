import * as XLSX from 'xlsx'
import { format } from '@/lib/format'
import type { ArchiveReportRow, Profile } from '@/types/ged'
import { ROLE_LABELS } from '@/types/ged'

export function exportArchivesReportExcel(params: {
  rows: ArchiveReportRow[]
  profile: Profile
  periodLabel: string
  filename?: string
}) {
  const { rows, profile, periodLabel } = params
  const stamp = new Date().toISOString().slice(0, 10)

  const meta = [
    ['SONAL S.A. — Rapport de gestion documentaire'],
    [`Période (mise à jour) : ${periodLabel}`],
    [`Émis par : ${profile.full_name} (${ROLE_LABELS[profile.role]})`],
    [
      `Service : ${profile.direction?.libelle ?? 'Documentation & Archives'}`,
    ],
    [`Généré le : ${format.datetime(new Date().toISOString())}`],
    [`Nombre de résultats : ${rows.length}`],
    [],
  ]

  const header = [
    'N°',
    'Date document',
    'Date mise à jour',
    'Folio',
    'Concerne',
    'Référence',
    'Émetteur',
    'Récepteur',
    'Entité',
    'Emplacement',
    'Nom document',
    'Extension',
    'Type',
  ]

  const body = rows.map((r, idx) => [
    idx + 1,
    format.date(r.date_doc),
    format.datetime(r.date_maj),
    r.folio,
    r.concerne,
    r.reference,
    r.emetteur,
    r.recepteur,
    r.entite,
    r.emplacement,
    r.nom_document,
    r.extension || '—',
    r.type_doc,
  ])

  const sheetData = [...meta, header, ...body]
  const ws = XLSX.utils.aoa_to_sheet(sheetData)

  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 18 },
    { wch: 10 },
    { wch: 36 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 28 },
    { wch: 8 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Gestion documentaire')
  XLSX.writeFile(
    wb,
    params.filename ?? `rapport-gestion-documentaire-sonal-${stamp}.xlsx`,
  )
}
