import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from '@/lib/format'
import { drawPdfEtatHeader, loadReportLogoDataUrl } from '@/modules/ged/lib/pdfEtatHeader'
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

const SONAL_BLUE: [number, number, number] = [15, 76, 117]
const SONAL_BLUE_LIGHT: [number, number, number] = [232, 241, 248]
const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [100, 116, 139]
const AMBER: [number, number, number] = [146, 64, 14]

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
    doc.text(
      'SONAL S.A. — Rapport financier (notes de frais & MAD)',
      28,
      pageH - 16,
    )
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
    title: 'RAPPORT FINANCIER',
    linesRight: [
      'Notes de frais & mises à disposition',
      `${meta.resultCount} dossier(s) — A4 paysage`,
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
  doc.text('Période', marginX + 10, metaY + 12)
  doc.text('Émis par', marginX + 260, metaY + 12)
  doc.text('Service', marginX + 500, metaY + 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text(meta.periodLabel, marginX + 10, metaY + 25)
  doc.text(
    `${meta.profile.full_name} — ${ROLE_LABELS[meta.profile.role]}`,
    marginX + 260,
    metaY + 25,
  )
  doc.text(
    meta.profile.direction?.libelle ?? meta.profile.service?.libelle ?? '—',
    marginX + 500,
    metaY + 25,
  )

  return metaY + 46
}

export async function exportFinancialReportPdf(params: {
  rows: FinancialReportRow[]
  profile: Profile
  periodLabel: string
  filename?: string
}) {
  const { rows, profile, periodLabel } = params
  const edition = format.datetime(new Date().toISOString())
  const logo = await loadReportLogoDataUrl()
  const groups = groupFinancialRows(rows)
  const global = globalTotalsByDevise(rows)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const marginX = 28
  let startY = drawHeader(doc, logo, {
    periodLabel,
    profile,
    resultCount: rows.length,
  })

  if (rows.length === 0) {
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(
      'Aucun document financier pour cette période.',
      marginX,
      startY + 14,
    )
    stampFooter(doc, edition)
    doc.save(params.filename ?? 'rapport-financier-sonal.pdf')
    return
  }

  let num = 0
  for (const g of groups) {
    if (startY > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage()
      startY = 40
    }

    doc.setFillColor(...AMBER)
    doc.roundedRect(marginX, startY, pageW - marginX * 2, 22, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(
      `${g.label.toUpperCase()} — ${g.items.length} dossier(s)`,
      marginX + 10,
      startY + 14,
    )
    startY += 28

    autoTable(doc, {
      startY,
      head: [
        [
          'N°',
          'Date',
          'Folio',
          'Concerne',
          'Référence',
          'Émetteur',
          'Montant',
          'Dev.',
          'Statut',
          'Avis',
          'Chaîne d’aval',
        ],
      ],
      body: g.items.map((r) => {
        num += 1
        return [
          String(num),
          format.date(r.date_doc),
          r.folio,
          r.concerne,
          r.reference,
          r.emetteur,
          Number(r.montant).toLocaleString('fr-FR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          r.devise,
          STATUS_LABELS[r.statut] ?? r.statut,
          r.avis_aval ? AVIS_AVAL_LABELS[r.avis_aval] : 'En attente',
          r.chaine_aval,
        ]
      }),
      margin: { left: marginX, right: marginX, top: 18, bottom: 40 },
      styles: {
        font: 'helvetica',
        fontSize: 6.5,
        cellPadding: 2.5,
        overflow: 'linebreak',
        valign: 'middle',
        textColor: INK,
        lineColor: [203, 213, 225],
        lineWidth: 0.25,
      },
      headStyles: {
        fillColor: SONAL_BLUE,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center' },
        1: { cellWidth: 52, halign: 'center' },
        2: { cellWidth: 40, halign: 'center' },
        3: { cellWidth: 95 },
        4: { cellWidth: 70 },
        5: { cellWidth: 70 },
        6: { cellWidth: 55, halign: 'right' },
        7: { cellWidth: 28, halign: 'center' },
        8: { cellWidth: 55 },
        9: { cellWidth: 55 },
        10: { cellWidth: 'auto' },
      },
    })

    const lastY =
      (
        doc as jsPDF & {
          lastAutoTable?: { finalY?: number }
        }
      ).lastAutoTable?.finalY ?? startY
    startY = lastY + 8

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...AMBER)
    for (const t of g.totalsByDevise) {
      doc.text(
        `Cumul ${g.label} — ${t.devise} : ${format.money(t.total, t.devise)} (${t.count} ligne(s))`,
        marginX,
        startY,
      )
      startY += 12
    }
    startY += 10
  }

  if (global.length > 0) {
    if (startY > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage()
      startY = 40
    }
    doc.setFillColor(...SONAL_BLUE)
    doc.roundedRect(marginX, startY, pageW - marginX * 2, 22, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text('TOTAL GÉNÉRAL PAR DEVISE', marginX + 10, startY + 14)
    startY += 34
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    for (const t of global) {
      doc.text(
        `${t.devise} : ${format.money(t.total, t.devise)} — ${t.count} dossier(s)`,
        marginX + 10,
        startY,
      )
      startY += 14
    }
  }

  stampFooter(doc, edition)
  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(params.filename ?? `rapport-financier-sonal-${stamp}.pdf`)
}
