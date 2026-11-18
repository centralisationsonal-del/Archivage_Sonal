/**
 * Note d’organisation — séance de formation GED (profils Sec_*)
 * Place le document Word sur le Bureau.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'

const desks = [
  ['Sec_Adg', 'Secrétariat ADG'],
  ['Sec_Adga', 'Secrétariat ADG Adjoint'],
  ['Sec_Pca', 'Secrétariat PCA'],
  ['Sec_Df', 'Secrétariat Direction Financière'],
  ['Sec_Dt', 'Secrétariat Direction Technique'],
  ['Sec_Dc', 'Secrétariat Direction Commerciale'],
  ['Sec_Dcm', 'Secrétariat Direction Commerciale & Marketing'],
  ['Sec_Da', 'Secrétariat Direction Administrative'],
  ['Sec_Pj', 'Secrétariat Projets'],
  ['Sec_Cms', 'Secrétariat CMS'],
  ['Sec_Archive', 'Secrétariat Archives / Documentation'],
]

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 160 },
    ...opts,
    children: [
      new TextRun({
        text,
        font: 'Calibri',
        size: opts.size ?? 22,
        bold: opts.bold,
      }),
    ],
  })
}

function h(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, font: 'Calibri', bold: true, size: 28 })],
  })
}

function bullet(text) {
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: `• ${text}`, font: 'Calibri', size: 22 }),
    ],
  })
}

const doc = new Document({
  styles: {
    default: {
      document: {
        styles: [{ id: 'Normal', run: { font: 'Calibri', size: 22 } }],
      },
    },
  },
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: 'SOCIÉTÉ NATIONALE D’ÉLECTRICITÉ — SONAL',
              bold: true,
              font: 'Calibri',
              size: 24,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [
            new TextRun({
              text: 'GED — Archivage & Circulation documentaire',
              font: 'Calibri',
              size: 22,
              italics: true,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 320 },
          children: [
            new TextRun({
              text: 'NOTE D’ORGANISATION — SÉANCE DE FORMATION',
              bold: true,
              font: 'Calibri',
              size: 32,
            }),
          ],
        }),
        p(
          `Date du document : ${new Date().toLocaleDateString('fr-FR')} — Destinataire : Autorité compétente (organisation de la séance).`,
        ),

        h('1. Objet'),
        p(
          'La présente note résume brièvement le dispositif d’isolement des profils secrétariat (Sec_*) dans l’application GED Archivage SONAL, afin de préparer une séance de formation des utilisateurs concernés.',
        ),

        h('2. Profils secrétariat à prendre en compte (TbLogin)'),
        p(
          'La table de login (TbLogin.Profil) doit utiliser l’un des codes suivants pour chaque secrétaire. Chaque code correspond à un bureau isolé :',
        ),
        ...desks.map(([code, label]) => bullet(`${code} — ${label}`)),

        h('3. Principe d’isolement (règle métier)'),
        bullet(
          'Chaque profil Sec_* ne gère et ne consulte que les courriers rattachés à son bureau (secretariat_desk).',
        ),
        bullet(
          'Aucun autre secrétariat ne peut voir les courriers d’un autre bureau.',
        ),
        bullet(
          'Seul le Superuser (Direction Administrative) a une vue transversale de tous les bureaux.',
        ),
        bullet(
          'Le Contrôle & Audit conserve une lecture de traçabilité selon ses droits, sans partage opérationnel entre secrétariats.',
        ),

        h('4. Collaboration entre bureaux'),
        bullet(
          'Messagerie inter-secrétariats : un bureau peut demander un courrier à un autre profil Sec_* (message privé).',
        ),
        bullet(
          'Sur acceptation, le courrier peut être transféré au bureau demandeur.',
        ),
        bullet(
          'Expédition possible vers d’autres utilisateurs disposant d’un compte GED (cadres, directions, etc.).',
        ),

        h('5. Points à traiter en séance de formation'),
        bullet('Connexion par matricule + profil Sec_* correct dans TbLogin.'),
        bullet('Lecture du parapheur personnel (À orienter / À expédier / Folios / Archivés).'),
        bullet('Orientation et expédition vers agents ou autres secrétariats.'),
        bullet('Utilisation de l’onglet Messagerie Sec_* pour les demandes inter-bureaux.'),
        bullet('Rappel de la confidentialité : pas de partage de session, pas de consultation croisée.'),
        bullet('Rôle du Superuser pour l’affectation des bureaux et le pilotage global.'),

        h('6. Recommandation à l’autorité'),
        p(
          'Il est recommandé d’organiser une séance de formation courte (½ journée) par vague de bureaux Sec_*, avec exercices pratiques sur l’isolement des files et la messagerie, puis validation par le Superuser de l’affectation Profil = Sec_* pour chaque matricule concerné.',
        ),
        p(
          'Application : https://archivage-sonal-342.netlify.app',
          { italics: true },
        ),
      ],
    },
  ],
})

const desktopCandidates = [
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'OneDrive', 'Desktop'),
  path.join(os.homedir(), 'Bureau'),
]
const desktop =
  desktopCandidates.find((d) => fs.existsSync(d)) ?? desktopCandidates[0]

const outPath = path.join(
  desktop,
  'SONAL_Note_Organisation_Formation_Sec_Profils.docx',
)

const buffer = await Packer.toBuffer(doc)
fs.writeFileSync(outPath, buffer)
console.log('Document Word créé :', outPath)
