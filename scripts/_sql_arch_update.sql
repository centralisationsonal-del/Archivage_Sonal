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
