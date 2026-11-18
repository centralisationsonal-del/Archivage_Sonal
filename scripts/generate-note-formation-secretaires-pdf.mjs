/**
 * Note de formation PDF — Secrétaires (narration d’usage) + Superuser (page suivante).
 * Place le fichier sur le Bureau.
 * Usage : node scripts/generate-note-formation-secretaires-pdf.mjs
 */
import { jsPDF } from 'jspdf'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const logoPath = path.join(root, 'public', 'New_Logo_Sona_Splash.png')
const logoFallback = path.join(root, 'scripts', 'logo-guide-formation.png')

const BLUE = [15, 76, 117]
const TEAL = [15, 118, 110]
const INK = [30, 41, 59]
const MUTED = [100, 116, 139]
const LIGHT = [232, 241, 248]

function resolveDesktop() {
  const candidates = [
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Bureau'),
    path.join(os.homedir(), 'OneDrive', 'Desktop'),
    path.join(os.homedir(), 'OneDrive', 'Bureau'),
    process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, 'Desktop')
      : null,
  ].filter(Boolean)
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

function loadLogoDataUrl() {
  const file = fs.existsSync(logoPath) ? logoPath : logoFallback
  if (!fs.existsSync(file)) return null
  const b64 = fs.readFileSync(file).toString('base64')
  const mime = file.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${b64}`
}

function footer(doc, subtitle) {
  const n = doc.getNumberOfPages()
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setDrawColor(...BLUE)
    doc.setLineWidth(0.5)
    doc.line(40, h - 36, w - 40, h - 36)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(subtitle, 40, h - 22)
    doc.text(`Page ${i} / ${n}`, w - 40, h - 22, { align: 'right' })
  }
}

function band(doc, y, title) {
  const w = doc.internal.pageSize.getWidth()
  if (y > doc.internal.pageSize.getHeight() - 90) {
    doc.addPage()
    y = 48
  }
  doc.setFillColor(...BLUE)
  doc.roundedRect(40, y, w - 80, 24, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(title, 50, y + 16)
  return y + 36
}

function ensure(doc, y, need = 70) {
  if (y + need > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage()
    return 48
  }
  return y
}

function para(doc, y, text, opts = {}) {
  const w = doc.internal.pageSize.getWidth() - 80
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
  doc.setFontSize(opts.size ?? 10)
  doc.setTextColor(...(opts.color ?? INK))
  const split = doc.splitTextToSize(text, w)
  y = ensure(doc, y, split.length * 13 + 10)
  doc.text(split, 40, y)
  return y + split.length * 13 + (opts.gap ?? 8)
}

function bullets(doc, y, items) {
  const w = doc.internal.pageSize.getWidth() - 95
  for (const item of items) {
    const split = doc.splitTextToSize(item, w)
    y = ensure(doc, y, split.length * 13 + 6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...TEAL)
    doc.text('•', 44, y)
    doc.setTextColor(...INK)
    doc.text(split, 56, y)
    y += split.length * 13 + 4
  }
  return y + 4
}

function sub(doc, y, title) {
  y = ensure(doc, y, 28)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...BLUE)
  doc.text(title, 40, y)
  return y + 16
}

const desktop = resolveDesktop()
const outPath = path.join(
  desktop,
  'SONAL_Note_Formation_Secretaires_et_Superuser.pdf',
)
const logo = loadLogoDataUrl()
const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
const pageW = doc.internal.pageSize.getWidth()
const edition = new Date().toLocaleDateString('fr-FR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

// ═══════════════ Couverture ═══════════════
doc.setFillColor(...BLUE)
doc.rect(0, 0, pageW, 210, 'F')
if (logo) {
  try {
    const fmt = logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG'
    doc.addImage(logo, fmt, 40, 32, 64, 64)
  } catch {
    /* ignore */
  }
}
doc.setFont('helvetica', 'bold')
doc.setFontSize(20)
doc.setTextColor(255, 255, 255)
doc.text('SONAL S.A.', 120, 55)
doc.setFont('helvetica', 'normal')
doc.setFontSize(10)
doc.text('Société Nationale de Loterie', 120, 72)
doc.setFont('helvetica', 'bold')
doc.setFontSize(16)
doc.text('Note de formation — usage du logiciel GED', 40, 130)
doc.setFont('helvetica', 'normal')
doc.setFontSize(11)
doc.text('Archivage & Circulation documentaire', 40, 152)
doc.setFontSize(10)
doc.text(`Édition du ${edition}`, 40, 174)
doc.text('https://archivage-sonal-342.netlify.app', 40, 192)

doc.setFillColor(...LIGHT)
doc.roundedRect(40, 230, pageW - 80, 70, 4, 4, 'F')
doc.setFont('helvetica', 'bold')
doc.setFontSize(11)
doc.setTextColor(...BLUE)
doc.text('Contenu du document', 52, 252)
doc.setFont('helvetica', 'normal')
doc.setFontSize(10)
doc.setTextColor(...INK)
doc.text(
  'Partie A — Narration pour les secrétaires (profils Sec_*) : comment utiliser le logiciel au quotidien.',
  52,
  272,
)
doc.text(
  'Partie B — (page suivante) Guide Superuser : pilotage, profils, sauvegarde et vue transversale.',
  52,
  288,
)

let y = 330
y = para(
  doc,
  y,
  'Ce document sert de support de séance : le formateur lit les étapes à voix haute pendant que les secrétaires reproduisent les gestes dans l’application. Chaque bureau Sec_* travaille dans son espace isolé ; les courriers des autres secrétariats restent invisibles.',
)

// ═══════════════ PARTIE A — SECRÉTAIRES ═══════════════
y = band(doc, y + 6, 'PARTIE A — FORMATION DES SECRÉTAIRES')

y = sub(doc, y, 'A.1  Connexion et premier regard')
y = bullets(doc, y, [
  'Ouvrir Chrome ou Edge, puis l’adresse https://archivage-sonal-342.netlify.app',
  'Saisir le matricule et le mot de passe fournis par le Superuser.',
  'Vérifier en haut à droite : votre nom, votre photo (si enregistrée) et le rôle « Secrétariat ».',
  'Choisir l’Entité / instance (ex. Kinshasa) : ce filtre borne les listes, agents et archives affichées.',
])

y = sub(doc, y, 'A.2  Votre bureau Sec_* (isolement)')
y = bullets(doc, y, [
  'Votre profil porte un code bureau : Sec_Adg, Sec_Df, Sec_Dt, Sec_Da, Sec_Archive, etc.',
  'Vous ne voyez que les courriers de votre parapheur — jamais ceux d’un autre Sec_*.',
  'Ne partagez jamais votre session ; déconnectez-vous (bouton Déconnexion) en quittant le poste.',
])

y = sub(doc, y, 'A.3  Tableau de bord (vue d’ensemble)')
y = bullets(doc, y, [
  'Les indicateurs résument : À orienter, À expédier, Folios, Archivés.',
  'Cliquez sur une carte ou un onglet pour ouvrir la file correspondante.',
  'Utilisez « Actualiser » seulement si besoin ; l’écran se met à jour sans clignoter.',
])

y = sub(doc, y, 'A.4  Recevoir et orienter un courrier')
y = bullets(doc, y, [
  'Onglet « À orienter » : sélectionnez le courrier dans la liste de gauche.',
  'Consultez l’aperçu PDF et la chronologie (traçabilité) à droite.',
  'Choisissez l’agent destinataire (liste de votre direction / entité), renseignez le folio si demandé, ajoutez une note utile.',
  'Validez l’orientation : le courrier quitte votre file et arrive chez le cadre ou le chef concerné.',
  'Une preuve d’acte s’affiche : vous pouvez la fermer après lecture.',
])

y = sub(doc, y, 'A.5  Expédier un courrier')
y = bullets(doc, y, [
  'Onglet « À expédier » : courriers prêts à quitter votre bureau (autre secrétariat, retour, etc.).',
  'Sélectionnez le destinataire / la direction, précisez la note, puis validez.',
  'Contrôlez toujours l’objet, la référence et le destinataire avant d’envoyer.',
])

y = sub(doc, y, 'A.6  Nouveau courrier et archivage local')
y = bullets(doc, y, [
  'Onglet « Nouveau courrier » : créez un document (objet, référence, fichier PDF ou image accepté).',
  'Onglet « Archiver » : enregistrez un document dans votre registre (emplacement secrétariat obligatoire).',
  'Onglet « Envoyer archives » : transmettez un dossier archivé vers Documentation & Archives ou un autre circuit prévu.',
  'Onglet « Registre folios » : consultez les folios déjà affectés.',
])

y = sub(doc, y, 'A.7  Rechercher, lire, nettoyer, rapporter')
y = bullets(doc, y, [
  '« Rechercher » : retrouvez un document par mots-clés / critères dans votre périmètre.',
  '« Lecture PDF » : ouvrez un PDF pour consultation à l’écran.',
  '« Nettoyer » : purge des archives anciennes selon les règles (âge minimal) — à utiliser avec prudence.',
  '« Rapport » : produisez un état documentaire (PDF / Excel) pour votre activité.',
  '« Demande Archives » : sollicitez un document auprès du service Documentation & Archives.',
])

y = sub(doc, y, 'A.8  Messagerie inter-secrétariats')
y = bullets(doc, y, [
  'Onglet « Messagerie Sec_* » : écrivez à un autre bureau pour demander un courrier ou un renseignement.',
  'Le destinataire accepte ou refuse ; en cas d’acceptation, le transfert peut suivre le circuit prévu.',
  'Cette messagerie ne remplace pas l’orientation / expédition officielle du parapheur.',
])

y = sub(doc, y, 'A.9  Agenda du Chef')
y = bullets(doc, y, [
  'Onglet « Agenda du Chef » : outil de pilotage des audiences, réunions et rendez-vous de votre bureau.',
  'Renseignez le chef, le type (Audience / Réunion / RDV), la personne solliciteuse, l’objet, la date et l’heure.',
  'Les listes déroulantes (combos) mémorisent les valeurs déjà saisies pour aller plus vite.',
  'Enregistrez, puis utilisez WhatsApp, e-mail ou copie du message pour informer le Chef.',
  'Votre agenda est personnel : les autres Sec_* ne le voient pas.',
  'Boutons « État PDF » / « Imprimer » : synthèse groupée par mois pour le classeur ou la hiérarchie.',
])

y = sub(doc, y, 'A.10  Gestes de fin de séance (checklist)')
y = bullets(doc, y, [
  'Files « À orienter » et « À expédier » traitées ou clairement reportées.',
  'Aucun document sensible laissé ouvert sur l’écran.',
  'Déconnexion effectuée.',
  'En cas de doute sur un droit ou un bureau : contacter le Superuser, ne pas emprunter un autre compte.',
])

// ═══════════════ PARTIE B — SUPERUSER (nouvelle page) ═══════════════
doc.addPage()
y = 48

doc.setFillColor(...TEAL)
doc.roundedRect(40, y, pageW - 80, 36, 3, 3, 'F')
doc.setFont('helvetica', 'bold')
doc.setFontSize(13)
doc.setTextColor(255, 255, 255)
doc.text('PARTIE B — SUPERUSER (Direction Administrative)', 52, y + 23)
y += 52

y = para(
  doc,
  y,
  'Le Superuser dispose du pilotage transversal de la GED. Il configure les comptes, surveille les files de tous les secrétariats, gère les sauvegardes et peut consulter l’ensemble des agendas. Cette partie complète la formation des secrétaires : elle s’adresse au formateur / administrateur fonctionnel.',
)

y = band(doc, y + 4, 'B.1  Rôle et périmètre')
y = bullets(doc, y, [
  'Connexion avec un compte de rôle Direction Administrative (Superuser).',
  'Vue globale des circulations, files secrétariat, parcours P1–P4 et diffusion.',
  'Seul le Superuser voit tous les bureaux Sec_* et tous les agendas du Chef.',
  'Il n’oriente pas à la place du secrétariat au quotidien : il pilote, corrige et administre.',
])

y = band(doc, y + 2, 'B.2  Tableau de bord Superuser')
y = bullets(doc, y, [
  'Indicateurs : circulations, dossiers en cours, folios, agents RH actifs.',
  'Onglet Flux : suivi des files et files d’attente par direction.',
  'Onglet Parcours : répartition P1 (via secrétariats), P2/P4 (intra), P3 (cadres), BROADCAST.',
  'Filtres parcours / statut / direction pour isoler un incident ou un goulot.',
])

y = band(doc, y + 2, 'B.3  Gestion des profils (critique pour la formation Sec_*)')
y = bullets(doc, y, [
  'Onglet « Profils » : créer ou mettre à jour les comptes (matricule, nom, rôle, direction, service).',
  'Pour chaque secrétaire : affecter le bon code bureau Sec_* (Sec_Adg, Sec_Df, Sec_Dt, …).',
  'Sans code Sec_* correct, l’isolement du parapheur et de l’agenda ne fonctionne pas.',
  'Vérifier l’entité / l’actif RH ; désactiver les comptes des agents partis.',
  'Photo : liée au matricule (TbPersonnels) — apparaît dans l’en-tête après connexion.',
])

y = band(doc, y + 2, 'B.4  Documentation, rapports et demandes')
y = bullets(doc, y, [
  'Recherche et lecture PDF : accès transverse pour le contrôle et l’appui.',
  'Rapport documentaire et rapport financier (notes de frais / MAD) en PDF ou Excel.',
  'Demande Archives : suivi des sollicitations vers Documentation & Archives.',
  'Purge : suppression contrôlée des archives trop anciennes (règle d’âge minimal).',
])

y = band(doc, y + 2, 'B.5  Agenda du Chef (vue Superuser)')
y = bullets(doc, y, [
  'Onglet Agenda : consultation de l’ensemble des agendas (tous profils Sec_*).',
  'Utile pour le suivi hiérarchique et l’appui en cas d’absence d’un secrétariat.',
  'États PDF synthèse mensuelle : même outil que pour les secrétaires.',
])

y = band(doc, y + 2, 'B.6  Sauvegarde & restauration')
y = bullets(doc, y, [
  'Onglet « Sauvegarde » (Pilotage GED) : exporter une sauvegarde complète vers le dossier prévu.',
  'Conserver régulièrement une copie (ex. fichier ged-backup-….json).',
  'Restauration : uniquement après validation explicite — opération sensible.',
])

y = band(doc, y + 2, 'B.7  Diffusion générale')
y = bullets(doc, y, [
  'Onglet Diffusion : envoi d’un document à l’ensemble des secrétariats (parcours BROADCAST).',
  'Réserver aux communications officielles de la Direction Administrative.',
])

y = band(doc, y + 2, 'B.8  Déroulé recommandé de la séance')
y = bullets(doc, y, [
  '30 min — Présentation isolement Sec_* + connexion (Partie A.1 à A.3).',
  '45 min — Exercices orientation / expédition / archivage (A.4 à A.6).',
  '30 min — Messagerie Sec_* + Agenda du Chef + état PDF (A.8 à A.9).',
  '30 min — Superuser : création d’un compte Sec_* test, contrôle des files, rappel sauvegarde (Partie B).',
  '15 min — Questions / checklist de fin (A.10).',
])

y = ensure(doc, y, 80)
doc.setFillColor(...LIGHT)
doc.roundedRect(40, y, pageW - 80, 56, 4, 4, 'F')
doc.setFont('helvetica', 'bold')
doc.setFontSize(10)
doc.setTextColor(...BLUE)
doc.text('Rappel', 52, y + 18)
doc.setFont('helvetica', 'normal')
doc.setFontSize(9.5)
doc.setTextColor(...INK)
const rappel = doc.splitTextToSize(
  'Toute anomalie d’isolement (un Sec_* voit les courriers d’un autre) doit être signalée immédiatement au Superuser pour vérification du code bureau dans les profils. Application : https://archivage-sonal-342.netlify.app',
  pageW - 104,
)
doc.text(rappel, 52, y + 34)

footer(
  doc,
  'SONAL S.A. — Note de formation Secrétaires & Superuser (GED)',
)

doc.save(outPath)
console.log('PDF créé sur le Bureau :', outPath)
