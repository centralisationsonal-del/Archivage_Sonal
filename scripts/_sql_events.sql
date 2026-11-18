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
