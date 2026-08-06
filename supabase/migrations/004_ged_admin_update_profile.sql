-- Mise à jour profil par superuser (bypass RLS + validations)
CREATE OR REPLACE FUNCTION public.ged_admin_update_profile(
  p_profile_id uuid,
  p_full_name text DEFAULT NULL,
  p_role public.app_role DEFAULT NULL,
  p_direction_id uuid DEFAULT NULL,
  p_service_id uuid DEFAULT NULL,
  p_matr text DEFAULT NULL,
  p_clear_direction boolean DEFAULT false,
  p_clear_service boolean DEFAULT false,
  p_clear_matr boolean DEFAULT false
)
RETURNS public.tb_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tb_profiles%ROWTYPE;
  v_matr text;
  v_direction_id uuid;
  v_service_id uuid;
  v_profil_login text;
BEGIN
  IF NOT public.is_dir_administrative() THEN
    RAISE EXCEPTION 'Accès réservé au superuser (Direction Administrative)';
  END IF;

  SELECT * INTO v_row FROM public.tb_profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable';
  END IF;

  v_matr := v_row.matr;
  IF p_clear_matr THEN
    v_matr := NULL;
  ELSIF p_matr IS NOT NULL AND trim(p_matr) <> '' THEN
    v_matr := trim(p_matr);
    IF NOT EXISTS (SELECT 1 FROM public."TbPersonnels" WHERE "Matr" = v_matr) THEN
      RAISE EXCEPTION 'Matricule % introuvable dans TbPersonnels', v_matr;
    END IF;
  END IF;

  v_direction_id := v_row.direction_id;
  IF p_clear_direction THEN
    v_direction_id := NULL;
  ELSIF p_direction_id IS NOT NULL THEN
    v_direction_id := p_direction_id;
  END IF;

  v_service_id := v_row.service_id;
  IF p_clear_service OR v_direction_id IS NULL THEN
    v_service_id := NULL;
  ELSIF p_service_id IS NOT NULL THEN
    v_service_id := p_service_id;
  END IF;

  IF v_service_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tb_services
      WHERE id = v_service_id
        AND (v_direction_id IS NULL OR direction_id = v_direction_id)
    ) THEN
      RAISE EXCEPTION 'Le service ne correspond pas à la direction choisie';
    END IF;
  END IF;

  UPDATE public.tb_profiles SET
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    role = coalesce(p_role, role),
    direction_id = v_direction_id,
    service_id = v_service_id,
    matr = v_matr,
    updated_at = now()
  WHERE id = p_profile_id
  RETURNING * INTO v_row;

  IF v_row.matr IS NOT NULL THEN
    v_profil_login := CASE v_row.role
      WHEN 'dir_administrative' THEN 'SUPERUSER'
      WHEN 'directeur' THEN 'ADMIN'
      WHEN 'secretariat' THEN 'SECRETARIAT'
      WHEN 'chef_service' THEN 'CHEF'
      ELSE 'EXPLOIT'
    END;

    UPDATE public."TbLogin"
    SET
      "Profil" = v_profil_login,
      "Nom_User" = coalesce(nullif(split_part(v_row.full_name, ' ', 1), ''), "Nom_User"),
      updated_at = now()
    WHERE "Matricule" = v_row.matr;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_admin_update_profile(
  uuid, text, public.app_role, uuid, uuid, text, boolean, boolean, boolean
) TO authenticated;
