SELECT
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'TbPersonnels'
  AND column_name = 'Actif';

SELECT
  "Actif"::text AS actif_val,
  COUNT(*) AS n
FROM public."TbPersonnels"
GROUP BY 1
ORDER BY n DESC
LIMIT 10;

SELECT DISTINCT TRIM("Entite") AS entite
FROM public."TbPersonnels"
WHERE "Entite" IS NOT NULL AND btrim("Entite") <> ''
ORDER BY 1
LIMIT 50;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tb_archives'
ORDER BY ordinal_position;

SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'ged_list_agents'
LIMIT 1;
