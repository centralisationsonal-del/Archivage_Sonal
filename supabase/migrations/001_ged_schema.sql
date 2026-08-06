-- ============================================================
-- GED SONAL SA — Migration complète (archivage + circulation)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- 1. Structure organisationnelle
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tb_directions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  libelle VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id UUID NOT NULL REFERENCES public.tb_directions(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  libelle VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (direction_id, code)
);

-- ------------------------------------------------------------
-- 2. Profils & rôles (lié à auth.users)
-- ------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM (
  'secretariat',
  'cadre',
  'chef_service',
  'directeur',
  'dir_administrative'
);

CREATE TABLE IF NOT EXISTS public.tb_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'cadre',
  direction_id UUID REFERENCES public.tb_directions(id),
  service_id UUID REFERENCES public.tb_services(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. Archives (schéma WINDEV normalisé — Storage au lieu de BYTEA)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. Circulation documentaire
-- ------------------------------------------------------------
CREATE TYPE public.parcours_type AS ENUM ('P1', 'P2', 'P3', 'P4', 'BROADCAST');

CREATE TYPE public.circulation_status AS ENUM (
  'en_attente_orientation',
  'oriente',
  'recu',
  'traite',
  'repondu'
);

CREATE TABLE IF NOT EXISTS public.tb_circulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id BIGINT NOT NULL REFERENCES public.tb_archives(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.tb_profiles(id),
  receiver_id UUID REFERENCES public.tb_profiles(id),
  sender_direction_id UUID REFERENCES public.tb_directions(id),
  receiver_direction_id UUID REFERENCES public.tb_directions(id),
  parcours_type public.parcours_type NOT NULL,
  status public.circulation_status NOT NULL DEFAULT 'en_attente_orientation',
  cc_users UUID[] NOT NULL DEFAULT '{}',
  parent_circulation_id UUID REFERENCES public.tb_circulations(id),
  note_expedition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circulation_id UUID NOT NULL REFERENCES public.tb_circulations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.tb_profiles(id),
  note_instruction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_circulation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circulation_id UUID NOT NULL REFERENCES public.tb_circulations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.tb_profiles(id),
  event_type VARCHAR(60) NOT NULL,
  label VARCHAR(255) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 5. Index
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tb_services_direction ON public.tb_services(direction_id);
CREATE INDEX IF NOT EXISTS idx_tb_profiles_direction ON public.tb_profiles(direction_id);
CREATE INDEX IF NOT EXISTS idx_tb_profiles_service ON public.tb_profiles(service_id);
CREATE INDEX IF NOT EXISTS idx_tb_profiles_role ON public.tb_profiles(role);
CREATE INDEX IF NOT EXISTS idx_tb_archives_folio ON public.tb_archives(num_folio);
CREATE INDEX IF NOT EXISTS idx_tb_archives_date ON public.tb_archives(date_doc);
CREATE INDEX IF NOT EXISTS idx_tb_circulations_archive ON public.tb_circulations(archive_id);
CREATE INDEX IF NOT EXISTS idx_tb_circulations_receiver ON public.tb_circulations(receiver_id);
CREATE INDEX IF NOT EXISTS idx_tb_circulations_sender ON public.tb_circulations(sender_id);
CREATE INDEX IF NOT EXISTS idx_tb_circulations_status ON public.tb_circulations(status);
CREATE INDEX IF NOT EXISTS idx_tb_circulations_parcours ON public.tb_circulations(parcours_type);
CREATE INDEX IF NOT EXISTS idx_tb_annotations_circulation ON public.tb_annotations(circulation_id);
CREATE INDEX IF NOT EXISTS idx_tb_events_circulation ON public.tb_circulation_events(circulation_id);

-- ------------------------------------------------------------
-- 6. Helpers RLS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS public.tb_profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.tb_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_dir_administrative()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tb_profiles
    WHERE id = auth.uid() AND role = 'dir_administrative'
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tb_profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'cadre')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- 7. RLS
-- ------------------------------------------------------------
ALTER TABLE public.tb_directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_archives_cli ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_correspondants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_circulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_circulation_events ENABLE ROW LEVEL SECURITY;

-- Directions / services : lecture authentifiée
CREATE POLICY "directions_select_auth" ON public.tb_directions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "services_select_auth" ON public.tb_services
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "directions_write_admin" ON public.tb_directions
  FOR ALL TO authenticated
  USING (public.is_dir_administrative())
  WITH CHECK (public.is_dir_administrative());

CREATE POLICY "services_write_admin" ON public.tb_services
  FOR ALL TO authenticated
  USING (public.is_dir_administrative())
  WITH CHECK (public.is_dir_administrative());

-- Profils
CREATE POLICY "profiles_select_auth" ON public.tb_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_self" ON public.tb_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_dir_administrative())
  WITH CHECK (id = auth.uid() OR public.is_dir_administrative());

-- Archives
CREATE POLICY "archives_select_involved" ON public.tb_archives
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR agent_archive_id = auth.uid()
    OR direction_emet_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
    OR direction_recept_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.archive_id = tb_archives.id
        AND (
          c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR auth.uid() = ANY (c.cc_users)
        )
    )
  );

