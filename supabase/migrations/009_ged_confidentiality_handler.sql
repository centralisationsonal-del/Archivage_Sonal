-- Confidentialité : handler_id + RLS sans accès direction historique

ALTER TABLE public.tb_circulations
  ADD COLUMN IF NOT EXISTS handler_id UUID REFERENCES public.tb_profiles(id);

CREATE INDEX IF NOT EXISTS idx_tb_circulations_handler
  ON public.tb_circulations(handler_id);

DROP POLICY IF EXISTS "circulations_select" ON public.tb_circulations;
CREATE POLICY "circulations_select" ON public.tb_circulations
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR handler_id = auth.uid()
    OR auth.uid() = ANY (cc_users)
    OR receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR sender_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR (SELECT matr FROM public.tb_profiles WHERE id = auth.uid()) = ANY (cc_matrs)
    OR (
      -- Secrétariat : uniquement files d’attente non prises / prises par soi
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

DROP POLICY IF EXISTS "circulations_update" ON public.tb_circulations;
CREATE POLICY "circulations_update" ON public.tb_circulations
  FOR UPDATE TO authenticated
  USING (
    public.is_dir_administrative()
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR handler_id = auth.uid()
    OR receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR (
      (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
      AND (
        sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
        OR receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
      )
      AND (handler_id IS NULL OR handler_id = auth.uid())
    )
  );

-- Archives : pas d’accès direction historique pour secrétariat (uniquement liés à soi / en file)
DROP POLICY IF EXISTS "archives_select_involved" ON public.tb_archives;
CREATE POLICY "archives_select_involved" ON public.tb_archives
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR agent_archive_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.archive_id = tb_archives.id
        AND (
          c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR c.handler_id = auth.uid()
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
            AND (
              c.status = 'en_attente_orientation'
              OR (c.receiver_matr IS NULL AND c.parcours_type IN ('P1', 'P3', 'P4', 'BROADCAST'))
            )
            AND (c.handler_id IS NULL OR c.handler_id = auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "archives_update_involved" ON public.tb_archives;
CREATE POLICY "archives_update_involved" ON public.tb_archives
  FOR UPDATE TO authenticated
  USING (
    public.is_dir_administrative()
    OR agent_archive_id = auth.uid()
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

-- Assignation : le secrétariat qui oriente devient handler exclusif
CREATE OR REPLACE FUNCTION public.ged_secretariat_assign_agent(
  p_circulation_id uuid,
  p_receiver_matr text,
  p_num_folio text DEFAULT NULL,
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
  v_agent record;
  v_receiver_id uuid;
  v_recepteur text;
BEGIN
  SELECT * INTO v_actor FROM public.tb_profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil utilisateur introuvable';
  END IF;

  IF v_actor.role NOT IN ('secretariat', 'dir_administrative') THEN
    RAISE EXCEPTION 'Seul le secrétariat peut assigner un destinataire';
  END IF;

  SELECT * INTO v_circ FROM public.tb_circulations WHERE id = p_circulation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circulation introuvable';
  END IF;

  IF v_circ.handler_id IS NOT NULL AND v_circ.handler_id IS DISTINCT FROM v_actor.id
     AND v_actor.role <> 'dir_administrative' THEN
    RAISE EXCEPTION 'Ce courrier est déjà pris en charge par un autre utilisateur';
  END IF;

  IF v_actor.role = 'secretariat' THEN
    IF v_actor.direction_id IS NULL THEN
      RAISE EXCEPTION 'Votre profil secrétariat n''a pas de direction. Contactez le superuser.';
    END IF;
    IF v_circ.sender_direction_id IS DISTINCT FROM v_actor.direction_id
       AND v_circ.receiver_direction_id IS DISTINCT FROM v_actor.direction_id THEN
      RAISE EXCEPTION 'Ce courrier n''appartient pas à votre direction';
    END IF;
  END IF;

  IF p_receiver_matr IS NULL OR trim(p_receiver_matr) = '' THEN
    RAISE EXCEPTION 'Matricule destinataire requis';
  END IF;

  SELECT a.matr, a.full_name, a.direction_id, a.service_id
  INTO v_agent
  FROM public.v_ged_agents a
  WHERE a.matr = trim(p_receiver_matr)
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT
      p."Matr" AS matr,
      TRIM(CONCAT_WS(' ', p."Nom", p."Postnom", p."Prenom")) AS full_name,
      d.id AS direction_id,
      s.id AS service_id
    INTO v_agent
    FROM public."TbPersonnels" p
    LEFT JOIN public.tb_directions d ON d.libelle = p."Direct"
    LEFT JOIN public.tb_services s ON s.direction_id = d.id AND s.libelle = p."Service"
    WHERE p."Matr" = trim(p_receiver_matr)
    LIMIT 1;
  END IF;

  IF v_agent.matr IS NULL THEN
    RAISE EXCEPTION 'Agent destinataire introuvable (%)', trim(p_receiver_matr);
  END IF;

  SELECT id INTO v_receiver_id FROM public.tb_profiles WHERE matr = trim(p_receiver_matr) LIMIT 1;
  v_recepteur := v_agent.full_name;

  UPDATE public.tb_circulations SET
    receiver_matr = trim(p_receiver_matr),
    receiver_id = v_receiver_id,
    receiver_direction_id = coalesce(v_agent.direction_id, receiver_direction_id, v_actor.direction_id),
    handler_id = coalesce(handler_id, v_actor.id),
    status = 'oriente',
    updated_at = now()
  WHERE id = p_circulation_id
  RETURNING * INTO v_circ;

  UPDATE public.tb_archives SET
    recepteur = v_recepteur,
    num_folio = coalesce(nullif(trim(p_num_folio), ''), num_folio),
    direction_recept_id = coalesce(v_agent.direction_id, direction_recept_id),
    service_recept_id = coalesce(v_agent.service_id, service_recept_id),
    updated_at = now()
  WHERE id = v_circ.archive_id;

  IF p_note IS NOT NULL AND trim(p_note) <> '' THEN
    INSERT INTO public.tb_annotations (circulation_id, author_id, author_matr, note_instruction)
    VALUES (p_circulation_id, v_actor.id, v_actor.matr, trim(p_note));
  END IF;

  INSERT INTO public.tb_circulation_events (
    circulation_id, actor_id, actor_matr, event_type, label, metadata
  ) VALUES (
    p_circulation_id, v_actor.id, v_actor.matr, 'expedited',
    'Courrier transmis à ' || v_recepteur,
    jsonb_build_object('receiver_matr', trim(p_receiver_matr), 'receiver_id', v_receiver_id, 'num_folio', p_num_folio)
  );

  RETURN jsonb_build_object(
    'id', v_circ.id,
    'status', v_circ.status,
    'receiver_matr', v_circ.receiver_matr,
    'receiver_id', v_circ.receiver_id,
    'recepteur', v_recepteur
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_secretariat_assign_agent(uuid, text, text, text) TO authenticated;
