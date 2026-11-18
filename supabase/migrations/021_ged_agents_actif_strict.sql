-- Renforcer le filtre Actif = true / 1 sur la vue et le RPC agents

DROP VIEW IF EXISTS public.v_ged_agents;

CREATE VIEW public.v_ged_agents AS
SELECT
  p."Matr" AS matr,
  TRIM(CONCAT_WS(' ', p."Nom", p."Postnom", p."Prenom")) AS full_name,
  p."Email" AS email,
  p."Phone" AS phone,
  p."Direct" AS direction_libelle,
  p."Service" AS service_libelle,
  p."Fonct_Agt" AS fonction,
  p."Grade_Act" AS grade,
  NULLIF(btrim(p."Entite"::text), '')::varchar(25) AS entite,
  p."Actif" AS actif,
  d.id AS direction_id,
  s.id AS service_id
FROM public."TbPersonnels" p
LEFT JOIN public.tb_directions d ON d.libelle = p."Direct"
LEFT JOIN public.tb_services s ON s.direction_id = d.id AND s.libelle = p."Service"
WHERE p."Actif" IS TRUE
   OR p."Actif"::text IN ('1', 't', 'true');

DROP FUNCTION IF EXISTS public.ged_list_agents(text, text, text);

CREATE OR REPLACE FUNCTION public.ged_list_agents(
  p_direction text DEFAULT NULL,
  p_service text DEFAULT NULL,
  p_entite text DEFAULT NULL
)
RETURNS TABLE (
  matr character varying,
  full_name text,
  email character varying,
  phone character varying,
  direction_libelle character varying,
  service_libelle character varying,
  fonction character varying,
  grade character varying,
  entite character varying,
  actif boolean,
  direction_id uuid,
  service_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.matr,
    a.full_name,
    a.email,
    a.phone,
    a.direction_libelle,
    a.service_libelle,
    a.fonction,
    a.grade,
    a.entite,
    a.actif,
    a.direction_id,
    a.service_id
  FROM public.v_ged_agents a
  INNER JOIN public."TbPersonnels" p ON p."Matr" = a.matr
  WHERE (p."Actif" IS TRUE OR p."Actif"::text IN ('1', 't', 'true'))
    AND (
      p_direction IS NULL
      OR a.direction_libelle = p_direction
      OR a.direction_id::text = p_direction
    )
    AND (
      p_service IS NULL
      OR a.service_libelle = p_service
      OR a.service_id::text = p_service
    )
    AND (
      p_entite IS NULL
      OR btrim(p_entite) = ''
      OR lower(btrim(COALESCE(a.entite, ''))) = lower(btrim(p_entite))
    )
  ORDER BY a.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.ged_list_agents(text, text, text) TO authenticated;
