/**
 * Génère le guide de formation PDF (par profil) sur le Bureau.
 * Usage: node scripts/generate-guide-formation.mjs
 */
import { jsPDF } from 'jspdf'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const logoPath = path.join(root, 'public', 'New_Logo_Sona_Splash.png')
const logoFallback = path.join(root, 'scripts', 'logo-guide-formation.png')

function resolveDesktop() {
  const candidates = [
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'OneDrive', 'Desktop'),
    path.join(os.homedir(), 'OneDrive - Personal', 'Desktop'),
    process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, 'Desktop')
      : null,
  ].filter(Boolean)
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

const desktop = resolveDesktop()
const outPath = path.join(desktop, 'SONAL_Guide_Formation_Archivage_GED.pdf')

const BLUE = [15, 76, 117]
const TEAL = [15, 118, 110]
const INK = [30, 41, 59]
const MUTED = [100, 116, 139]
const LIGHT = [232, 241, 248]
const AMBER = [146, 64, 14]

function loadLogoDataUrl() {
  const file = fs.existsSync(logoPath) ? logoPath : logoFallback
  if (!fs.existsSync(file)) return null
  const b64 = fs.readFileSync(file).toString('base64')
  const mime = file.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${b64}`
}

function footer(doc) {
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
    doc.text('SONAL S.A. — Guide de formation Archivage & GED', 40, h - 22)
    doc.text(`Page ${i} / ${n}`, w - 40, h - 22, { align: 'right' })
  }
}

function sectionTitle(doc, y, title) {
  doc.setFillColor(...BLUE)
  doc.roundedRect(40, y, doc.internal.pageSize.getWidth() - 80, 26, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(255, 255, 255)
  doc.text(title, 52, y + 17)
  return y + 40
}

function body(doc, y, lines, opts = {}) {
  const w = doc.internal.pageSize.getWidth() - 80
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
  doc.setFontSize(opts.size ?? 10)
  doc.setTextColor(...(opts.color ?? INK))
  const text = Array.isArray(lines) ? lines.join('\n') : lines
  const split = doc.splitTextToSize(text, w)
  doc.text(split, 40, y)
  return y + split.length * ((opts.size ?? 10) * 1.35) + (opts.gap ?? 8)
}

function bullets(doc, y, items) {
  const w = doc.internal.pageSize.getWidth() - 95
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  for (const item of items) {
    const split = doc.splitTextToSize(item, w)
    if (y + split.length * 13 > doc.internal.pageSize.getHeight() - 55) {
      doc.addPage()
      y = 50
    }
    doc.setTextColor(...TEAL)
    doc.text('•', 44, y)
    doc.setTextColor(...INK)
    doc.text(split, 56, y)
    y += split.length * 13 + 4
  }
  return y + 6
}

function ensureSpace(doc, y, need = 80) {
  if (y + need > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage()
    return 50
  }
  return y
}

const logo = loadLogoDataUrl()
const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
const pageW = doc.internal.pageSize.getWidth()
const edition = new Date().toLocaleDateString('fr-FR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

// —— Couverture ——
doc.setFillColor(...BLUE)
doc.rect(0, 0, pageW, 230, 'F')
if (logo) {
  try {
    const fmt = logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG'
    doc.addImage(logo, fmt, 40, 36, 72, 72)
  } catch {
    /* ignore */
  }
}
doc.setFont('helvetica', 'bold')
doc.setFontSize(22)
doc.setTextColor(255, 255, 255)
doc.text('SONAL S.A.', 130, 62)
doc.setFont('helvetica', 'normal')
doc.setFontSize(11)
doc.text('Société Nationale de Loterie', 130, 80)
doc.setFont('helvetica', 'bold')
doc.setFontSize(18)
doc.text('Guide de formation', 40, 150)
doc.setFontSize(14)
doc.setFont('helvetica', 'normal')
doc.text('Archivage & Circulation documentaire (GED)', 40, 172)
doc.setFontSize(10)
doc.text(
  'Formation par profil — édition mise à jour (documents financiers, avals, Contrôle)',
  40,
  192,
)
doc.text(`Édition du ${edition}`, 40, 210)

doc.setTextColor(...INK)
doc.setFont('helvetica', 'bold')
doc.setFontSize(12)
doc.text('Document destiné aux utilisateurs', 40, 268)
doc.setFont('helvetica', 'normal')
doc.setFontSize(10)
let y = body(
  doc,
  288,
  'Ce guide présente, profil par profil, les écrans et gestes essentiels pour utiliser le logiciel d’archivage et de circulation documentaire de la SONAL. Il intègre les aménagements récents : notes de frais et mises à disposition, chaînes d’aval protégées, profil Contrôle & Audit, et privilèges d’édition.',
)

y = body(doc, y + 8, 'URL de l’application', { bold: true, size: 11 })
y = body(doc, y, 'https://archivage-sonal-342.netlify.app', { color: BLUE })

y = body(doc, y + 10, 'Connexion', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Ouvrir le lien ci-dessus dans un navigateur (Chrome / Edge recommandé).',
  'Page d’accueil : logo SONAL et libellé « SONAL » en police d’identité (Braggadocio).',
  'Saisir votre matricule et votre mot de passe (fournis par le Superuser).',
  'Après connexion, le tableau de bord adapté à votre rôle s’affiche automatiquement.',
])

y = body(doc, y + 4, 'Rôles prévus dans le logiciel', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Secrétariat — parapheur : orientation et expédition des courriers.',
  'Cadre — création, réception, traitement et documents financiers.',
  'Chef de service — comme Cadre + copies conformes de son service.',
  'Directeur — comme Cadre + copies conformes de sa direction.',
  'Documentation & Archives — archivage, registre classé et envoi.',
  'Contrôle & Audit — traçabilité (lecture) ; édition financière si privilège > 10.',
  'Superuser — pilotage global, comptes, privilèges et vision complète.',
])

// —— Concepts communs ——
doc.addPage()
y = sectionTitle(doc, 40, '1. Concepts communs à tous les profils')
y = body(doc, y, 'Parcours documentaires', { bold: true, size: 11 })
y = bullets(doc, y, [
  'P1 — Inter-Directions : le courrier passe par le secrétariat pour orientation.',
  'P2 — Intra-Direction (même service) : envoi direct entre agents du même service.',
  'P3 — Inter-Directions via cadres : circulation avec copie aux niveaux concernés.',
  'P4 — Intra-Direction (services différents) : via secrétariat / chefs concernés.',
  'BROADCAST — diffusion générale (réservé au Superuser).',
])

y = body(doc, y, 'Types de document', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Courrier classique — circulation habituelle.',
  'Note de frais — document financier avec aval protégé (Directeur Financier puis ADG).',
  'Mise à disposition des fonds — signée par l’émetteur à la création, puis chaîne d’avals : Chef de Budget → Directeur Administratif → Directeur Financier → ADG (aval autoritaire).',
  'Pièces jointes : PDF et autres formats métier acceptés (Word, Excel, images, etc.).',
])

y = body(doc, y, 'Statuts d’un courrier', { bold: true, size: 11 })
y = bullets(doc, y, [
  'En attente d’orientation — arrivé au secrétariat, pas encore assigné.',
  'En attente d’aval — document financier en cours de validation par l’autorité désignée.',
  'Orienté — destinataire désigné ; le cadre peut le réceptionner.',
  'Reçu — le destinataire a accusé réception.',
  'Traité — dossier clos (y compris après aval final ou avis défavorable).',
])

y = body(doc, y, 'Confidentialité (règle d’or)', { bold: true, size: 11, color: BLUE })
y = bullets(doc, y, [
  'Vous ne voyez que vos courriers (envoyés, reçus, orientés / expédiés, en copie ou en aval).',
  'Au secrétariat, ouvrir un courrier le « prend en charge » : un collègue ne le voit plus.',
  'Contrôle & Audit : lecture transverse pour la traçabilité, sans pouvoir d’aval.',
  'Ne partagez jamais vos identifiants. Déconnectez-vous en fin de session.',
])

y = body(doc, y, 'Lecture & Rapports', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Onglet Lecture / PDF : consulter le fichier attaché.',
  'Onglet Rapport (circuit) : période du / au, export PDF ou Excel — en-tête SONAL.',
  'Rapport de gestion documentaire (archives) : format professionnel A4 paysage.',
  'Rapports financiers (notes de frais / MAD) : groupés par type, cumuls par devise, signataires d’aval.',
])

// —— Aval financier ——
doc.addPage()
y = sectionTitle(doc, 40, '2. Documents financiers & chaîne d’aval')
y = body(
  doc,
  y,
  'Les notes de frais et mises à disposition engagent un circuit d’aval protégé. Seules les autorités désignées (profils / matricules résolus) peuvent donner un avis. Un avis est irrévocable. Un avis défavorable clôture le dossier.',
)
y = body(doc, y, 'Note de frais — aval protégé', { bold: true, size: 11, color: AMBER })
y = bullets(doc, y, [
  '1. Directeur Financier',
  '2. ADG (aval autoritaire)',
  'À la création : indiquer le montant et la devise (CDF, USD, EUR). Joindre les justificatifs.',
  'Le créateur ne choisit plus librement l’approbateur : le circuit est imposé.',
])
y = body(doc, y, 'Mise à disposition des fonds', { bold: true, size: 11, color: AMBER })
y = bullets(doc, y, [
  'Signature automatique de l’émetteur à la création (nom complet porté sur le dossier).',
  'Puis : Chef de Budget → Directeur Administratif → Directeur Financier → ADG.',
  'Chaque étape n’est accessible qu’au titulaire concerné (comme un Superuser dédié à son aval).',
])
y = body(doc, y, 'Donner un aval (autorité)', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Le dossier apparaît en réception avec le bouton « Aval requis » si vous êtes l’étape courante.',
  'Consulter le PDF, la chaîne d’aval et le Fil d’Ariane.',
  'Saisir une observation (facultatif) puis « Favorable » ou « Défavorable ».',
  'En cas de favorable, le dossier passe à l’autorité suivante ; sinon il est clôturé.',
  'Le profil Contrôle ne peut jamais signer un aval, même avec un privilège élevé.',
])

// —— Secrétariat ——
doc.addPage()
y = sectionTitle(doc, 40, '3. Profil Secrétariat — Parapheur virtuel')
y = body(
  doc,
  y,
  'Mission : recevoir, orienter et expédier les courriers de votre direction. Vous êtes le point de passage pour les parcours P1, P3, P4.',
)
y = body(doc, y, 'Écrans principaux', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Vue — aperçu des priorités (à orienter / à expédier).',
  'Orienter — assigner un courrier à un agent (matricule RH) + folio + instruction.',
  'Expédier — transmettre vers un agent ou une autre direction.',
  'Créer — initier un nouveau document (y compris financier si besoin).',
  'Folios — registre des numéros de folio liés à vos dossiers.',
  'Lecture & Rapport — consultation et export périodique de vos circuits.',
])
y = body(doc, y, 'Mode opératoire — Orienter un courrier', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Onglet « Orienter » → sélectionner un courrier (prise en charge exclusive).',
  'Vérifier la pièce jointe et le nombre de pages (folio proposé automatiquement).',
  'Choisir l’agent destinataire dans la liste, ajouter une instruction si besoin.',
  'Cliquer sur « Orienter » : le cadre voit alors le dossier dans sa boîte.',
])
y = body(doc, y, 'Bonnes pratiques', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Ne laissez pas de courriers longtemps « en attente d’orientation ».',
  'Contrôlez le folio avant validation.',
  'Si un message indique qu’un collègue a déjà pris le dossier, rafraîchir la liste.',
])

// —— Cadre ——
doc.addPage()
y = sectionTitle(doc, 40, '4. Profil Cadre')
y = body(
  doc,
  y,
  'Mission : créer des documents (courriers et financiers), recevoir ceux qui vous sont adressés, donner un aval si vous êtes l’autorité désignée, et marquer les dossiers comme traités.',
)
y = body(doc, y, 'Écrans principaux', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Vue — synthèse de votre boîte.',
  'Réception — courriers destinés à vous + dossiers « Aval requis ».',
  'Envois — courriers que vous avez créés / envoyés.',
  'Créer — type de document, montant/devise si financier, destinataire, pièce jointe.',
  'Lecture & Rapport — vos circuits personnels.',
])
y = body(doc, y, 'Mode opératoire — Traiter un courrier reçu', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Ouvrir « Réception » → sélectionner le dossier.',
  'Lire le PDF et la chronologie / instructions.',
  'Marquer « Reçu » puis, une fois le travail fait, « Traité ».',
])
y = body(doc, y, 'Mode opératoire — Créer un document', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Onglet « Créer » → choisir le type (courrier / note de frais / mise à disposition).',
  'Pour un financier : montant + devise ; le circuit d’aval s’affiche automatiquement.',
  'Mise à disposition : votre nom complet est enregistré comme signature d’émetteur.',
  'Choisir direction / destinataire, joindre le fichier, transmettre.',
])

// —— Chef / Directeur ——
y = ensureSpace(doc, y, 160)
y = sectionTitle(doc, y, '5. Chef de service & Directeur')
y = body(
  doc,
  y,
  'Mêmes bases que le Cadre, avec une vue élargie via les copies conformes (CC) selon le parcours. Si votre fonction RH correspond à une autorité d’aval (ex. Directeur Financier), les dossiers financiers vous sont présentés pour avis.',
)
y = bullets(doc, y, [
  'Chef de service : accès à ses courriers + CC automatiques liés à son service (P2 / P4).',
  'Directeur : accès à ses dossiers + CC au niveau de la direction (P3 / P4).',
  'Onglet dédié aux copies conformes pour le suivi sans forcément être destinataire principal.',
  'Aval : uniquement si vous êtes l’étape courante du circuit financier.',
])

// —— Documentation ——
doc.addPage()
y = sectionTitle(doc, 40, '6. Profil Documentation & Archives')
y = body(
  doc,
  y,
  'Mission : enregistrer / archiver les documents et les transmettre aux directions concernées.',
)
y = body(doc, y, 'Écrans principaux', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Vue — indicateurs de votre activité d’archivage.',
  'Archiver — fiche (objet, référence, folio, émetteur, récepteur, emplacement) + fichier.',
  'Envoyer — transmettre une archive vers une direction (secrétariat destinataire).',
  'Registre classé — regroupement par année, emplacement, folio ou extension.',
  'Lecture & Rapport — consultation et exports (circuit / gestion documentaire).',
])
y = body(doc, y, 'Mode opératoire — Archiver puis envoyer', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Compléter la fiche d’archivage et joindre le fichier → « Archiver ».',
  'Dans « Envoyer », sélectionner l’archive et la direction destinataire.',
  'Le secrétariat de cette direction reçoit le courrier à orienter.',
])

// —— Contrôle ——
doc.addPage()
y = sectionTitle(doc, 40, '7. Profil Contrôle & Audit')
y = body(
  doc,
  y,
  'Mission : suivre la traçabilité des documents (Fil d’Ariane, chaîne d’aval, pièces jointes) pour le contrôle et l’audit. Ce profil n’accorde jamais d’aval.',
)
y = body(doc, y, 'Droits selon le privilège', { bold: true, size: 11, color: BLUE })
y = bullets(doc, y, [
  'Privilège ≤ 10 : consultation uniquement (traçabilité, PDF, rapports).',
  'Privilège > 10 : en plus, édition / correction des documents financiers (objet, référence, montant, devise, émetteur) avec motif tracé dans le Fil d’Ariane.',
  'Dans tous les cas : pas d’orientation, pas d’aval favorable/défavorable.',
])
y = body(doc, y, 'Écrans principaux', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Tableau de bord — volume de dossiers, en attente d’aval, financiers, traités.',
  'Traçabilité — recherche, liste, Fil d’Ariane, chaîne d’aval, pièce jointe.',
  'Édition financière (si privilege > 10) — formulaire de correction sur le dossier sélectionné.',
  'Lecture PDF & Rapport — exports pour le contrôle.',
])
y = body(doc, y, 'Bonnes pratiques', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Toujours indiquer le motif de correction lors d’une édition financière.',
  'Ne pas utiliser un compte Contrôle pour contourner un aval manquant.',
  'Le Superuser fixe le niveau de privilège à la création / édition du compte.',
])

// —— Superuser ——
y = ensureSpace(doc, y, 220)
y = sectionTitle(doc, y, '8. Profil Superuser')
y = body(
  doc,
  y,
  'Mission : administrer le système (comptes / rôles / privilèges) et disposer d’une vision globale de la GED.',
)
y = bullets(doc, y, [
  'Gestion des profils : créer des comptes, attribuer rôle, direction, service, matricule, privilège.',
  'Rôle « Contrôle & Audit » : pour l’édition financière, fixer un privilège supérieur à 10 (ex. 11).',
  'Le libellé du rôle d’administration s’affiche « Superuser ».',
  'Tableaux de bord globaux : files par direction, documents, suivi.',
  'Rapports sur l’ensemble des circuits (périmètre global).',
  'Diffusion BROADCAST réservée à ce profil.',
  'Le Superuser ne remplace pas l’ADG pour l’aval : chaque autorité signe avec son propre profil.',
  'Responsabilité : n’attribuer que le rôle et le privilège strictement nécessaires.',
])

// —— Checklist ——
doc.addPage()
y = sectionTitle(doc, 40, '9. Fiche mémo — démarrage rapide')
y = body(doc, y, 'Pour tous', { bold: true, size: 11 })
y = bullets(doc, y, [
  'URL → Matricule + mot de passe → Tableau de bord de mon rôle.',
  'Toujours vérifier la pièce jointe avant d’orienter / traiter / avaliser.',
  'Se déconnecter (icône sortie) en quittant le poste.',
])
y = body(doc, y, 'Selon mon profil — 1 geste clé', { bold: true, size: 11 })
y = bullets(doc, y, [
  'Secrétariat : Orienter → choisir l’agent + folio → valider.',
  'Cadre : Inbox → Reçu → Traité ; ou Créer (courrier / note de frais / MAD).',
  'Autorité d’aval : Aval requis → Favorable / Défavorable.',
  'Chef / Directeur : idem Cadre + suivi des CC.',
  'Documentation : Archiver → Registre classé → Envoyer vers une direction.',
  'Contrôle : Traçabilité ; édition financière seulement si privilege > 10.',
  'Superuser : Gestion de profil (+ privilège) + supervision globale.',
])

y = body(doc, y + 6, 'Support', { bold: true, size: 11 })
y = body(
  doc,
  y,
  'En cas de problème d’accès, de rôle incorrect, de privilège insuffisant ou de direction manquante, contactez le Superuser (Direction Administrative / informatique métier). Ne tentez pas de contourner la confidentialité ni la chaîne d’aval en partageant un compte.',
)

doc.setFillColor(...LIGHT)
doc.roundedRect(40, y + 20, pageW - 80, 84, 4, 4, 'F')
doc.setFont('helvetica', 'bold')
doc.setFontSize(10)
doc.setTextColor(...BLUE)
doc.text('Référence application', 52, y + 42)
doc.setFont('helvetica', 'normal')
doc.setTextColor(...INK)
doc.text('Archivage_Sonal — GED SONAL S.A.', 52, y + 58)
doc.text('https://archivage-sonal-342.netlify.app', 52, y + 72)
doc.text(`Guide régénéré le ${edition}`, 52, y + 86)

footer(doc)

fs.mkdirSync(desktop, { recursive: true })
doc.save(outPath)
console.log('OK →', outPath)
