import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from '@/lib/format'
import { drawPdfEtatHeader, loadReportLogoDataUrl } from '@/modules/ged/lib/pdfEtatHeader'
import { ROLE_LABELS, type ArchiveReportRow, type Profile } from '@/types/ged'

const SONAL_BLUE: [number, number, number] = [15, 76, 117]
const SONAL_BLUE_LIGHT: [number, number, number] = [232, 241, 248]
const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [100, 116, 139]

function stampFooter(doc: jsPDF, edition: string) {
  const total = doc.getNumberOfPages()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setDrawColor(...SONAL_BLUE)
    doc.setLineWidth(0.6)
    doc.line(28, pageH - 28, pageW - 28, pageH - 28)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text('SONAL S.A. — Gestion documentaire & archives', 28, pageH - 16)
    doc.text(`Édité le ${edition}`, pageW / 2, pageH - 16, { align: 'center' })
    doc.text(`Page ${i} / ${total}`, pageW - 28, pageH - 16, { align: 'right' })
  }
}

function drawHeader(
  doc: jsPDF,
  logo: string | null,
  meta: { periodLabel: string; profile: Profile; resultCount: number },
): number {
  const pageW = doc.internal.pageSize.getWidth()
  const marginX = 28

  const ruleY = drawPdfEtatHeader(doc, logo, {
    title: 'RAPPORT DE GESTION DOCUMENTAIRE',
    linesRight: [
      'Format A4 — Orientation paysage',
      `${meta.resultCount} document(s)`,
    ],
    blue: SONAL_BLUE,
    ink: INK,
    marginX,
  })

  const metaY = ruleY + 16
  doc.setFillColor(...SONAL_BLUE_LIGHT)
  doc.roundedRect(marginX, metaY, pageW - marginX * 2, 34, 3, 3, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...SONAL_BLUE)
  doc.text('Période (mise à jour)', marginX + 10, metaY + 12)
  doc.text('Émis par', marginX + 240, metaY + 12)
  doc.text('Service', marginX + 460, metaY + 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text(meta.periodLabel, marginX + 10, metaY + 25)
  doc.text(
    `${meta.profile.full_name} — ${ROLE_LABELS[meta.profile.role]}`,
    marginX + 240,
    metaY + 25,
  )
  doc.text(
    meta.profile.direction?.libelle ?? 'Documentation & Archives',
    marginX + 460,
    metaY + 25,
  )

  return metaY + 46
}

export async function exportArchivesReportPdf(params: {
  rows: ArchiveReportRow[]
  profile: Profile
  periodLabel: string
  filename?: string
}) {
  const { rows, profile, periodLabel } = params
  const edition = format.datetime(new Date().toISOString())
  const logo = await loadReportLogoDataUrl()

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const marginX = 28
  const usable = pageW - marginX * 2
  const startY = drawHeader(doc, logo, {
    periodLabel,
    profile,
    resultCount: rows.length,
  })

  if (rows.length === 0) {
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text('Aucun document archivé pour cette période.', marginX, startY + 14)
    stampFooter(doc, edition)
    doc.save(params.filename ?? 'rapport-gestion-documentaire-sonal.pdf')
    return
  }

  const colW = {
    0: Math.round(usable * 0.05),
    1: Math.round(usable * 0.09),
    2: Math.round(usable * 0.1),
    3: Math.round(usable * 0.07),
    4: Math.round(usable * 0.16),
    5: Math.round(usable * 0.1),
    6: Math.round(usable * 0.1),
    7: Math.round(usable * 0.1),
    8: Math.round(usable * 0.1),
    9: Math.round(usable * 0.13),
  }

  autoTable(doc, {
    startY,
    head: [
      [
        'N°',
        'Date doc.',
        'Date maj.',
        'Folio',
        'Concerne',
        'Référence',
        'Émetteur',
        'Récepteur',
        'Emplacement',
        'Nom PDF',
      ],
    ],
    body: rows.map((r, idx) => [
      String(idx + 1),
      format.date(r.date_doc),
      format.datetime(r.date_maj),
      r.folio,
      r.concerne,
      r.reference,
      r.emetteur,
      r.recepteur,
      r.emplacement,
      r.nom_document,
    ]),
    margin: { left: marginX, right: marginX, top: 18, bottom: 36 },
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: { top: 3.5, right: 2.5, bottom: 3.5, left: 2.5 },
      overflow: 'linebreak',
      valign: 'middle',
      textColor: INK,
      lineColor: [203, 213, 225],
      lineWidth: 0.3,
      minCellHeight: 15,
    },
    headStyles: {
      fillColor: SONAL_BLUE,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      valign: 'middle',
      cellPadding: 4,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: colW[0], halign: 'center' },
      1: { cellWidth: colW[1], halign: 'center' },
      2: { cellWidth: colW[2], halign: 'center' },
      3: {
        cellWidth: colW[3],
        halign: 'center',
        fontStyle: 'bold',
        textColor: SONAL_BLUE,
      },
      4: { cellWidth: colW[4] },
      5: { cellWidth: colW[5] },
      6: { cellWidth: colW[6] },
      7: { cellWidth: colW[7] },
      8: { cellWidth: colW[8] },
      9: { cellWidth: colW[9], fontStyle: 'bold' },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...SONAL_BLUE)
        doc.text(
          'SONAL S.A. — Rapport de gestion documentaire (suite)',
          marginX,
          22,
        )
        doc.setDrawColor(...SONAL_BLUE)
        doc.setLineWidth(0.6)
        doc.line(marginX, 28, pageW - marginX, 28)
      }
    },
  })

  stampFooter(doc, edition)
  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(
    params.filename ?? `rapport-gestion-documentaire-sonal-${stamp}.pdf`,
  )
}
