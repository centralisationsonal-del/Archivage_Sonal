-- Photo agent (TbPersonnels) pour affichage GED
CREATE OR REPLACE FUNCTION public.ged_get_personnel_photo(p_matr text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b64 text;
BEGIN
  IF p_matr IS NULL OR btrim(p_matr) = '' THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT encode(p."Photo", 'base64')
  INTO v_b64
  FROM public."TbPersonnels" p
  WHERE p."Matr" = btrim(p_matr)
    AND p."Photo" IS NOT NULL
    AND octet_length(p."Photo") > 0
  LIMIT 1;

  RETURN v_b64;
END;
$$;

COMMENT ON FUNCTION public.ged_get_personnel_photo(text) IS
  'Retourne la photo TbPersonnels (base64) pour un matricule — utilisateurs authentifiés';

GRANT EXECUTE ON FUNCTION public.ged_get_personnel_photo(text) TO authenticated;
