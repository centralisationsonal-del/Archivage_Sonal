-- Restreindre Documentation & Archives : plus d'accès global
-- (seul dir_administrative voit tout)

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

-- Circulations : Documentation n'a plus le droit global
DROP POLICY IF EXISTS "circulations_select" ON public.tb_circulations;
CREATE POLICY "circulations_select" ON public.tb_circulations
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR auth.uid() = ANY (cc_users)
    OR receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR sender_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
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
