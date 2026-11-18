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
    (v_actor.role = 'controle' AND v_actor.privilege > 10)
    OR public.is_dir_administrative()
  ) THEN
    RAISE EXCEPTION 'Édition réservée au Contrôle avec privilège > 10';
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
