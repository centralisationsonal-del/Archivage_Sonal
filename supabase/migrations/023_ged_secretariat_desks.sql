-- =============================================================================
-- Profils secrétariat spécialisés (Sec_Adg, Sec_Df, …) + isolement des courriers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Référentiel des bureaux secrétariat
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tb_secretariat_desks (
  code TEXT PRIMARY KEY,
  libelle TEXT NOT NULL,
  direction_id UUID REFERENCES public.tb_directions(id),
  actif BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 100
);

COMMENT ON TABLE public.tb_secretariat_desks IS
  'Bureaux secrétariat isolés (Sec_Adg, Sec_Df, …) — un profil ne voit que ses courriers';

INSERT INTO public.tb_secretariat_desks (code, libelle, sort_order) VALUES
  ('Sec_Adg', 'Secrétariat ADG', 10),
  ('Sec_Adga', 'Secrétariat ADG Adjoint', 20),
  ('Sec_Pca', 'Secrétariat PCA', 30),
  ('Sec_Df', 'Secrétariat Direction Financière', 40),
  ('Sec_Dt', 'Secrétariat Direction Technique', 50),
  ('Sec_Dc', 'Secrétariat Direction Commerciale', 60),
  ('Sec_Dcm', 'Secrétariat Direction Commerciale & Marketing', 70),
  ('Sec_Da', 'Secrétariat Direction Administrative', 80),
  ('Sec_Pj', 'Secrétariat Projets', 90),
  ('Sec_Cms', 'Secrétariat CMS', 100),
  ('Sec_Archive', 'Secrétariat Archives / Documentation', 110)
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle,
  sort_order = EXCLUDED.sort_order;

-- Lier aux directions existantes (best-effort)
UPDATE public.tb_secretariat_desks d
SET direction_id = dir.id
FROM public.tb_directions dir
WHERE d.direction_id IS NULL
  AND (
    (d.code = 'Sec_Df' AND dir.libelle ILIKE '%financi%')
    OR (d.code = 'Sec_Dt' AND dir.libelle ILIKE '%techni%')
    OR (d.code = 'Sec_Dc' AND dir.libelle ILIKE 'commerciale%' AND dir.libelle NOT ILIKE '%market%')
    OR (d.code = 'Sec_Dcm' AND dir.libelle ILIKE '%market%')
    OR (d.code = 'Sec_Da' AND dir.libelle ILIKE '%administrati%')
    OR (d.code = 'Sec_Adg' AND dir.libelle ILIKE '%comit%')
    OR (d.code = 'Sec_Cms' AND dir.libelle ILIKE '%contr%')
  );

-- ---------------------------------------------------------------------------
-- 2) Colonne secretariat_code sur profils
-- ---------------------------------------------------------------------------
ALTER TABLE public.tb_profiles
  ADD COLUMN IF NOT EXISTS secretariat_code TEXT
    REFERENCES public.tb_secretariat_desks(code);

CREATE INDEX IF NOT EXISTS idx_profiles_secretariat_code
  ON public.tb_profiles (secretariat_code)
  WHERE secretariat_code IS NOT NULL;

COMMENT ON COLUMN public.tb_profiles.secretariat_code IS
  'Bureau secrétariat (Sec_Adg, Sec_Df, …) — isolement strict des courriers';

-- ---------------------------------------------------------------------------
-- 3) Colonne desk sur circulations (propriétaire du parapheur)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tb_circulations
  ADD COLUMN IF NOT EXISTS secretariat_desk TEXT
    REFERENCES public.tb_secretariat_desks(code);

CREATE INDEX IF NOT EXISTS idx_circulations_secretariat_desk
  ON public.tb_circulations (secretariat_desk)
  WHERE secretariat_desk IS NOT NULL;

COMMENT ON COLUMN public.tb_circulations.secretariat_desk IS
  'Bureau secrétariat propriétaire du courrier en file (orientation / expédition)';

