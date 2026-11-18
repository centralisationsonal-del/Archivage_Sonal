-- Création compte GED : réutiliser un TbLogin existant (sans auth/profil)
CREATE OR REPLACE FUNCTION public.ged_admin_create_account(
  p_matr text,
  p_password text,
  p_full_name text,
  p_role public.app_role DEFAULT 'cadre',
  p_direction_id uuid DEFAULT NULL,
  p_service_id uuid DEFAULT NULL,
  p_nom_user text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_matr text;
  v_email text;
  v_auth_password text;
  v_user_id uuid;
  v_login_id integer;
  v_profil text;
  v_full_name text;
  v_encrypted_pw text;
  v_instance_id uuid;
  v_dir uuid;
  v_svc uuid;
  v_login_exists boolean := false;
BEGIN
  IF NOT public.is_dir_administrative() THEN
    RAISE EXCEPTION 'Accès réservé au Superuser';
  END IF;

  v_matr := trim(p_matr);
  IF v_matr IS NULL OR v_matr = '' THEN
    RAISE EXCEPTION 'Matricule requis';
  END IF;
  IF p_password IS NULL OR length(trim(p_password)) < 1 THEN
    RAISE EXCEPTION 'Mot de passe requis';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public."TbPersonnels" WHERE "Matr" = v_matr) THEN
    RAISE EXCEPTION 'Matricule introuvable dans le personnel RH';
  END IF;

  v_email := lower(v_matr) || '@sonal.local';
  v_auth_password := CASE WHEN length(p_password) >= 6 THEN p_password ELSE 'Sonal_' || p_password END;
  v_full_name := coalesce(nullif(trim(p_full_name), ''), nullif(trim(p_nom_user), ''), v_matr);
  v_dir := p_direction_id;
  v_svc := p_service_id;

  IF v_dir IS NULL OR v_svc IS NULL THEN
    SELECT d.id, s.id INTO v_dir, v_svc
    FROM public."TbPersonnels" p
    LEFT JOIN public.tb_directions d ON d.libelle = p."Direct"
    LEFT JOIN public.tb_services s ON s.direction_id = d.id AND s.libelle = p."Service"
    WHERE p."Matr" = v_matr;
    v_dir := coalesce(p_direction_id, v_dir);
    v_svc := coalesce(p_service_id, v_svc);
  END IF;

  v_profil := CASE p_role
    WHEN 'dir_administrative' THEN 'SUPERUSER'
    WHEN 'directeur' THEN 'ADMIN'
    WHEN 'secretariat' THEN 'SECRETARIAT'
    WHEN 'chef_service' THEN 'CHEF'
    WHEN 'documentation_archives' THEN 'ARCHIVES'
    ELSE 'EXPLOIT'
  END;

  -- Compte GED déjà complet
  IF EXISTS (SELECT 1 FROM public.tb_profiles WHERE matr = v_matr)
     OR EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION 'Un compte GED existe déjà pour ce matricule';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public."TbLogin" WHERE "Matricule" = v_matr)
    INTO v_login_exists;

  IF v_login_exists THEN
    -- Réutiliser le login RH / métier déjà présent
    UPDATE public."TbLogin" SET
      "Nom_User" = coalesce(nullif(trim(p_nom_user), ''), split_part(v_full_name, ' ', 1), "Nom_User", v_matr),
      "Mot_Passe" = p_password,
      "Profil" = v_profil,
      "Privilege" = CASE
        WHEN p_role = 'dir_administrative' THEN 9
        WHEN p_role = 'directeur' THEN 5
        ELSE 1
      END,
      updated_at = now()
    WHERE "Matricule" = v_matr
    RETURNING "IdLogin" INTO v_login_id;
  ELSE
    INSERT INTO public."TbLogin" ("Nom_User", "Mot_Passe", "Profil", "Privilege", "Matricule")
    VALUES (
      coalesce(nullif(trim(p_nom_user), ''), split_part(v_full_name, ' ', 1), v_matr),
      p_password, v_profil,
      CASE WHEN p_role = 'dir_administrative' THEN 9 WHEN p_role = 'directeur' THEN 5 ELSE 1 END,
      v_matr
    ) RETURNING "IdLogin" INTO v_login_id;
  END IF;

  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN v_instance_id := '00000000-0000-0000-0000-000000000000'; END IF;

  v_user_id := gen_random_uuid();
  v_encrypted_pw := crypt(v_auth_password, gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    v_instance_id, v_user_id, 'authenticated', 'authenticated', v_email, v_encrypted_pw,
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_full_name, 'matr', v_matr, 'role', p_role::text),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', v_user_id::text, now(), now(), now()
  );

  -- Le trigger handle_new_user() crée déjà une ligne : on complète / corrige
  INSERT INTO public.tb_profiles (id, full_name, email, role, direction_id, service_id, matr)
  VALUES (v_user_id, v_full_name, v_email, p_role, v_dir, v_svc, v_matr)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    direction_id = EXCLUDED.direction_id,
    service_id = EXCLUDED.service_id,
    matr = EXCLUDED.matr,
    updated_at = now();

  UPDATE public.tb_profiles SET
    full_name = v_full_name,
    email = v_email,
    role = p_role,
    direction_id = v_dir,
    service_id = v_svc,
    matr = v_matr,
    updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'id', v_user_id, 'matr', v_matr, 'email', v_email,
    'full_name', v_full_name, 'role', p_role, 'login_id', v_login_id,
    'reused_login', v_login_exists
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ged_admin_create_account(text, text, text, public.app_role, uuid, uuid, text)
  TO authenticated;
