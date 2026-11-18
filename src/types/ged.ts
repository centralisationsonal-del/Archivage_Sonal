export type AppRole =
  | 'secretariat'
  | 'cadre'
  | 'chef_service'
  | 'directeur'
  | 'dir_administrative'
  | 'documentation_archives'
  | 'controle'

export type ParcoursType = 'P1' | 'P2' | 'P3' | 'P4' | 'BROADCAST'

export type CirculationStatus =
  | 'en_attente_orientation'
  | 'en_attente_aval'
  | 'oriente'
  | 'recu'
  | 'traite'
  | 'repondu'

/** Catégorie métier du document (distinct de type_doc = extension fichier) */
export type TypeDocument =
  | 'courrier'
  | 'note_frais'
  | 'mise_disposition'

export type AvisAval = 'favorable' | 'defavorable'

/** Étape d’une chaîne d’aval protégé */
export interface AvalEtape {
  id: string
  circulation_id: string
  step_order: number
  role_key: string
  role_label: string
  required_matr: string | null
  required_profile_id: string | null
  actor_id: string | null
  actor_matr: string | null
  actor_full_name: string | null
  avis: AvisAval | null
  note: string | null
  signed_at: string | null
  is_current: boolean
}

export interface Direction {
  id: string
  code: string
  libelle: string
}

export interface Service {
  id: string
  direction_id: string
  code: string
  libelle: string
}

/** Bureaux secrétariat isolés (TbLogin.Profil / tb_profiles.secretariat_code) */
export type SecretariatCode =
  | 'Sec_Adg'
  | 'Sec_Adga'
  | 'Sec_Pca'
  | 'Sec_Df'
  | 'Sec_Dt'
  | 'Sec_Dc'
  | 'Sec_Dcm'
  | 'Sec_Da'
  | 'Sec_Pj'
  | 'Sec_Cms'
  | 'Sec_Archive'

export const SECRETARIAT_CODES: SecretariatCode[] = [
  'Sec_Adg',
  'Sec_Adga',
  'Sec_Pca',
  'Sec_Df',
  'Sec_Dt',
  'Sec_Dc',
  'Sec_Dcm',
  'Sec_Da',
  'Sec_Pj',
  'Sec_Cms',
  'Sec_Archive',
]

export const SECRETARIAT_CODE_LABELS: Record<SecretariatCode, string> = {
  Sec_Adg: 'Secrétariat ADG',
  Sec_Adga: 'Secrétariat ADG Adjoint',
  Sec_Pca: 'Secrétariat PCA',
  Sec_Df: 'Secrétariat Direction Financière',
  Sec_Dt: 'Secrétariat Direction Technique',
  Sec_Dc: 'Secrétariat Direction Commerciale',
  Sec_Dcm: 'Secrétariat Direction Commerciale & Marketing',
  Sec_Da: 'Secrétariat Direction Administrative',
  Sec_Pj: 'Secrétariat Projets',
  Sec_Cms: 'Secrétariat CMS',
  Sec_Archive: 'Secrétariat Archives / Documentation',
}

export interface SecretariatDesk {
  code: SecretariatCode | string
  libelle: string
  direction_id: string | null
  actif: boolean
  sort_order: number
}

export interface Profile {
  id: string
  full_name: string
  email: string
  role: AppRole
  direction_id: string | null
  service_id: string | null
  matr: string | null
  /** Bureau secrétariat (Sec_Adg, Sec_Df, …) — isolement des courriers */
  secretariat_code?: string | null
  /** Niveau TbLogin — Contrôle avec privilege > 10 peut éditer les docs financiers */
  privilege?: number | null
  direction?: Direction | null
  service?: Service | null
}

export type MessagerieSecStatus =
  | 'envoyee'
  | 'lue'
  | 'acceptee'
  | 'refusee'
  | 'cloturee'

