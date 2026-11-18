-- Privilèges Docs (>9), Invisible de tous, archivage secrétariat, purge âge

-- ---------------------------------------------------------------------------
-- Colonnes archives
-- ---------------------------------------------------------------------------
ALTER TABLE public.tb_archives
  ADD COLUMN IF NOT EXISTS invisible_tous BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_scope TEXT NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS owner_direction_id UUID REFERENCES public.tb_directions(id),
  ADD COLUMN IF NOT EXISTS date_creation DATE NOT NULL DEFAULT CURRENT_DATE;

UPDATE public.tb_archives
SET date_creation = COALESCE(date_doc, (created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE)
WHERE date_creation IS DISTINCT FROM COALESCE(date_doc, (created_at AT TIME ZONE 'UTC')::date, CURRENT_DATE)
   OR date_creation = CURRENT_DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tb_archives_owner_scope_check'
  ) THEN
    ALTER TABLE public.tb_archives
      ADD CONSTRAINT tb_archives_owner_scope_check
      CHECK (owner_scope IN ('agent', 'secretariat', 'documentation'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_archives_secretariat_reference
  ON public.tb_archives (owner_direction_id, reference)
  WHERE owner_scope = 'secretariat'
    AND reference IS NOT NULL AND btrim(reference) <> '';

CREATE INDEX IF NOT EXISTS idx_archives_search_concerne ON public.tb_archives (concerne);
CREATE INDEX IF NOT EXISTS idx_archives_search_reference ON public.tb_archives (reference);
CREATE INDEX IF NOT EXISTS idx_archives_search_emplacement ON public.tb_archives (emplacement);
CREATE INDEX IF NOT EXISTS idx_archives_search_date_creation ON public.tb_archives (date_creation);
CREATE INDEX IF NOT EXISTS idx_archives_search_emetteur ON public.tb_archives (emetteur);
CREATE INDEX IF NOT EXISTS idx_archives_search_recepteur ON public.tb_archives (recepteur);
CREATE INDEX IF NOT EXISTS idx_archives_owner_direction ON public.tb_archives (owner_direction_id)
  WHERE owner_scope = 'secretariat';

COMMENT ON COLUMN public.tb_archives.invisible_tous IS
  'Si true : visible uniquement Superuser + Documentation privilege > 9';
COMMENT ON COLUMN public.tb_archives.owner_scope IS
  'agent | secretariat | documentation';
COMMENT ON COLUMN public.tb_archives.date_creation IS
  'Date métier de création / archivage affichée dans les formulaires';

-- ---------------------------------------------------------------------------
-- Emplacements secrétariat (combo par direction)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tb_emplacements_secretariat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id UUID NOT NULL REFERENCES public.tb_directions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (direction_id, code)
);

ALTER TABLE public.tb_emplacements_secretariat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "emplacements_sec_select" ON public.tb_emplacements_secretariat;
CREATE POLICY "emplacements_sec_select" ON public.tb_emplacements_secretariat
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "emplacements_sec_write" ON public.tb_emplacements_secretariat;
CREATE POLICY "emplacements_sec_write" ON public.tb_emplacements_secretariat
  FOR ALL TO authenticated
  USING (
    public.is_dir_administrative()
    OR (
      (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
      AND direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    public.is_dir_administrative()
    OR (
      (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
      AND direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
    )
  );

-- Seed emplacements types pour chaque direction existante
INSERT INTO public.tb_emplacements_secretariat (direction_id, code, libelle)
SELECT d.id, e.code, e.libelle
FROM public.tb_directions d
CROSS JOIN (VALUES
  ('RAYON-A', 'Rayon A'),
  ('RAYON-B', 'Rayon B'),
  ('ARMOIRE-1', 'Armoire 1'),
  ('ARMOIRE-2', 'Armoire 2'),
  ('CLASSEUR', 'Classeur courant')
) AS e(code, libelle)
ON CONFLICT (direction_id, code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helpers privilege Docs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_documentation_archives()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tb_profiles
    WHERE id = auth.uid() AND role = 'documentation_archives'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_docs_high_privilege()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tb_profiles
    WHERE id = auth.uid()
      AND role = 'documentation_archives'
      AND privilege > 9
  );
$$;

CREATE OR REPLACE FUNCTION public.can_see_invisible_archive()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_dir_administrative() OR public.has_docs_high_privilege();
$$;

CREATE OR REPLACE FUNCTION public.can_purge_archives()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_dir_administrative() OR public.has_docs_high_privilege();
$$;

GRANT EXECUTE ON FUNCTION public.is_documentation_archives() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_docs_high_privilege() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_invisible_archive() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_purge_archives() TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS SELECT archives (Invisible + secrétariat isolé + partage via circulation)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "archives_select_involved" ON public.tb_archives;
CREATE POLICY "archives_select_involved" ON public.tb_archives
  FOR SELECT TO authenticated
  USING (
    -- Invisible : Superuser + Docs privilege > 9 uniquement (pas Contrôle)
    (
      invisible_tous = true
      AND public.can_see_invisible_archive()
    )
    OR (
      invisible_tous = false
      AND (
        public.is_dir_administrative()
        OR public.is_controle()
        OR agent_archive_id = auth.uid()
        -- Archives du secrétariat de ma direction
        OR (
          owner_scope = 'secretariat'
          AND owner_direction_id IS NOT NULL
          AND owner_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
          AND (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
        )
        -- Implication via circulation (= partage / envoi)
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
              -- Docs : voit les archives secrétariat seulement si envoi les implique (sender Docs)
              OR (
                public.is_documentation_archives()
                AND (
                  c.sender_id = auth.uid()
                  OR c.receiver_id = auth.uid()
                )
              )
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
    OR public.has_docs_high_privilege()
    OR agent_archive_id = auth.uid()
    OR (
      public.can_edit_financial_docs()
      AND type_document IN ('note_frais', 'mise_disposition')
    )
    OR (
      owner_scope = 'secretariat'
      AND owner_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
      AND (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
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

DROP POLICY IF EXISTS "archives_delete_purge" ON public.tb_archives;
CREATE POLICY "archives_delete_purge" ON public.tb_archives
  FOR DELETE TO authenticated
  USING (public.can_purge_archives());

-- ---------------------------------------------------------------------------
-- RPC purge physique (DB + chemins storage à nettoyer côté client aussi)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ged_purge_archives_by_ids(p_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paths text[];
  v_count integer := 0;
BEGIN
  IF NOT public.can_purge_archives() THEN
    RAISE EXCEPTION 'Purge réservée au Superuser ou Documentation (privilege > 9)';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted', 0, 'paths', '[]'::jsonb);
  END IF;

  SELECT coalesce(array_agg(file_path) FILTER (WHERE file_path IS NOT NULL), ARRAY[]::text[])
  INTO v_paths
  FROM public.tb_archives
  WHERE id = ANY (p_ids);

  DELETE FROM public.tb_archives WHERE id = ANY (p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted', v_count,
    'paths', to_jsonb(coalesce(v_paths, ARRAY[]::text[]))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_purge_archives_by_ids(bigint[]) TO authenticated;
