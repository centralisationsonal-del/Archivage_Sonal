-- Contrôle : privilège > 10 autorise l’édition des documents financiers (pas l’aval)

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'controle';

ALTER TABLE public.tb_profiles
  ADD COLUMN IF NOT EXISTS privilege INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.tb_profiles.privilege IS
  'Niveau de privilège (TbLogin). Contrôle avec privilege > 10 peut éditer les docs financiers.';

-- Synchroniser depuis TbLogin si présent
UPDATE public.tb_profiles p
SET privilege = COALESCE(l."Privilege", 1)
FROM public."TbLogin" l
WHERE l."Matricule" = p.matr
  AND l."Privilege" IS NOT NULL;

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

CREATE OR REPLACE FUNCTION public.can_edit_financial_docs()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tb_profiles
    WHERE id = auth.uid()
      AND role = 'controle'
      AND privilege > 10
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_controle() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_financial_docs() TO authenticated;

-- Lecture globale Contrôle (si 014 non appliquée)
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

-- Mise à jour archives : Contrôle privilege > 10 sur docs financiers uniquement
DROP POLICY IF EXISTS "archives_update_involved" ON public.tb_archives;
CREATE POLICY "archives_update_involved" ON public.tb_archives
  FOR UPDATE TO authenticated
  USING (
    public.is_dir_administrative()
    OR agent_archive_id = auth.uid()
    OR (
      public.can_edit_financial_docs()
      AND type_document IN ('note_frais', 'mise_disposition')
    )
    OR EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.archive_id = tb_archives.id
        AND (
          c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR c.handler_id = auth.uid()
          OR (
            (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
            AND (
              c.sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
              OR c.receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
            )
            AND (c.handler_id IS NULL OR c.handler_id = auth.uid())
          )
        )
    )
  );

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
        )
    )
  );

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

-- Édition contrôlée document financier
CREATE OR REPLACE FUNCTION public.ged_update_financial_document(
  p_circulation_id uuid,
  p_concerne text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_montant numeric DEFAULT NULL,
  p_devise text DEFAULT NULL,
  p_emetteur text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.tb_profiles%ROWTYPE;
  v_circ public.tb_circulations%ROWTYPE;
  v_arch public.tb_archives%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.tb_profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable';
  END IF;

  IF NOT (
    v_actor.role = 'controle' AND v_actor.privilege > 10
  ) AND NOT public.is_dir_administrative() THEN
    RAISE EXCEPTION 'Édition réservée au Contrôle avec privilège > 10';
  END IF;

  -- Contrôle : jamais d’aval via cette voie
  IF v_actor.role = 'controle' AND v_actor.privilege <= 10 THEN
    RAISE EXCEPTION 'Privilège insuffisant (requis > 10) pour éditer un document financier';
  END IF;

  SELECT * INTO v_circ FROM public.tb_circulations WHERE id = p_circulation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circulation introuvable';
  END IF;

  SELECT * INTO v_arch FROM public.tb_archives WHERE id = v_circ.archive_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archive introuvable';
  END IF;

  IF v_arch.type_document NOT IN ('note_frais', 'mise_disposition') THEN
    RAISE EXCEPTION 'Seul un document financier (note de frais / mise à disposition) peut être édité ici';
  END IF;

  UPDATE public.tb_archives SET
    concerne = coalesce(nullif(trim(p_concerne), ''), concerne),
    reference = CASE
      WHEN p_reference IS NULL THEN reference
      ELSE nullif(trim(p_reference), '')
    END,
    montant = coalesce(p_montant, montant),
    devise = coalesce(nullif(trim(p_devise), ''), devise, 'CDF'),
    emetteur = coalesce(nullif(trim(p_emetteur), ''), emetteur),
    updated_at = now()
  WHERE id = v_arch.id
  RETURNING * INTO v_arch;

  INSERT INTO public.tb_circulation_events (
    circulation_id, actor_id, actor_matr, event_type, label, metadata
  ) VALUES (
    p_circulation_id,
    v_actor.id,
    v_actor.matr,
    'controle_edit',
    'Correction Contrôle — document financier (' || v_actor.full_name || ')',
    jsonb_build_object(
      'note', nullif(trim(p_note), ''),
      'montant', v_arch.montant,
      'devise', v_arch.devise,
      'privilege', v_actor.privilege
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'archive_id', v_arch.id,
    'montant', v_arch.montant,
    'devise', v_arch.devise
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_update_financial_document(uuid, text, text, numeric, text, text, text)
  TO authenticated;

-- Superuser : fixer le privilège (ex. 11 pour édition financière Contrôle)
CREATE OR REPLACE FUNCTION public.ged_admin_set_privilege(
  p_profile_id uuid,
  p_privilege integer
)
RETURNS public.tb_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tb_profiles%ROWTYPE;
BEGIN
  IF NOT public.is_dir_administrative() THEN
    RAISE EXCEPTION 'Accès réservé au Superuser';
  END IF;

  IF p_privilege IS NULL OR p_privilege < 0 THEN
    RAISE EXCEPTION 'Privilège invalide';
  END IF;

  UPDATE public.tb_profiles SET
    privilege = p_privilege,
    updated_at = now()
  WHERE id = p_profile_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable';
  END IF;

  IF v_row.matr IS NOT NULL THEN
    UPDATE public."TbLogin" SET
      "Privilege" = p_privilege,
      "Profil" = CASE v_row.role
        WHEN 'dir_administrative' THEN 'SUPERUSER'
        WHEN 'directeur' THEN 'ADMIN'
        WHEN 'secretariat' THEN 'SECRETARIAT'
        WHEN 'chef_service' THEN 'CHEF'
        WHEN 'documentation_archives' THEN 'ARCHIVES'
        WHEN 'controle' THEN 'CONTROLE'
        ELSE 'EXPLOIT'
      END,
      updated_at = now()
    WHERE "Matricule" = v_row.matr;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_admin_set_privilege(uuid, integer) TO authenticated;