CREATE POLICY "archives_insert_auth" ON public.tb_archives
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "archives_update_involved" ON public.tb_archives
  FOR UPDATE TO authenticated
  USING (
    public.is_dir_administrative()
    OR agent_archive_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.archive_id = tb_archives.id
        AND (c.sender_id = auth.uid() OR c.receiver_id = auth.uid())
    )
  );

-- Circulations
CREATE POLICY "circulations_select" ON public.tb_circulations
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR auth.uid() = ANY (cc_users)
    OR (
      (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
      AND (
        sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
        OR receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
      )
    )
  );

CREATE POLICY "circulations_insert" ON public.tb_circulations
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() OR public.is_dir_administrative());

CREATE POLICY "circulations_update" ON public.tb_circulations
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR public.is_dir_administrative()
    OR (
      (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
      AND (
        sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
        OR receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
      )
    )
  );

-- Annotations
CREATE POLICY "annotations_select" ON public.tb_annotations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.id = circulation_id
        AND (
          c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR auth.uid() = ANY (c.cc_users)
          OR public.is_dir_administrative()
        )
    )
  );

CREATE POLICY "annotations_insert" ON public.tb_annotations
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Events
CREATE POLICY "events_select" ON public.tb_circulation_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.id = circulation_id
        AND (
          c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR auth.uid() = ANY (c.cc_users)
          OR public.is_dir_administrative()
        )
    )
  );

CREATE POLICY "events_insert" ON public.tb_circulation_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Archives clients / correspondants (lecture)
CREATE POLICY "archives_cli_select" ON public.tb_archives_cli
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "correspondants_select" ON public.tb_correspondants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "correspondants_write_admin" ON public.tb_correspondants
  FOR ALL TO authenticated
  USING (public.is_dir_administrative())
  WITH CHECK (public.is_dir_administrative());

-- ------------------------------------------------------------
-- 8. Storage bucket documents PDF
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'archives',
  'archives',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "archives_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'archives');

CREATE POLICY "archives_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'archives');

CREATE POLICY "archives_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'archives');

-- ------------------------------------------------------------
-- 9. Données de référence (directions SONAL)
-- ------------------------------------------------------------
INSERT INTO public.tb_directions (code, libelle) VALUES
  ('DG', 'Direction Générale'),
  ('DA', 'Direction Administrative'),
  ('DF', 'Direction Financière'),
  ('DT', 'Direction Technique'),
  ('DRH', 'Direction des Ressources Humaines'),
  ('DC', 'Direction Commerciale')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.tb_services (direction_id, code, libelle)
SELECT d.id, s.code, s.libelle
FROM public.tb_directions d
JOIN (VALUES
  ('DG', 'SEC', 'Secrétariat DG'),
  ('DA', 'SEC', 'Secrétariat DA'),
  ('DA', 'JUR', 'Service Juridique'),
  ('DF', 'SEC', 'Secrétariat DF'),
  ('DF', 'CPT', 'Comptabilité'),
  ('DT', 'SEC', 'Secrétariat DT'),
  ('DT', 'EXP', 'Exploitation'),
  ('DRH', 'SEC', 'Secrétariat DRH'),
  ('DRH', 'PER', 'Personnel'),
  ('DC', 'SEC', 'Secrétariat DC'),
  ('DC', 'CLI', 'Clientèle')
) AS s(dir_code, code, libelle) ON s.dir_code = d.code
ON CONFLICT (direction_id, code) DO NOTHING;