-- Backfill : desk du secrétariat de la direction réceptrice si un seul profil Sec y est lié
UPDATE public.tb_circulations c
SET secretariat_desk = sub.code
FROM (
  SELECT p.direction_id, MIN(p.secretariat_code) AS code
  FROM public.tb_profiles p
  WHERE p.role = 'secretariat'
    AND p.secretariat_code IS NOT NULL
    AND p.direction_id IS NOT NULL
  GROUP BY p.direction_id
  HAVING COUNT(DISTINCT p.secretariat_code) = 1
) sub
WHERE c.secretariat_desk IS NULL
  AND c.receiver_direction_id = sub.direction_id
  AND c.status IN ('en_attente_orientation', 'oriente');

-- Sinon : desk par défaut de la direction (table desks)
UPDATE public.tb_circulations c
SET secretariat_desk = d.code
FROM public.tb_secretariat_desks d
WHERE c.secretariat_desk IS NULL
  AND d.direction_id IS NOT NULL
  AND c.receiver_direction_id = d.direction_id
  AND c.status IN ('en_attente_orientation', 'oriente');

-- ---------------------------------------------------------------------------
-- 4) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_secretariat_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT secretariat_code
  FROM public.tb_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_secretariat_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tb_profiles
    WHERE id = auth.uid() AND role = 'secretariat'
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_secretariat_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_secretariat_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.normalize_secretariat_profil(p_profil text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := upper(btrim(coalesce(p_profil, '')));
  v := replace(v, ' ', '_');
  v := replace(v, '-', '_');
  -- Formes acceptées : SEC_ADG, Sec_Adg, SECRETARIAT_ADG, etc.
  IF v IN ('SEC_ADG', 'SECRETARIAT_ADG', 'ADG_SEC') THEN RETURN 'Sec_Adg'; END IF;
  IF v IN ('SEC_ADGA', 'SECRETARIAT_ADGA') THEN RETURN 'Sec_Adga'; END IF;
  IF v IN ('SEC_PCA', 'SECRETARIAT_PCA') THEN RETURN 'Sec_Pca'; END IF;
  IF v IN ('SEC_DF', 'SECRETARIAT_DF', 'SECRETARIAT_FINANCIERE') THEN RETURN 'Sec_Df'; END IF;
  IF v IN ('SEC_DT', 'SECRETARIAT_DT', 'SECRETARIAT_TECHNIQUE') THEN RETURN 'Sec_Dt'; END IF;
  IF v IN ('SEC_DC', 'SECRETARIAT_DC') THEN RETURN 'Sec_Dc'; END IF;
  IF v IN ('SEC_DCM', 'SECRETARIAT_DCM') THEN RETURN 'Sec_Dcm'; END IF;
  IF v IN ('SEC_DA', 'SECRETARIAT_DA', 'SECRETARIAT_ADMINISTRATIVE') THEN RETURN 'Sec_Da'; END IF;
  IF v IN ('SEC_PJ', 'SECRETARIAT_PJ', 'SECRETARIAT_PROJETS') THEN RETURN 'Sec_Pj'; END IF;
  IF v IN ('SEC_CMS', 'SECRETARIAT_CMS') THEN RETURN 'Sec_Cms'; END IF;
  IF v IN ('SEC_ARCHIVE', 'SEC_ARCHIVES', 'SECRETARIAT_ARCHIVE', 'SECRETARIAT_ARCHIVES') THEN
    RETURN 'Sec_Archive';
  END IF;
  -- Déjà au format canonique
  IF p_profil IN (
    'Sec_Adg','Sec_Adga','Sec_Pca','Sec_Df','Sec_Dt','Sec_Dc','Sec_Dcm',
    'Sec_Da','Sec_Pj','Sec_Cms','Sec_Archive'
  ) THEN
    RETURN p_profil;
  END IF;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_secretariat_profil(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Mapping login TbLogin → rôle + code secrétariat
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ged_verify_login(p_matr text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_login record;
  v_agent record;
  v_role text;
  v_full_name text;
  v_direction_id uuid;
  v_service_id uuid;
  v_profile_role text;
  v_sec_code text;
  v_profile_sec text;
  v_profil_login text;
  v_priv numeric;
BEGIN
  IF p_matr IS NULL OR trim(p_matr) = '' THEN
    RAISE EXCEPTION 'Matricule requis';
  END IF;

  SELECT * INTO v_login
  FROM public."TbLogin"
  WHERE "Matricule" = trim(p_matr)
    AND "Mot_Passe" = p_password
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matricule ou mot de passe incorrect';
  END IF;

  v_profil_login := coalesce(v_login."Profil", '');
  v_sec_code := public.normalize_secretariat_profil(v_profil_login);

  SELECT role::text, secretariat_code, privilege
  INTO v_profile_role, v_profile_sec, v_priv
  FROM public.tb_profiles
  WHERE matr = trim(p_matr)
  LIMIT 1;

  -- Priorité au code déjà enregistré sur le profil app
  v_sec_code := coalesce(v_profile_sec, v_sec_code);

  IF v_profile_role IS NOT NULL THEN
    v_role := v_profile_role;
  ELSE
    v_role := CASE
      WHEN v_sec_code IS NOT NULL THEN 'secretariat'
      WHEN upper(v_profil_login) IN ('SUPERUSER') THEN 'dir_administrative'
      WHEN upper(v_profil_login) IN ('ADMIN') THEN 'directeur'
      WHEN upper(v_profil_login) IN ('SECRETARIAT') THEN 'secretariat'
      WHEN upper(v_profil_login) IN ('DOCUMENTATION', 'ARCHIVES', 'DOC_ARCHIVES') THEN 'documentation_archives'
      WHEN upper(v_profil_login) IN ('CONTROLE', 'AUDIT', 'CONTROLE_AUDIT') THEN 'controle'
      ELSE 'cadre'
    END;
  END IF;

  -- Sec_Archive → peut aussi être documentation ; on garde secrétariat métier
  IF v_sec_code = 'Sec_Archive' AND v_role IS DISTINCT FROM 'documentation_archives' THEN
    v_role := 'secretariat';
  END IF;

  SELECT
    TRIM(CONCAT_WS(' ', p."Nom", p."Postnom", p."Prenom")) AS full_name,
    d.id AS direction_id,
    s.id AS service_id
  INTO v_agent
  FROM public."TbPersonnels" p
  LEFT JOIN public.tb_directions d ON d.libelle = p."Direct"
  LEFT JOIN public.tb_services s ON s.direction_id = d.id AND s.libelle = p."Service"
  WHERE p."Matr" = trim(p_matr)
  LIMIT 1;

  v_full_name := coalesce(nullif(v_agent.full_name, ''), v_login."Nom_User", trim(p_matr));
  v_direction_id := v_agent.direction_id;
  v_service_id := v_agent.service_id;

  -- Aligner direction sur le bureau secrétariat si connu
  IF v_sec_code IS NOT NULL THEN
    SELECT coalesce(v_direction_id, direction_id) INTO v_direction_id
    FROM public.tb_secretariat_desks
    WHERE code = v_sec_code;
  END IF;

  -- Synchroniser le code secrétariat sur le profil app s'il existe
  UPDATE public.tb_profiles
  SET
    secretariat_code = coalesce(secretariat_code, v_sec_code),
    direction_id = coalesce(direction_id, v_direction_id),
    updated_at = now()
  WHERE matr = trim(p_matr)
    AND role = 'secretariat';

  RETURN jsonb_build_object(
    'matr', trim(p_matr),
    'nom_user', v_login."Nom_User",
    'full_name', v_full_name,
    'profil', v_profil_login,
    'role', v_role,
    'secretariat_code', v_sec_code,
    'privilege', coalesce(v_priv, v_login."Privilege"),
    'direction_id', v_direction_id,
    'service_id', v_service_id,
    'email', lower(trim(p_matr)) || '@sonal.local'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) RLS circulations : isolement par bureau (sauf Superuser / Contrôle)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "circulations_select" ON public.tb_circulations;
CREATE POLICY "circulations_select" ON public.tb_circulations
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR public.is_controle()
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR handler_id = auth.uid()
    OR approver_id = auth.uid()
    OR auth.uid() = ANY (cc_users)
    OR receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR sender_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR approver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR (SELECT matr FROM public.tb_profiles WHERE id = auth.uid()) = ANY (cc_matrs)
    -- Secrétariat : uniquement le bureau (desk) du profil
    OR (
      public.is_secretariat_role()
      AND public.current_secretariat_code() IS NOT NULL
      AND secretariat_desk = public.current_secretariat_code()
    )
    -- Secrétariat sans code encore renseigné : file direction (legacy)
    OR (
      public.is_secretariat_role()
      AND public.current_secretariat_code() IS NULL
      AND (
        sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
        OR receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
      )
      AND (
        status = 'en_attente_orientation'
        OR (receiver_matr IS NULL AND parcours_type IN ('P1', 'P3', 'P4', 'BROADCAST'))
      )
      AND (handler_id IS NULL OR handler_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 7) Messagerie inter-secrétariats (demande / transfert de courriers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tb_messagerie_sec (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_profile_id UUID NOT NULL REFERENCES public.tb_profiles(id) ON DELETE CASCADE,
  to_profile_id UUID NOT NULL REFERENCES public.tb_profiles(id) ON DELETE CASCADE,
  from_desk TEXT REFERENCES public.tb_secretariat_desks(code),
  to_desk TEXT REFERENCES public.tb_secretariat_desks(code),
  circulation_id UUID REFERENCES public.tb_circulations(id) ON DELETE SET NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'envoyee'
    CHECK (status IN ('envoyee', 'lue', 'acceptee', 'refusee', 'cloturee')),
  response_note TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messagerie_sec_to
  ON public.tb_messagerie_sec (to_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messagerie_sec_from
  ON public.tb_messagerie_sec (from_profile_id, created_at DESC);

ALTER TABLE public.tb_messagerie_sec ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messagerie_sec_select" ON public.tb_messagerie_sec;
CREATE POLICY "messagerie_sec_select" ON public.tb_messagerie_sec
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR from_profile_id = auth.uid()
    OR to_profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "messagerie_sec_insert" ON public.tb_messagerie_sec;
CREATE POLICY "messagerie_sec_insert" ON public.tb_messagerie_sec
  FOR INSERT TO authenticated
  WITH CHECK (from_profile_id = auth.uid());

DROP POLICY IF EXISTS "messagerie_sec_update" ON public.tb_messagerie_sec;
CREATE POLICY "messagerie_sec_update" ON public.tb_messagerie_sec
  FOR UPDATE TO authenticated
  USING (
    public.is_dir_administrative()
    OR to_profile_id = auth.uid()
    OR from_profile_id = auth.uid()
  );

-- Transfert de bureau après acceptation messagerie
CREATE OR REPLACE FUNCTION public.ged_accept_messagerie_sec(p_message_id uuid, p_note text DEFAULT NULL)
RETURNS public.tb_messagerie_sec
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public.tb_messagerie_sec%ROWTYPE;
  v_me public.tb_profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_me FROM public.tb_profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil introuvable'; END IF;

  SELECT * INTO v_msg FROM public.tb_messagerie_sec WHERE id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message introuvable'; END IF;
  IF v_msg.to_profile_id <> auth.uid() AND NOT public.is_dir_administrative() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF v_msg.circulation_id IS NOT NULL AND v_me.secretariat_code IS NOT NULL THEN
    UPDATE public.tb_circulations
    SET
      secretariat_desk = v_me.secretariat_code,
      receiver_direction_id = coalesce(v_me.direction_id, receiver_direction_id),
      handler_id = NULL,
      updated_at = now()
    WHERE id = v_msg.circulation_id;
  END IF;

  UPDATE public.tb_messagerie_sec SET
    status = 'acceptee',
    response_note = NULLIF(btrim(p_note), ''),
    responded_at = now(),
    updated_at = now()
  WHERE id = p_message_id
  RETURNING * INTO v_msg;

  RETURN v_msg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_accept_messagerie_sec(uuid, text) TO authenticated;

-- Liste des bureaux (lecture authentifiée)
ALTER TABLE public.tb_secretariat_desks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "desks_select" ON public.tb_secretariat_desks;
CREATE POLICY "desks_select" ON public.tb_secretariat_desks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "desks_admin_write" ON public.tb_secretariat_desks;
CREATE POLICY "desks_admin_write" ON public.tb_secretariat_desks
  FOR ALL TO authenticated
  USING (public.is_dir_administrative())
  WITH CHECK (public.is_dir_administrative());
