-- Aval financier : type de document + avis unique (favorable / défavorable)

ALTER TABLE public.tb_archives
  ADD COLUMN IF NOT EXISTS type_document VARCHAR(40) NOT NULL DEFAULT 'courrier',
  ADD COLUMN IF NOT EXISTS montant NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS devise VARCHAR(10) DEFAULT 'CDF';

COMMENT ON COLUMN public.tb_archives.type_document IS
  'courrier | note_frais | demande_fonds | mise_disposition';

DO $$ BEGIN
  CREATE TYPE public.avis_aval AS ENUM ('favorable', 'defavorable');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.circulation_status ADD VALUE IF NOT EXISTS 'en_attente_aval';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.tb_circulations
  ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES public.tb_profiles(id),
  ADD COLUMN IF NOT EXISTS approver_matr VARCHAR(20),
  ADD COLUMN IF NOT EXISTS avis_aval public.avis_aval,
  ADD COLUMN IF NOT EXISTS avis_aval_note TEXT,
  ADD COLUMN IF NOT EXISTS avis_aval_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tb_circulations_approver
  ON public.tb_circulations(approver_id);

CREATE INDEX IF NOT EXISTS idx_tb_archives_type_document
  ON public.tb_archives(type_document);

-- RLS : l’approbateur unique voit et met à jour son aval
DROP POLICY IF EXISTS "circulations_select" ON public.tb_circulations;
CREATE POLICY "circulations_select" ON public.tb_circulations
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
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

DROP POLICY IF EXISTS "circulations_update" ON public.tb_circulations;
CREATE POLICY "circulations_update" ON public.tb_circulations
  FOR UPDATE TO authenticated
  USING (
    public.is_dir_administrative()
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR handler_id = auth.uid()
    OR approver_id = auth.uid()
    OR receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR approver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR (
      (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
      AND (
        sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
        OR receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
      )
      AND (handler_id IS NULL OR handler_id = auth.uid())
    )
  );

-- RPC : seul l’approbateur désigné peut donner l’aval (irrévocable)
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
DECLARE
  v_actor public.tb_profiles%ROWTYPE;
  v_circ public.tb_circulations%ROWTYPE;
  v_label text;
BEGIN
  SELECT * INTO v_actor FROM public.tb_profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil utilisateur introuvable';
  END IF;

  SELECT * INTO v_circ FROM public.tb_circulations WHERE id = p_circulation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Circulation introuvable';
  END IF;

  IF v_circ.avis_aval IS NOT NULL THEN
    RAISE EXCEPTION 'Un aval a déjà été enregistré sur ce document (irrévocable)';
  END IF;

  IF v_circ.approver_id IS NULL AND v_circ.approver_matr IS NULL THEN
    RAISE EXCEPTION 'Aucun approbateur n''est désigné pour ce document';
  END IF;

  IF NOT (
    v_circ.approver_id = v_actor.id
    OR (v_circ.approver_matr IS NOT NULL AND v_circ.approver_matr = v_actor.matr)
  ) THEN
    RAISE EXCEPTION 'Seul l''approbateur désigné peut donner son aval sur ce document';
  END IF;

  IF p_avis IS NULL THEN
    RAISE EXCEPTION 'Avis requis (favorable ou défavorable)';
  END IF;

  v_label := CASE p_avis
    WHEN 'favorable' THEN 'Aval favorable'
    ELSE 'Aval défavorable'
  END;

  UPDATE public.tb_circulations SET
    avis_aval = p_avis,
    avis_aval_note = nullif(trim(p_note), ''),
    avis_aval_at = now(),
    status = CASE
      WHEN p_avis = 'favorable' THEN 'traite'::public.circulation_status
      ELSE 'traite'::public.circulation_status
    END,
    updated_at = now()
  WHERE id = p_circulation_id
  RETURNING * INTO v_circ;

  IF p_note IS NOT NULL AND trim(p_note) <> '' THEN
    INSERT INTO public.tb_annotations (circulation_id, author_id, author_matr, note_instruction)
    VALUES (p_circulation_id, v_actor.id, v_actor.matr, 'Aval : ' || trim(p_note));
  END IF;

  INSERT INTO public.tb_circulation_events (
    circulation_id, actor_id, actor_matr, event_type, label, metadata
  ) VALUES (
    p_circulation_id, v_actor.id, v_actor.matr,
    CASE WHEN p_avis = 'favorable' THEN 'aval_favorable' ELSE 'aval_defavorable' END,
    v_label || ' par ' || v_actor.full_name,
    jsonb_build_object('avis', p_avis::text, 'note', nullif(trim(p_note), ''))
  );

  RETURN jsonb_build_object(
    'id', v_circ.id,
    'avis_aval', v_circ.avis_aval,
    'avis_aval_at', v_circ.avis_aval_at,
    'status', v_circ.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_submit_aval(uuid, public.avis_aval, text) TO authenticated;
