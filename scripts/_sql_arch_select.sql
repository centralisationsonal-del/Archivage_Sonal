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
