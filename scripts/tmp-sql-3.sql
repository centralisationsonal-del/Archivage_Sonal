SELECT DISTINCT TRIM("Entite") AS entite, COUNT(*) AS n
FROM public."TbPersonnels"
WHERE "Entite" IS NOT NULL AND btrim("Entite") <> ''
GROUP BY 1
ORDER BY n DESC
LIMIT 50;
