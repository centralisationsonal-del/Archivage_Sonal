-- Assignation secrétariat → agent concerné + réparation directions profils
UPDATE public.tb_profiles p
SET
  direction_id = coalesce(p.direction_id, a.direction_id),
  service_id = coalesce(p.service_id, a.service_id),
  updated_at = now()
FROM public.v_ged_agents a
WHERE p.matr = a.matr
  AND (p.direction_id IS NULL OR p.service_id IS NULL);

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
