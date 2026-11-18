/** Logos officiels SONAL (dossier Vibe coding) */

/** Splash — icône seule (formulaires / header comptes) */
import sonalLogoSplashUrl from '@/assets/New_Logo_Sona_Splash.png'
/** Avec texte — états / rapports PDF & écrans résultats */
import sonalLogoAvecTexteUrl from '@/assets/New_Logo_Sonal_avec_Texte.jpg'

export const SONAL_LOGO_URL = sonalLogoSplashUrl
/** Chemin public (fallback fetch / PDF) */
export const SONAL_LOGO_PATH = '/New_Logo_Sona_Splash.png'
export const SONAL_LOGO_ALT = 'SONAL S.A.'

/** Logo avec texte (états) — ratio image ≈ 636×179 */
export const SONAL_LOGO_REPORT_URL = sonalLogoAvecTexteUrl
export const SONAL_LOGO_REPORT_PATH = '/assets/New_Logo_Sonal_avec_Texte.jpg'
export const SONAL_LOGO_REPORT_ALT = 'SONAL S.A. — Société Nationale de Loterie'
/** Hauteur / largeur du logo avec texte */
export const SONAL_LOGO_TEXTE_RATIO = 179 / 636

/** Dimensions recommandées PDF paysage (pt) pour logo avec texte */
export const SONAL_LOGO_TEXTE_PDF = {
  width: 132,
  get height() {
    return this.width * SONAL_LOGO_TEXTE_RATIO
  },
} as const
