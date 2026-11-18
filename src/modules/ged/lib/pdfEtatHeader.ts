import type { jsPDF } from 'jspdf'
import {
  SONAL_LOGO_PATH,
  SONAL_LOGO_REPORT_PATH,
  SONAL_LOGO_REPORT_URL,
  SONAL_LOGO_URL,
} from '@/lib/branding'

/** Logo Splash officiel (prioritaire) + fallback paysage. */
export async function loadReportLogoDataUrl(): Promise<string | null> {
  for (const src of [
    SONAL_LOGO_URL,
    SONAL_LOGO_PATH,
    SONAL_LOGO_REPORT_URL,
    SONAL_LOGO_REPORT_PATH,
  ]) {
    try {
      const res = await fetch(src)
      if (!res.ok) continue
      const blob = await res.blob()
      return await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
    } catch {
      /* essai suivant */
    }
  }
  return null
}

type Rgb = [number, number, number]

/** Dimensions PDF du Splash (carré, fond noir). */
const SPLASH_PDF = { width: 58, height: 58 }

/**
 * En-tête PDF paysage :
 * [logo Splash SONAL] …… [titre à droite]
 */
export function drawPdfEtatHeader(
  doc: jsPDF,
  logo: string | null,
  opts: {
    title: string
    linesRight: string[]
    blue: Rgb
    ink: Rgb
    marginX?: number
    logoY?: number
  },
): number {
  const pageW = doc.internal.pageSize.getWidth()
  const marginX = opts.marginX ?? 28
  const logoY = opts.logoY ?? 16
  const logoW = SPLASH_PDF.width
  const logoH = SPLASH_PDF.height

  if (logo) {
    try {
      const fmt = logo.includes('jpeg') || logo.includes('jpg') ? 'JPEG' : 'PNG'
      doc.addImage(logo, fmt, marginX, logoY, logoW, logoH)
    } catch {
      try {
        doc.addImage(logo, 'PNG', marginX, logoY, logoW, logoH)
      } catch {
        try {
          doc.addImage(logo, 'JPEG', marginX, logoY, logoW, logoH)
        } catch {
          /* ignore */
        }
      }
    }
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...opts.blue)
    doc.text('SONAL S.A.', marginX, logoY + 22)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...opts.ink)
    doc.text('Société Nationale de Loterie', marginX, logoY + 34)
  }

  const rightX = pageW - marginX
  const titleY = logoY + 16
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...opts.blue)
  doc.text(opts.title, rightX, titleY, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...opts.ink)
  opts.linesRight.forEach((line, i) => {
    doc.text(line, rightX, titleY + 12 + i * 11, { align: 'right' })
  })

  const ruleY = logoY + logoH + 8
  doc.setDrawColor(...opts.blue)
  doc.setLineWidth(1.1)
  doc.line(marginX, ruleY, pageW - marginX, ruleY)
  doc.setLineWidth(0.4)
  doc.line(marginX, ruleY + 3, pageW - marginX, ruleY + 3)

  return ruleY
}
