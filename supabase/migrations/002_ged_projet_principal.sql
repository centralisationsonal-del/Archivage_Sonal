-- ============================================================
-- GED SONAL — Tables archivage sur projet principal
-- Intégration TbPersonnels / directions & services existants
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Directions (normalisées depuis TbPersonnels.Direct)
CREATE TABLE IF NOT EXISTS public.tb_directions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL UNIQUE,
  libelle VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id UUID NOT NULL REFERENCES public.tb_directions(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  libelle VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (direction_id, libelle)
);

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'secretariat', 'cadre', 'chef_service', 'directeur', 'dir_administrative'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.parcours_type AS ENUM ('P1', 'P2', 'P3', 'P4', 'BROADCAST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.circulation_status AS ENUM (
    'en_attente_orientation', 'oriente', 'recu', 'traite', 'repondu'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Profils app (auth) + lien matricule RH
CREATE TABLE IF NOT EXISTS public.tb_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'cadre',
  direction_id UUID REFERENCES public.tb_directions(id),
  service_id UUID REFERENCES public.tb_services(id),
  matr VARCHAR(20) REFERENCES public."TbPersonnels"("Matr") ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_archives (
  id BIGSERIAL PRIMARY KEY,
  id_archive VARCHAR(20),
  num_folio VARCHAR(10),
  date_doc DATE NOT NULL DEFAULT CURRENT_DATE,
  emetteur VARCHAR(120),
  recepteur VARCHAR(120),
  reference VARCHAR(60),
  concerne VARCHAR(255) NOT NULL,
  emplacement VARCHAR(120),
  direction_emet_id UUID REFERENCES public.tb_directions(id),
  direction_recept_id UUID REFERENCES public.tb_directions(id),
  service_emet_id UUID REFERENCES public.tb_services(id),
  service_recept_id UUID REFERENCES public.tb_services(id),
  agent_archive_id UUID REFERENCES public.tb_profiles(id),
  agent_archive_matr VARCHAR(20) REFERENCES public."TbPersonnels"("Matr"),
  activite BOOLEAN NOT NULL DEFAULT true,
  file_path TEXT,
  chemin VARCHAR(255),
  type_doc VARCHAR(10) NOT NULL DEFAULT 'Pdf',
  nom_doc_phys VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_archives_cli (
  id BIGSERIAL PRIMARY KEY,
  id_archive VARCHAR(20),
  num_folio VARCHAR(10),
  date_doc DATE,
  emetteur VARCHAR(120),
  recepteur VARCHAR(120),
  reference VARCHAR(60),
  concerne VARCHAR(255),
  emplacement VARCHAR(120),
  direction_emet VARCHAR(80),
  direction_recept VARCHAR(80),
  service_emet VARCHAR(80),
  service_recept VARCHAR(80),
  agent_archive VARCHAR(80) DEFAULT '-',
  activite BOOLEAN DEFAULT true,
  file_path TEXT,
  chemin VARCHAR(255),
  type_doc VARCHAR(10) DEFAULT 'Pdf',
  nom_doc_phys VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_correspondants (
  id BIGSERIAL PRIMARY KEY,
  indice VARCHAR(5),
  correspondant VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_circulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id BIGINT NOT NULL REFERENCES public.tb_archives(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.tb_profiles(id),
  receiver_id UUID REFERENCES public.tb_profiles(id),
  sender_matr VARCHAR(20) REFERENCES public."TbPersonnels"("Matr"),
  receiver_matr VARCHAR(20) REFERENCES public."TbPersonnels"("Matr"),
  sender_direction_id UUID REFERENCES public.tb_directions(id),
  receiver_direction_id UUID REFERENCES public.tb_directions(id),
  parcours_type public.parcours_type NOT NULL,
  status public.circulation_status NOT NULL DEFAULT 'en_attente_orientation',
  cc_users UUID[] NOT NULL DEFAULT '{}',
  cc_matrs VARCHAR(20)[] NOT NULL DEFAULT '{}',
  parent_circulation_id UUID REFERENCES public.tb_circulations(id),
  note_expedition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circulation_id UUID NOT NULL REFERENCES public.tb_circulations(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.tb_profiles(id),
  author_matr VARCHAR(20) REFERENCES public."TbPersonnels"("Matr"),
  note_instruction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_circulation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circulation_id UUID NOT NULL REFERENCES public.tb_circulations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.tb_profiles(id),
  actor_matr VARCHAR(20) REFERENCES public."TbPersonnels"("Matr"),
  event_type VARCHAR(60) NOT NULL,
  label VARCHAR(255) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vue agents actifs pour la GED
CREATE OR REPLACE VIEW public.v_ged_agents AS
SELECT
  p."Matr" AS matr,
  TRIM(CONCAT_WS(' ', p."Nom", p."Postnom", p."Prenom")) AS full_name,
  p."Email" AS email,
  p."Phone" AS phone,
  p."Direct" AS direction_libelle,
  p."Service" AS service_libelle,
  p."Fonct_Agt" AS fonction,
  p."Grade_Act" AS grade,
  p."Entite" AS entite,
  p."Actif" AS actif,
  d.id AS direction_id,
  s.id AS service_id
FROM public."TbPersonnels" p
LEFT JOIN public.tb_directions d ON d.libelle = p."Direct"
LEFT JOIN public.tb_services s ON s.direction_id = d.id AND s.libelle = p."Service"
WHERE p."Actif" = true;