export interface MessagerieSec {
  id: string
  from_profile_id: string
  to_profile_id: string
  from_desk: string | null
  to_desk: string | null
  circulation_id: string | null
  subject: string | null
  message: string
  status: MessagerieSecStatus
  response_note: string | null
  responded_at: string | null
  created_at: string
  from_profile?: Profile | null
  to_profile?: Profile | null
}

/** Contrôle & Audit avec privilège supérieur à 10 : édition docs financiers (pas d’aval) */
export function canEditFinancialDocs(profile: Profile | null | undefined): boolean {
  if (!profile) return false
  return profile.role === 'controle' && Number(profile.privilege ?? 0) > 10
}

export type ArchiveOwnerScope = 'agent' | 'secretariat' | 'documentation'

export interface EmplacementSecretariat {
  id: string
  direction_id: string
  code: string
  libelle: string
  actif: boolean
  created_at?: string
}

export interface ArchiveSearchFilters {
  concerne?: string
  reference?: string
  emplacement?: string
  dateFrom?: string
  dateTo?: string
  emetteur?: string
  recepteur?: string
  entite?: string
  scope?: 'docs' | 'secretariat'
  directionId?: string | null
}

export interface Archive {
  id: number
  id_archive: string | null
  num_folio: string | null
  date_doc: string
  /** Date métier de création / archivage */
  date_creation?: string | null
  emetteur: string | null
  recepteur: string | null
  reference: string | null
  concerne: string
  emplacement: string | null
  direction_emet_id: string | null
  direction_recept_id: string | null
  service_emet_id: string | null
  service_recept_id: string | null
  agent_archive_id: string | null
  activite: boolean
  file_path: string | null
  chemin: string | null
  type_doc: string
  type_document?: TypeDocument | string
  montant?: number | null
  devise?: string | null
  nom_doc_phys: string | null
  invisible_tous?: boolean
  owner_scope?: ArchiveOwnerScope | string
  owner_direction_id?: string | null
  /** Entité / instance de provenance (Kinshasa, Katanga, …) */
  entite?: string | null
  created_at: string
  updated_at?: string
}

/** Agent RH (TbPersonnels) exposé via v_ged_agents / ged_list_agents */
export interface GedAgent {
  matr: string
  full_name: string
  email: string | null
  phone: string | null
  direction_libelle: string | null
  service_libelle: string | null
  fonction: string | null
  grade: string | null
  entite: string | null
  /** Toujours true côté RPC (Actif = 1) */
  actif?: boolean | null
  direction_id: string | null
  service_id: string | null
}

/** Ligne rapport gestion documentaire (archives) */
export interface ArchiveReportRow {
  id: number
  date_doc: string
  date_maj: string
  folio: string
  concerne: string
  reference: string
  emetteur: string
  recepteur: string
  emplacement: string
  entite: string
  nom_document: string
  type_doc: string
  extension: string
}

/** Signataire d’une étape d’aval (rapport financier) */
export interface FinancialAvalSignataire {
  role_label: string
  actor_full_name: string | null
  avis: AvisAval | null
  signed_at: string | null
}

/** Ligne rapport notes de frais / mises à disposition */
export interface FinancialReportRow {
  id: string
  type_document: Extract<TypeDocument, 'note_frais' | 'mise_disposition'>
  date_doc: string
  date_creation: string
  folio: string
  concerne: string
  reference: string
  emetteur: string
  montant: number
  devise: string
  statut: CirculationStatus
  avis_aval: AvisAval | null
  signataires: FinancialAvalSignataire[]
  /** Chaîne d’aval lisible (rôles + personnes) */
  chaine_aval: string
}

