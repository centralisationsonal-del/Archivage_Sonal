-- Isolement strict Agenda Chef : un profil = son agenda ; Superuser seul en transverse
DROP POLICY IF EXISTS "agenda_chef_select" ON public."TbAgenda_Chef";
CREATE POLICY "agenda_chef_select" ON public."TbAgenda_Chef"
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "agenda_chef_insert" ON public."TbAgenda_Chef";
CREATE POLICY "agenda_chef_insert" ON public."TbAgenda_Chef"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_dir_administrative()
    OR (
      public.is_secretariat_role()
      AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "agenda_chef_update" ON public."TbAgenda_Chef";
CREATE POLICY "agenda_chef_update" ON public."TbAgenda_Chef"
  FOR UPDATE TO authenticated
  USING (
    public.is_dir_administrative()
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.is_dir_administrative()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "agenda_chef_delete" ON public."TbAgenda_Chef";
CREATE POLICY "agenda_chef_delete" ON public."TbAgenda_Chef"
  FOR DELETE TO authenticated
  USING (
    public.is_dir_administrative()
    OR created_by = auth.uid()
  );

COMMENT ON COLUMN public."TbAgenda_Chef".created_by IS
  'Propriétaire du point d’agenda — seul ce profil (ou Superuser) y accède';
