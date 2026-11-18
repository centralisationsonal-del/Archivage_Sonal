-- Entité / instance de provenance sur archives + agents strictement Actif

-- ---------------------------------------------------------------------------
-- Colonne entite sur tb_archives
-- ---------------------------------------------------------------------------
ALTER TABLE public.tb_archives
  ADD COLUMN IF NOT EXISTS entite TEXT;

CREATE INDEX IF NOT EXISTS idx_archives_entite
  ON public.tb_archives (entite)
  WHERE entite IS NOT NULL AND btrim(entite) <> '';

COMMENT ON COLUMN public.tb_archives.entite IS
  'Entité / instance de provenance du document (ex. Kinshasa, Katanga)';

-- Backfill depuis le personnel archiveur si connu
UPDATE public.tb_archives a
SET entite = NULLIF(btrim(p."Entite"), '')
FROM public."TbPersonnels" p
WHERE a.agent_archive_matr IS NOT NULL
  AND p."Matr" = a.agent_archive_matr
  AND (a.entite IS NULL OR btrim(a.entite) = '')
  AND NULLIF(btrim(p."Entite"), '') IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Vue agents : uniquement Actif = true (équivalent Actif = 1)
-- ---------------------------------------------------------------------------
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
WHERE COALESCE(p."Actif", false) IS TRUE;

-- ---------------------------------------------------------------------------
-- RPC agents : filtre Actif renforcé + filtre entite optionnel
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ged_list_agents(text, text);
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
  WHERE COALESCE(p."Actif", false) IS TRUE
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

-- Liste des entités distinctes (agents actifs)
CREATE OR REPLACE FUNCTION public.ged_list_entites()
RETURNS TABLE (entite text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT NULLIF(btrim(p."Entite"), '') AS entite
  FROM public."TbPersonnels" p
  WHERE COALESCE(p."Actif", false) IS TRUE
    AND NULLIF(btrim(p."Entite"), '') IS NOT NULL
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.ged_list_entites() TO authenticated;
