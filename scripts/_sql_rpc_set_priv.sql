CREATE OR REPLACE FUNCTION public.ged_admin_set_privilege(
  p_profile_id uuid,
  p_privilege integer
)
RETURNS public.tb_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tb_profiles%ROWTYPE;
BEGIN
  IF NOT public.is_dir_administrative() THEN
    RAISE EXCEPTION 'Accès réservé au Superuser';
  END IF;

  IF p_privilege IS NULL OR p_privilege < 0 THEN
    RAISE EXCEPTION 'Privilège invalide';
  END IF;

  UPDATE public.tb_profiles SET
    privilege = p_privilege,
    updated_at = now()
  WHERE id = p_profile_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable';
  END IF;

  IF v_row.matr IS NOT NULL THEN
    UPDATE public."TbLogin" SET
      "Privilege" = p_privilege,
      "Profil" = CASE v_row.role
        WHEN 'dir_administrative' THEN 'SUPERUSER'
        WHEN 'directeur' THEN 'ADMIN'
        WHEN 'secretariat' THEN 'SECRETARIAT'
        WHEN 'chef_service' THEN 'CHEF'
        WHEN 'documentation_archives' THEN 'ARCHIVES'
        WHEN 'controle' THEN 'CONTROLE'
        ELSE 'EXPLOIT'
      END,
      updated_at = now()
    WHERE "Matricule" = v_row.matr;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_admin_set_privilege(uuid, integer) TO authenticated;
