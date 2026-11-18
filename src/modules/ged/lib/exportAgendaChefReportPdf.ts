import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from '@/lib/format'
import {
  drawPdfEtatHeader,
  loadReportLogoDataUrl,
} from '@/modules/ged/lib/pdfEtatHeader'
import {
  AGENDA_TYPE_LABELS,
  ROLE_LABELS,
  SECRETARIAT_CODE_LABELS,
  type AgendaChef,
  type AgendaTypeEvenement,
  type Profile,
  type SecretariatCode,
} from '@/types/ged'

const SONAL_BLUE: [number, number, number] = [15, 76, 117]
const SONAL_BLUE_LIGHT: [number, number, number] = [232, 241, 248]
const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [100, 116, 139]
const MONTH_BAND: [number, number, number] = [15, 118, 110]

export type AgendaMonthGroup = {
  key: string
  label: string
  items: AgendaChef[]
}

function monthKey(dateRdv: string | null | undefined): string {
  if (!dateRdv?.trim()) return 'sans-date'
  const d = dateRdv.trim().slice(0, 10)
  if (/^\d{4}-\d{2}/.test(d)) return d.slice(0, 7)
  return 'sans-date'
}

function monthLabel(key: string): string {
  if (key === 'sans-date') return 'Sans date de rendez-vous'
  const [ys, ms] = key.split('-')
  const y = Number(ys)
  const m = Number(ms)
  if (!y || !m) return key
  const label = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function typeLabel(t: string | null | undefined): string {
  if (!t) return '—'
  return AGENDA_TYPE_LABELS[t as AgendaTypeEvenement] ?? t
}

function heureShort(h: string | null | undefined): string {
  if (!h?.trim()) return '—'
  return h.trim().slice(0, 5)
}

/** Regroupe les lignes par mois (YYYY-MM), ordre chronologique croissant. */
export function groupAgendaByMonth(rows: AgendaChef[]): AgendaMonthGroup[] {
  const map = new Map<string, AgendaChef[]>()
  for (const row of rows) {
    const key = monthKey(row.Date_RDV)
    const list = map.get(key) ?? []
    list.push(row)
    map.set(key, list)
  }

  const keys = [...map.keys()].sort((a, b) => {
    if (a === 'sans-date') return 1
    if (b === 'sans-date') return -1
    return a.localeCompare(b)
  })

  return keys.map((key) => {
    const items = (map.get(key) ?? []).slice().sort((a, b) => {
      const da = a.Date_RDV ?? ''
      const db = b.Date_RDV ?? ''
      if (da !== db) return da.localeCompare(db)
      return (a.Heure_RDV ?? '').localeCompare(b.Heure_RDV ?? '')
    })
    return { key, label: monthLabel(key), items }
  })
}

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
      'SONAL S.A. — Agenda électronique du Chef (synthèse mensuelle)',
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
  meta: {
    periodLabel: string
    profile: Profile
    resultCount: number
    deskLabel: string
  },
): number {
  const pageW = doc.internal.pageSize.getWidth()
  const marginX = 28

  const ruleY = drawPdfEtatHeader(doc, logo, {
    title: 'RAPPORT SYNTHÈSE — AGENDA DU CHEF',
    linesRight: [
      'Groupé en rupture par mois',
      `${meta.resultCount} rendez-vous — A4 paysage`,
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
  doc.text('Émis par', marginX + 230, metaY + 12)
  doc.text('Bureau', marginX + 480, metaY + 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text(meta.periodLabel, marginX + 10, metaY + 25)
  doc.text(
    `${meta.profile.full_name} — ${ROLE_LABELS[meta.profile.role]}`,
    marginX + 230,
    metaY + 25,
  )
  doc.text(meta.deskLabel, marginX + 480, metaY + 25)

  return metaY + 46
}

function buildPeriodLabel(dateFrom?: string, dateTo?: string): string {
  if (dateFrom && dateTo) {
    return `Du ${format.date(dateFrom)} au ${format.date(dateTo)}`
  }
  if (dateFrom) return `À partir du ${format.date(dateFrom)}`
  if (dateTo) return `Jusqu’au ${format.date(dateTo)}`
  return 'Toute la période chargée'
}

/**
 * État PDF imprimable / téléchargeable :
 * synthèse Agenda du Chef avec rupture (bandeau) par mois de l’année.
 */
export async function exportAgendaChefReportPdf(params: {
  rows: AgendaChef[]
  profile: Profile
  dateFrom?: string
  dateTo?: string
  /** Si true : ouvre un onglet prêt à imprimer en plus du téléchargement */
  openPrint?: boolean
  filename?: string
}) {
  const { rows, profile, dateFrom, dateTo } = params
  const edition = format.datetime(new Date().toISOString())
  const logo = await loadReportLogoDataUrl()
  const groups = groupAgendaByMonth(rows)
  const periodLabel = buildPeriodLabel(dateFrom, dateTo)
  const deskLabel = profile.secretariat_code
    ? (SECRETARIAT_CODE_LABELS[
        profile.secretariat_code as SecretariatCode
      ] ?? profile.secretariat_code)
    : (profile.direction?.libelle ?? 'Secrétariat')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginX = 28
  let startY = drawHeader(doc, logo, {
    periodLabel,
    profile,
    resultCount: rows.length,
    deskLabel,
  })

  if (rows.length === 0) {
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(
      'Aucun rendez-vous pour cette période.',
      marginX,
      startY + 14,
    )
    stampFooter(doc, edition)
    const emptyName =
      params.filename ??
      `agenda-chef-synthese-${new Date().toISOString().slice(0, 10)}.pdf`
    doc.save(emptyName)
    return
  }

  // Mini synthèse annuelle (compteur par mois)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...SONAL_BLUE)
  doc.text('Récapitulatif par mois', marginX, startY + 4)
  startY += 12

  autoTable(doc, {
    startY,
    head: [['Mois', 'Nb RDV', 'Confirmés', 'En attente', 'Autres']],
    body: groups.map((g) => {
      const conf = g.items.filter((r) => r.Avis_Chef === 'Confirmé').length
      const att = g.items.filter((r) => (r.Avis_Chef ?? '') === 'En Attente').length
      const autres = g.items.length - conf - att
      return [
        g.label,
        String(g.items.length),
        String(conf),
        String(att),
        String(autres),
      ]
    }),
    margin: { left: marginX, right: marginX, top: 18, bottom: 40 },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 3,
      textColor: INK,
      lineColor: [203, 213, 225],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: SONAL_BLUE,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 200 },
      1: { cellWidth: 70, halign: 'center' },
      2: { cellWidth: 80, halign: 'center' },
      3: { cellWidth: 80, halign: 'center' },
      4: { cellWidth: 70, halign: 'center' },
    },
  })

  startY =
    (
      doc as jsPDF & {
        lastAutoTable?: { finalY?: number }
      }
    ).lastAutoTable?.finalY ?? startY
  startY += 18

  let num = 0
  for (const g of groups) {
    if (startY > pageH - 130) {
      doc.addPage()
      startY = 40
    }

    doc.setFillColor(...MONTH_BAND)
    doc.roundedRect(marginX, startY, pageW - marginX * 2, 22, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(
      `${g.label.toUpperCase()} — ${g.items.length} rendez-vous`,
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
          'Heure',
          'Type',
          'Chef',
          'Solliciteur',
          'Objet',
          'Avis',
          'Lieu',
        ],
      ],
      body: g.items.map((r) => {
        num += 1
        return [
          String(num),
          format.date(r.Date_RDV),
          heureShort(r.Heure_RDV),
          typeLabel(r.type_evenement),
          r.Nom_Chef ?? '—',
          [r.Civilite, r.Pers_Sollicitee].filter(Boolean).join(' ') || '—',
          r.Objet_RDV ?? '—',
          r.Avis_Chef ?? '—',
          r.Lieu_RDV ?? '—',
        ]
      }),
      margin: { left: marginX, right: marginX, top: 18, bottom: 40 },
      styles: {
        font: 'helvetica',
        fontSize: 7,
        cellPadding: { top: 3, right: 2.5, bottom: 3, left: 2.5 },
        overflow: 'linebreak',
        valign: 'middle',
        textColor: INK,
        lineColor: [203, 213, 225],
        lineWidth: 0.25,
        minCellHeight: 14,
      },
      headStyles: {
        fillColor: SONAL_BLUE,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
        valign: 'middle',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        1: { cellWidth: 68, halign: 'center' },
        2: { cellWidth: 40, halign: 'center' },
        3: { cellWidth: 62, halign: 'center' },
        4: { cellWidth: 90 },
        5: { cellWidth: 100 },
        6: { cellWidth: 160 },
        7: { cellWidth: 70, halign: 'center' },
        8: { cellWidth: 'auto' },
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.setTextColor(...SONAL_BLUE)
          doc.text(
            'SONAL S.A. — Agenda du Chef (suite)',
            marginX,
            22,
          )
          doc.setDrawColor(...SONAL_BLUE)
          doc.setLineWidth(0.6)
          doc.line(marginX, 28, pageW - marginX, 28)
        }
      },
    })

    const lastY =
      (
        doc as jsPDF & {
          lastAutoTable?: { finalY?: number }
        }
      ).lastAutoTable?.finalY ?? startY
    startY = lastY + 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...MONTH_BAND)
    doc.text(
      `Sous-total ${g.label} : ${g.items.length} rendez-vous`,
      marginX,
      startY,
    )
    startY += 16
  }

  if (startY > pageH - 60) {
    doc.addPage()
    startY = 40
  }
  doc.setFillColor(...SONAL_BLUE)
  doc.roundedRect(marginX, startY, pageW - marginX * 2, 22, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(
    `TOTAL GÉNÉRAL — ${rows.length} rendez-vous · ${groups.length} mois`,
    marginX + 10,
    startY + 14,
  )

  stampFooter(doc, edition)

  const stamp = new Date().toISOString().slice(0, 10)
  const filename =
    params.filename ?? `agenda-chef-synthese-${stamp}.pdf`

  // Impression / téléchargement uniquement après confirmation côté UI (openPrint / save explicites)
  if (params.openPrint === true) {
    try {
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (win) {
        win.addEventListener('load', () => {
          try {
            win.focus()
            win.print()
          } catch {
            /* navigateur bloque parfois print auto */
          }
        })
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
    } catch {
      /* fallback téléchargement seul */
    }
  }

  doc.save(filename)
}
