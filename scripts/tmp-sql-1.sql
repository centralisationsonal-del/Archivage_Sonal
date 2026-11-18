SELECT COUNT(*) FILTER (WHERE "Actif" IS TRUE) AS actifs,
       COUNT(*) FILTER (WHERE "Actif" IS NOT TRUE) AS inactifs
FROM public."TbPersonnels";

SELECT COUNT(*) AS vue FROM public.v_ged_agents;

SELECT a.matr, a.full_name, a.actif
FROM public.ged_list_agents(NULL, NULL, NULL) a
WHERE a.full_name ILIKE '%Assani%' OR a.full_name ILIKE '%Django%'
LIMIT 10;
