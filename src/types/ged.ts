export type AppRole =
  | 'secretariat'
  | 'cadre'
  | 'chef_service'
  | 'directeur'
  | 'dir_administrative'
  | 'documentation_archives'

export type ParcoursType = 'P1' | 'P2' | 'P3' | 'P4' | 'BROADCAST'

export type CirculationStatus =
  | 'en_attente_orientation'
  | 'oriente'
  | 'recu'
  | 'traite'
  | 'repondu'

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

export interface Profile {
  id: string
  full_name: string
  email: string
  role: AppRole
  direction_id: string | null
  service_id: string | null
  matr: string | null
  direction?: Direction | null
  service?: Service | null
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
  direction_id: string | null
  service_id: string | null
}

export interface Archive {
  id: number
  id_archive: string | null
  num_folio: string | null
  date_doc: string
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
  nom_doc_phys: string | null
  created_at: string
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
  parent_circulation_id: string | null
  note_expedition: string | null
  created_at: string
  updated_at: string
  archive?: Archive
  sender?: Profile
  receiver?: Profile | null
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
  statut: CirculationStatus
  parcours: ParcoursType
  circuit: string
}

export const ROLE_LABELS: Record<AppRole, string> = {
  secretariat: 'Secrétariat',
  cadre: 'Cadre',
  chef_service: 'Chef de service',
  directeur: 'Directeur',
  dir_administrative: 'Direction Administrative',
  documentation_archives: 'Documentation & Archives',
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
  oriente: 'Orienté',
  recu: 'Reçu',
  traite: 'Traité',
  repondu: 'Répondu',
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
