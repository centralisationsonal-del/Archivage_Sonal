import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from '@/lib/format'
import { drawPdfEtatHeader, loadReportLogoDataUrl } from '@/modules/ged/lib/pdfEtatHeader'
import { ROLE_LABELS, type DocumentReportRow, type Profile } from '@/types/ged'

/** Bleu institutionnel SONAL */
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
    doc.text('SONAL S.A. — Archivage & circulation documentaire', 28, pageH - 16)
    doc.text(`Édité le ${edition}`, pageW / 2, pageH - 16, { align: 'center' })
    doc.text(`Page ${i} / ${total}`, pageW - 28, pageH - 16, { align: 'right' })
  }
}

function drawHeader(
  doc: jsPDF,
  logo: string | null,
  meta: {
    periodLabel: string
    profile: Profile
    resultCount: number
  },
): number {
  const pageW = doc.internal.pageSize.getWidth()
  const marginX = 28

  const ruleY = drawPdfEtatHeader(doc, logo, {
    title: "RAPPORT D'ARCHIVAGE — RÉCAPITULATIF DE CIRCUIT",
    linesRight: [
      'Format A4 — Orientation paysage',
      `${meta.resultCount} document(s)`,
    ],
    blue: SONAL_BLUE,
    ink: INK,
    marginX,
  })

  // Bandeau métadonnées
  const metaY = ruleY + 16
  doc.setFillColor(...SONAL_BLUE_LIGHT)
  doc.roundedRect(marginX, metaY, pageW - marginX * 2, 34, 3, 3, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...SONAL_BLUE)
  doc.text('Période', marginX + 10, metaY + 12)
  doc.text('Émis par', marginX + 210, metaY + 12)
  doc.text('Direction', marginX + 430, metaY + 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text(meta.periodLabel, marginX + 10, metaY + 25)
  doc.text(
    `${meta.profile.full_name} — ${ROLE_LABELS[meta.profile.role]}`,
    marginX + 210,
    metaY + 25,
  )
  doc.text(meta.profile.direction?.libelle ?? '—', marginX + 430, metaY + 25)

  return metaY + 46
}

export async function exportDocumentReportPdf(params: {
  rows: DocumentReportRow[]
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
    doc.text('Aucun circuit trouvé pour cette période.', marginX, startY + 14)
    stampFooter(doc, edition)
    doc.save(params.filename ?? `rapport-circuit-sonal.pdf`)
    return
  }

  const colW = {
    0: Math.round(usable * 0.14), // Nom
    1: Math.round(usable * 0.06), // Ext
    2: Math.round(usable * 0.1), // Date
    3: Math.round(usable * 0.11), // Émetteur
    4: Math.round(usable * 0.11), // Destinataire
    5: Math.round(usable * 0.16), // Objet
    6: Math.round(usable * 0.1), // Référence
    7: Math.round(usable * 0.06), // Folio
    8: Math.round(usable * 0.16), // Circuit
  }

  autoTable(doc, {
    startY,
    head: [
      [
        'Nom document',
        'Ext.',
        'Date',
        'Émetteur',
        'Destinataire',
        'Objet',
        'Référence',
        'Folio',
        'Circuit',
      ],
    ],
    body: rows.map((r, idx) => [
      { content: String(idx + 1) + '. ' + r.nom_document },
      r.extension || '—',
      format.datetime(r.date_envoye),
      r.emetteur,
      r.destinataire,
      r.objet,
      r.reference,
      r.folio,
      r.circuit,
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
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: colW[0], fontStyle: 'bold' },
      1: { cellWidth: colW[1], halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: colW[2], halign: 'center' },
      3: { cellWidth: colW[3] },
      4: { cellWidth: colW[4] },
      5: { cellWidth: colW[5] },
      6: { cellWidth: colW[6] },
      7: {
        cellWidth: colW[7],
        halign: 'center',
        fontStyle: 'bold',
        textColor: SONAL_BLUE,
      },
      8: { cellWidth: colW[8], fontSize: 6.5 },
    },
    didDrawPage: (data) => {
      // En-tête réduit sur pages suivantes
      if (data.pageNumber > 1) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...SONAL_BLUE)
        doc.text("SONAL S.A. — Rapport d'archivage (suite)", marginX, 22)
        doc.setDrawColor(...SONAL_BLUE)
        doc.setLineWidth(0.6)
        doc.line(marginX, 28, pageW - marginX, 28)
      }
    },
  })

  stampFooter(doc, edition)

  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(params.filename ?? `rapport-circuit-sonal-${stamp}.pdf`)
}
