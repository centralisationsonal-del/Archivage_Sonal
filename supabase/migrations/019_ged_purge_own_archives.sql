-- Purge personnelle : un agent peut supprimer SES archives (boîte cadre / directeur)

CREATE OR REPLACE FUNCTION public.ged_purge_own_archives_by_ids(p_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted int := 0;
  v_paths text[] := ARRAY[]::text[];
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0, 'paths', '[]'::jsonb);
  END IF;

  FOR r IN
    SELECT id, file_path, chemin
    FROM public.tb_archives
    WHERE id = ANY (p_ids)
      AND agent_archive_id = v_uid
  LOOP
    IF r.file_path IS NOT NULL AND btrim(r.file_path) <> '' THEN
      v_paths := array_append(v_paths, r.file_path);
    ELSIF r.chemin IS NOT NULL AND btrim(r.chemin) <> '' THEN
      v_paths := array_append(v_paths, r.chemin);
    END IF;
  END LOOP;

  DELETE FROM public.tb_archives
  WHERE id = ANY (p_ids)
    AND agent_archive_id = v_uid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'paths', to_jsonb(v_paths)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_purge_own_archives_by_ids(bigint[]) TO authenticated;

-- Permettre DELETE RLS pour ses propres archives (en plus de la purge Docs/Superuser)
DROP POLICY IF EXISTS "archives_delete_own" ON public.tb_archives;
CREATE POLICY "archives_delete_own" ON public.tb_archives
  FOR DELETE TO authenticated
  USING (agent_archive_id = auth.uid());