export interface Circulation {
  id: string
  archive_id: number
  sender_id: string | null
  receiver_id: string | null
  sender_matr: string | null
  receiver_matr: string | null
  sender_direction_id: string | null
  receiver_direction_id: string | null
  parcours_type: ParcoursType
  status: CirculationStatus
  cc_users: string[]
  cc_matrs: string[]
  handler_id: string | null
  approver_id: string | null
  approver_matr: string | null
  avis_aval: AvisAval | null
  avis_aval_note: string | null
  avis_aval_at: string | null
  parent_circulation_id: string | null
  note_expedition: string | null
  /** Bureau secrétariat propriétaire (Sec_Adg, Sec_Df, …) */
  secretariat_desk?: string | null
  created_at: string
  updated_at: string
  archive?: Archive
  sender?: Profile
  receiver?: Profile | null
  approver?: Profile | null
}

export interface Annotation {
  id: string
  circulation_id: string
  author_id: string | null
  author_matr: string | null
  note_instruction: string
  created_at: string
  author?: Profile
}

export interface CirculationEvent {
  id: string
  circulation_id: string
  actor_id: string | null
  actor_matr: string | null
  event_type: string
  label: string
  metadata: Record<string, unknown>
  created_at: string
  actor?: Profile | null
}

export interface CreateDocumentInput {
  concerne: string
  reference?: string
  receiverId?: string
  receiverMatr?: string
  receiverDirectionId: string
  receiverServiceId?: string
  parcoursType: ParcoursType
  file: File
  note?: string
  typeDocument?: TypeDocument
  montant?: number | null
  devise?: string
  /** Entité / instance de provenance */
  entite?: string
}

export interface OrientDocumentInput {
  circulationId: string
  receiverId?: string
  receiverMatr?: string
  numFolio?: string
  noteInstruction?: string
}

/** Filtres recherche périodique circuit documentaire (dates uniquement) */
export interface DocumentReportFilters {
  dateFrom?: string
  dateTo?: string
  entite?: string
}

export interface DocumentReportRow {
  id: string
  nom_document: string
  date_envoye: string
  destinataire: string
  objet: string
  reference: string
  folio: string
  emetteur: string
  statut: CirculationStatus | 'archive'
  parcours: ParcoursType | 'ARCHIVE'
  circuit: string
  extension: string
}

export const ROLE_LABELS: Record<AppRole, string> = {
  secretariat: 'Secrétariat',
  cadre: 'Cadre',
  chef_service: 'Chef de service',
  directeur: 'Directeur',
  dir_administrative: 'Superuser',
  documentation_archives: 'Documentation & Archives',
  controle: 'Contrôle & Audit',
}

export const PARCOURS_LABELS: Record<ParcoursType, string> = {
  P1: 'Inter-Directions',
  P2: 'Intra-Direction (même service)',
  P3: 'Inter-Directions via cadres',
  P4: 'Intra-Direction (services différents)',
  BROADCAST: 'Diffusion générale',
}

export const STATUS_LABELS: Record<CirculationStatus, string> = {
  en_attente_orientation: 'En attente d’orientation',
  en_attente_aval: 'En attente d’aval',
  oriente: 'Orienté',
  recu: 'Reçu',
  traite: 'Traité',
  repondu: 'Répondu',
}

export const TYPE_DOCUMENT_LABELS: Record<TypeDocument, string> = {
  courrier: 'Courrier classique',
  note_frais: 'Note de frais',
  mise_disposition: 'Mise à disposition des fonds',
}

/** Statuts de demande documentaire auprès de Documentation & Archives */
export type DemandeDocStatus =
  | 'envoyee'
  | 'message_recu'
  | 'document_inexistant'
  | 'en_cours'
  | 'livree'

export const DEMANDE_DOC_STATUS_LABELS: Record<DemandeDocStatus, string> = {
  envoyee: 'Envoyée',
  message_recu: 'Message reçu',
  document_inexistant: 'Document inexistant',
  en_cours: 'En cours d’exécution',
  livree: 'Document livré',
}

