-- Accès destinataire / CC aussi par matricule (pas seulement receiver_id)
DROP POLICY IF EXISTS "circulations_select" ON public.tb_circulations;
CREATE POLICY "circulations_select" ON public.tb_circulations
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR auth.uid() = ANY (cc_users)
    OR receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR (SELECT matr FROM public.tb_profiles WHERE id = auth.uid()) = ANY (cc_matrs)
    OR (
      (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
      AND (
        sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
        OR receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "circulations_update" ON public.tb_circulations;
CREATE POLICY "circulations_update" ON public.tb_circulations
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR public.is_dir_administrative()
    OR (
      (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
      AND (
        sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
        OR receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "annotations_select" ON public.tb_annotations;
CREATE POLICY "annotations_select" ON public.tb_annotations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.id = circulation_id
        AND (
          public.is_dir_administrative()
          OR c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR auth.uid() = ANY (c.cc_users)
          OR c.receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
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

DROP POLICY IF EXISTS "events_select" ON public.tb_circulation_events;
CREATE POLICY "events_select" ON public.tb_circulation_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tb_circulations c
      WHERE c.id = circulation_id
        AND (
          public.is_dir_administrative()
          OR c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR auth.uid() = ANY (c.cc_users)
          OR c.receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
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

-- Courriers "orientés" sans destinataire (ancien bug) → refile secrétariat
UPDATE public.tb_circulations
SET status = 'en_attente_orientation', updated_at = now()
WHERE status = 'oriente' AND receiver_matr IS NULL AND receiver_id IS NULL;
