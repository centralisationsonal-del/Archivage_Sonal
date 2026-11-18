-- Chaîne d’avals financiers (note de frais / mise à disposition)

CREATE TABLE IF NOT EXISTS public.tb_aval_etapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circulation_id UUID NOT NULL REFERENCES public.tb_circulations(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  role_key TEXT NOT NULL,
  role_label TEXT NOT NULL,
  required_matr VARCHAR(20),
  required_profile_id UUID REFERENCES public.tb_profiles(id),
  actor_id UUID REFERENCES public.tb_profiles(id),
  actor_matr VARCHAR(20),
  actor_full_name TEXT,
  avis public.avis_aval,
  note TEXT,
  signed_at TIMESTAMPTZ,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (circulation_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_aval_etapes_circ
  ON public.tb_aval_etapes(circulation_id);
CREATE INDEX IF NOT EXISTS idx_aval_etapes_current
  ON public.tb_aval_etapes(required_matr, is_current)
  WHERE is_current = true AND avis IS NULL;

ALTER TABLE public.tb_aval_etapes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aval_etapes_select" ON public.tb_aval_etapes;
CREATE POLICY "aval_etapes_select" ON public.tb_aval_etapes
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
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

DROP POLICY IF EXISTS "aval_etapes_insert" ON public.tb_aval_etapes;
CREATE POLICY "aval_etapes_insert" ON public.tb_aval_etapes
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "aval_etapes_update" ON public.tb_aval_etapes;
CREATE POLICY "aval_etapes_update" ON public.tb_aval_etapes
  FOR UPDATE TO authenticated
  USING (
    public.is_dir_administrative()
    OR required_profile_id = auth.uid()
    OR required_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
  );

-- RPC : aval sur l’étape courante uniquement
CREATE OR REPLACE FUNCTION public.ged_submit_aval_step(
  p_circulation_id uuid,
  p_avis public.avis_aval,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.tb_profiles%ROWTYPE;
  v_step public.tb_aval_etapes%ROWTYPE;
  v_next public.tb_aval_etapes%ROWTYPE;
  v_label text;
BEGIN
  SELECT * INTO v_actor FROM public.tb_profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil utilisateur introuvable';
  END IF;

  SELECT * INTO v_step
  FROM public.tb_aval_etapes
  WHERE circulation_id = p_circulation_id
    AND is_current = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucune étape d''aval en cours pour ce document';
  END IF;

  IF v_step.avis IS NOT NULL THEN
    RAISE EXCEPTION 'Cette étape d''aval est déjà certifiée (irrévocable)';
  END IF;

  IF v_step.role_key = 'emetteur' THEN
    RAISE EXCEPTION 'La signature émetteur est déjà enregistrée à la création';
  END IF;

  IF NOT (
    v_step.required_profile_id = v_actor.id
    OR (v_step.required_matr IS NOT NULL AND v_step.required_matr = v_actor.matr)
    -- ADG : Superuser / Direction administrative peut signer si aucun matricule ADG résolu
    OR (
      v_step.role_key = 'adg'
      AND v_actor.role = 'dir_administrative'
      AND v_step.required_matr IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Seul % peut donner son aval à cette étape', v_step.role_label;
  END IF;

  IF p_avis IS NULL THEN
    RAISE EXCEPTION 'Avis requis (favorable ou défavorable)';
  END IF;

  v_label := CASE p_avis
    WHEN 'favorable' THEN 'Aval favorable'
    ELSE 'Aval défavorable'
  END;

  UPDATE public.tb_aval_etapes SET
    avis = p_avis,
    note = nullif(trim(p_note), ''),
    actor_id = v_actor.id,
    actor_matr = v_actor.matr,
    actor_full_name = v_actor.full_name,
    signed_at = now(),
    is_current = false
  WHERE id = v_step.id
  RETURNING * INTO v_step;

  INSERT INTO public.tb_circulation_events (
    circulation_id, actor_id, actor_matr, event_type, label, metadata
  ) VALUES (
    p_circulation_id, v_actor.id, v_actor.matr,
    CASE WHEN p_avis = 'favorable' THEN 'aval_favorable' ELSE 'aval_defavorable' END,
    v_label || ' — ' || v_step.role_label || ' (' || v_actor.full_name || ')',
    jsonb_build_object(
      'avis', p_avis::text,
      'role_key', v_step.role_key,
      'step_order', v_step.step_order,
      'note', nullif(trim(p_note), '')
    )
  );

  IF p_avis = 'defavorable' THEN
    UPDATE public.tb_circulations SET
      avis_aval = 'defavorable',
      avis_aval_note = nullif(trim(p_note), ''),
      avis_aval_at = now(),
      status = 'traite',
      approver_id = NULL,
      approver_matr = NULL,
      updated_at = now()
    WHERE id = p_circulation_id;

    RETURN jsonb_build_object(
      'done', true,
      'avis', 'defavorable',
      'step', v_step.role_key
    );
  END IF;

  -- Étape suivante
  SELECT * INTO v_next
  FROM public.tb_aval_etapes
  WHERE circulation_id = p_circulation_id
    AND step_order = v_step.step_order + 1;

  IF FOUND THEN
    UPDATE public.tb_aval_etapes SET is_current = true WHERE id = v_next.id;
    UPDATE public.tb_circulations SET
      status = 'en_attente_aval',
      approver_id = v_next.required_profile_id,
      approver_matr = v_next.required_matr,
      updated_at = now()
    WHERE id = p_circulation_id;

    RETURN jsonb_build_object(
      'done', false,
      'avis', 'favorable',
      'next_role', v_next.role_key,
      'next_label', v_next.role_label
    );
  END IF;

  -- Chaîne terminée (dernier aval favorable, souvent ADG)
  UPDATE public.tb_circulations SET
    avis_aval = 'favorable',
    avis_aval_note = nullif(trim(p_note), ''),
    avis_aval_at = now(),
    status = 'traite',
    approver_id = NULL,
    approver_matr = NULL,
    updated_at = now()
  WHERE id = p_circulation_id;

  RETURN jsonb_build_object(
    'done', true,
    'avis', 'favorable',
    'step', v_step.role_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_submit_aval_step(uuid, public.avis_aval, text) TO authenticated;

-- Compat : ancienne RPC pointe vers l’étape courante
CREATE OR REPLACE FUNCTION public.ged_submit_aval(
  p_circulation_id uuid,
  p_avis public.avis_aval,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.ged_submit_aval_step(p_circulation_id, p_avis, p_note);
END;
$$;
