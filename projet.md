Améliorations SQL indispensables à effectuer :
Reprendre et normaliser le schéma TbArchives (remplacer Image_Doc BYTEA par du stockage objet via Supabase Storage et conserver uniquement file_path / Chemin).

Créer les tables de structure organisationnelle et d'utilisateurs manquantes :

tb_directions : id, code, libelle

tb_services : id, direction_id (FK), code, libelle

tb_profiles : id (FK auth.users), full_name, email, role (secretariat, cadre, chef_service, directeur, dir_administrative), direction_id (FK), service_id (FK)

tb_circulations (Suivi du parcours documentaire) : id, archive_id (FK), sender_id (FK), receiver_id (FK), sender_direction_id, receiver_direction_id, parcours_type (P1, P2, P3, P4, BROADCAST), status (en_attente_orientation, oriente, recu, traite, repondu), cc_users (UUID Array), created_at

tb_annotations : id, circulation_id (FK), author_id (FK), note_instruction, created_at

2. Gestion des Profils & Rôles
Profil 1 : Secrétariat de Direction

Réceptionne tous les documents arrivant dans sa direction.

Oriente le document receptionné vers l'agent/cadre destinataire final au sein de sa direction.

Reçoit les documents des cadres de sa direction à expédier vers l'extérieur/autres directions.

Profil 2 : Cadre

Rattaché à une direction et un service précis.

Peut créer/transmettre des documents en interne ou demander une expédition externe au secrétariat.

Profil Spécial : Direction Administrative

Rôle étendu permettant d'émettre des courriels/circulaires d'utilité commune diffusés simultanément à toutes les directions.

3. Logique des Parcours Utilisateurs à Implémenter
Parcours 1 (Inter-Directions) :

Cadre ou Secrétariat Direction A initie le document.

Secrétariat Direction A valide et expédie vers la Direction B.

Secrétariat Direction B réceptionne, enregistre le numéro de folio et oriente vers le cadre destinataire.

Si une réponse est nécessaire, le destinataire génère un document réponse -> le transmet à son Secrétariat B -> réexpédié vers la Direction A.

Parcours 2 (Intra-Direction - Même Service/Direction) :

Un cadre envoie directement un document à un autre cadre de sa même direction.

Le Chef de Service (compte rôle Cadre) est automatiquement ajouté en copie conforme (CC).

Parcours 3 (Inter-Directions via Cadres) :

Un cadre initie un document pour un cadre d'une autre direction.

Le document passe par le Secrétariat de sa direction.

Le Secrétariat expédie le document vers la direction cible tout en attachant automatiquement le Directeur en copie (CC).

Parcours 4 (Intra-Direction - Services Différents) :

Circulation entre deux agents de deux services différents au sein de la même direction.

Prise en charge par le Secrétariat qui attache automatiquement les deux Chefs de Service concernés ET leur Directeur en copie (CC).

Diffusion Générale (Direction Administrative) :

Émission d'un document à utilité commune adressé à l'ensemble des secrétariats de toutes les directions en un clic.

4. Consignes d'Exécution pour Cursor
Générer le script PostgreSQL complet de migration Supabase incluant les tables existantes nettoyées, les nouvelles tables (tb_directions, tb_services, tb_profiles, tb_circulations), les contraintes FK, les index et les stratégies RLS (Row Level Security).

Créer la structure des dossiers React/TypeScript (src/modules/ged, src/types/ged.ts, src/services/circulationService.ts).

Implémenter le moteur de routage des parcours : créer un Hook personnalisé useDocumentWorkflow gérant l'application automatique des règles de mise en copie (CC) des Directeurs/Chefs de Service selon le type de parcours (P1, P2, P3, P4, Broadcast).

Concevoir les vues UI principales (Tailwind CSS) :

Interface Secrétariat : Parapheur virtuel ("Courrier à orienter", "Courrier à expédier", "Registre des folios").

Interface Cadre : Boîte de réception, Boîte d'envoi, Formulaire de création de document avec téléversement PDF.

Chronologie / Fil d'Ariane visuel retraçant tout le parcours d'un document de son émission à son archivage.