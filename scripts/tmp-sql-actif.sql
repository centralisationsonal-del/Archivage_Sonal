SELECT "Actif"::text AS actif_val, COUNT(*) AS n
FROM public."TbPersonnels"
GROUP BY 1
ORDER BY n DESC;

SELECT COUNT(*) AS in_view FROM public.v_ged_agents;

SELECT pg_get_viewdef('public.v_ged_agents'::regclass, true);
