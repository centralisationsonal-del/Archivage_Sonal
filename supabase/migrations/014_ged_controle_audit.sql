-- Profil Contrôle & Audit : lecture / traçabilité uniquement (aucun aval)

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'controle';

CREATE OR REPLACE FUNCTION public.is_controle()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tb_profiles
    WHERE id = auth.uid() AND role = 'controle'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_controle() TO authenticated;

-- Circulations : lecture globale pour Contrôle (pas d’UPDATE via ce rôle)
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
    OR (
      (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
      AND (
        sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
        OR receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
      )
      AND (
        status = 'en_attente_orientation'
        OR (
          status IN ('en_attente_orientation', 'oriente')
          AND receiver_matr IS NULL
          AND parcours_type IN ('P1', 'P3', 'P4', 'BROADCAST')
        )
      )
      AND (handler_id IS NULL OR handler_id = auth.uid())
    )
  );

-- Archives : lecture pour Contrôle
DROP POLICY IF EXISTS "archives_select_involved" ON public.tb_archives;
CREATE POLICY "archives_select_involved" ON public.tb_archives
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR public.is_controle()
    OR agent_archive_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.archive_id = tb_archives.id
        AND (
          c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR c.handler_id = auth.uid()
          OR c.approver_id = auth.uid()
          OR auth.uid() = ANY (c.cc_users)
          OR c.receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
          OR c.sender_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
          OR c.approver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
          OR (SELECT matr FROM public.tb_profiles WHERE id = auth.uid()) = ANY (c.cc_matrs)
          OR (
            (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
            AND (
              c.sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
              OR c.receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
            )
            AND (
              c.status = 'en_attente_orientation'
              OR (c.receiver_matr IS NULL AND c.parcours_type IN ('P1', 'P3', 'P4', 'BROADCAST'))
            )
            AND (c.handler_id IS NULL OR c.handler_id = auth.uid())
          )
        )
    )
  );

-- Événements (traçabilité)
DROP POLICY IF EXISTS "events_select" ON public.tb_circulation_events;
CREATE POLICY "events_select" ON public.tb_circulation_events
  FOR SELECT TO authenticated
  USING (
    public.is_controle()
    OR EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.id = circulation_id
        AND (
          public.is_dir_administrative()
          OR c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR c.handler_id = auth.uid()
          OR c.approver_id = auth.uid()
          OR auth.uid() = ANY (c.cc_users)
          OR c.receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
          OR c.sender_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
          OR (SELECT matr FROM public.tb_profiles WHERE id = auth.uid()) = ANY (c.cc_matrs)
          OR (
            (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
            AND (
              c.sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
              OR c.receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
            )
          )
        )
    )
  );

-- Étapes d’aval : lecture pour Contrôle (jamais d’UPDATE via ce rôle)
DROP POLICY IF EXISTS "aval_etapes_select" ON public.tb_aval_etapes;
CREATE POLICY "aval_etapes_select" ON public.tb_aval_etapes
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR public.is_controle()
    OR required_profile_id = auth.uid()
    OR required_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR actor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.id = circulation_id
        AND (
          c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR c.approver_id = auth.uid()
          OR c.handler_id = auth.uid()
          OR auth.uid() = ANY (c.cc_users)
        )
    )
  );

-- Mapping login CONTROLE / AUDIT
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

  SELECT role::text INTO v_profile_role
  FROM public.tb_profiles
  WHERE matr = trim(p_matr)
  LIMIT 1;

  IF v_profile_role IS NOT NULL THEN
    v_role := v_profile_role;
  ELSE
    v_role := CASE upper(coalesce(v_login."Profil", ''))
      WHEN 'SUPERUSER' THEN 'dir_administrative'
      WHEN 'ADMIN' THEN 'directeur'
      WHEN 'SECRETARIAT' THEN 'secretariat'
      WHEN 'DOCUMENTATION' THEN 'documentation_archives'
      WHEN 'ARCHIVES' THEN 'documentation_archives'
      WHEN 'DOC_ARCHIVES' THEN 'documentation_archives'
      WHEN 'CONTROLE' THEN 'controle'
      WHEN 'AUDIT' THEN 'controle'
      WHEN 'CONTROLE_AUDIT' THEN 'controle'
      ELSE 'cadre'
    END;
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

  RETURN jsonb_build_object(
    'matr', trim(p_matr),
    'nom_user', v_login."Nom_User",
    'full_name', v_full_name,
    'profil', v_login."Profil",
    'role', v_role,
    'direction_id', v_direction_id,
    'service_id', v_service_id,
    'email', lower(trim(p_matr)) || '@sonal.local'
  );
END;
$$;
