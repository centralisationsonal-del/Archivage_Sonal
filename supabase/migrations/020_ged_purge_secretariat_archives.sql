-- Purge secrétariat : documents owner_scope=secretariat de sa direction

CREATE OR REPLACE FUNCTION public.ged_purge_secretariat_archives_by_ids(p_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_direction uuid;
  v_deleted int := 0;
  v_paths text[] := ARRAY[]::text[];
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT role, direction_id INTO v_role, v_direction
  FROM public.tb_profiles
  WHERE id = v_uid;

  IF v_role IS DISTINCT FROM 'secretariat' OR v_direction IS NULL THEN
    RAISE EXCEPTION 'Purge secrétariat réservée au secrétariat de direction';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0, 'paths', '[]'::jsonb);
  END IF;

  FOR r IN
    SELECT id, file_path, chemin
    FROM public.tb_archives
    WHERE id = ANY (p_ids)
      AND owner_scope = 'secretariat'
      AND owner_direction_id = v_direction
  LOOP
    IF r.file_path IS NOT NULL AND btrim(r.file_path) <> '' THEN
      v_paths := array_append(v_paths, r.file_path);
    ELSIF r.chemin IS NOT NULL AND btrim(r.chemin) <> '' THEN
      v_paths := array_append(v_paths, r.chemin);
    END IF;
  END LOOP;

  DELETE FROM public.tb_archives
  WHERE id = ANY (p_ids)
    AND owner_scope = 'secretariat'
    AND owner_direction_id = v_direction;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'paths', to_jsonb(v_paths)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_purge_secretariat_archives_by_ids(bigint[]) TO authenticated;

-- RLS DELETE : secrétariat peut supprimer les archives de sa direction
DROP POLICY IF EXISTS "archives_delete_secretariat" ON public.tb_archives;
CREATE POLICY "archives_delete_secretariat" ON public.tb_archives
  FOR DELETE TO authenticated
  USING (
    owner_scope = 'secretariat'
    AND owner_direction_id = (
      SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid()
    )
    AND (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
  );