export interface DemandeDoc {
  id: string
  requester_id: string
  recipient_id: string | null
  requester_matr: string | null
  requester_name: string | null
  message: string
  reference_souhaitee: string | null
  status: DemandeDocStatus
  signal_note: string | null
  signal_at: string | null
  signal_by: string | null
  reply_file_path: string | null
  reply_file_name: string | null
  reply_note: string | null
  replied_at: string | null
  replied_by: string | null
  created_at: string
  updated_at: string
}

export interface GedMessage {
  id: string
  sender_id: string
  recipient_id: string | null
  subject: string | null
  message: string
  attachment_path: string | null
  attachment_name: string | null
  created_at: string
}

export interface ProfileActivityStats {
  archived: number
  sent: number
  requested: number
  unanswered: number
}

export function isDocumentFinancier(type?: string | null): boolean {
  return type === 'note_frais' || type === 'mise_disposition'
}

export const AVIS_AVAL_LABELS: Record<AvisAval, string> = {
  favorable: 'Avis favorable',
  defavorable: 'Avis défavorable',
}

export interface DirectionQueueStats {
  direction_id: string
  libelle: string
  code: string
  a_orienter: number
  a_expedier: number
  en_cours: number
  traites: number
}

export interface GlobalDashboardData {
  totalCirculations: number
  totalArchives: number
  totalFolios: number
  totalAgents: number
  byStatus: Record<CirculationStatus, number>
  byParcours: Record<ParcoursType, number>
  directionQueues: DirectionQueueStats[]
  recent: Circulation[]
  allCirculations: Circulation[]
  folios: Archive[]
}

/** Type d’événement agenda Chef */
export type AgendaTypeEvenement =
  | 'audience'
  | 'reunion'
  | 'rendez_vous'
  | 'mission_etranger'
  | 'mission_province'
  | 'conge_annuel'
  | 'conge_circonstance'
  | 'visite_familiale'
  | 'conference'
  | 'visioconference'
  | 'visite_bureaux'
  | 'assistance'

export const AGENDA_TYPE_LABELS: Record<AgendaTypeEvenement, string> = {
  audience: 'Audience',
  reunion: 'Réunion',
  rendez_vous: 'Rendez-vous',
  mission_etranger: 'Mission à l’étranger',
  mission_province: 'Mission en province',
  conge_annuel: 'Congé annuel',
  conge_circonstance: 'Congé de circonstance',
  visite_familiale: 'Visite familiale',
  conference: 'Conférence',
  visioconference: 'Visioconférence',
  visite_bureaux: 'Visite des bureaux',
  assistance: 'Assistance',
}

export const AGENDA_AVIS_OPTIONS = [
  'En Attente',
  'Confirmé',
  'Reporté',
  'Annulé',
  'Honoré',
] as const

export const AGENDA_CIVILITE_OPTIONS = [
  'Monsieur',
  'Madame',
  'Mademoiselle',
  'Excellence',
  'Docteur',
] as const

/** Ligne TbAgenda_Chef */
export interface AgendaChef {
  IdAgenda: number
  Entite: string | null
  Date_Oper: string | null
  Operateur: string | null
  Nom_Chef: string | null
  Civilite: string | null
  Pers_Sollicitee: string | null
  Telephone: string | null
  Sexe: string | null
  Organis_Service: string | null
  Objet_RDV: string | null
  Avis_Chef: string | null
  Date_RDV: string | null
  Heure_RDV: string | null
  Lieu_RDV: string | null
  Couleur_Objet: string | null
  Lien_Visio: string | null
  Commentaire: string | null
  secretariat_code: string | null
  created_by: string | null
  chef_whatsapp: string | null
  chef_email: string | null
  type_evenement: AgendaTypeEvenement | string | null
  created_at?: string
  updated_at?: string
}

export type AgendaChefInput = Omit<
  AgendaChef,
  'IdAgenda' | 'created_at' | 'updated_at' | 'created_by' | 'secretariat_code'
> & {
  IdAgenda?: number
}
