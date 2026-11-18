SELECT COUNT(*) AS in_view FROM public.v_ged_agents;
SELECT COUNT(*) AS actifs_eq_true FROM public."TbPersonnels" WHERE "Actif" IS TRUE;
SELECT COUNT(*) AS actifs_eq_1 FROM public."TbPersonnels" WHERE "Actif"::text IN ('1','t','true');
SELECT COUNT(*) AS inactifs FROM public."TbPersonnels" WHERE "Actif" IS DISTINCT FROM TRUE AND "Actif"::text NOT IN ('1','t','true');
