SELECT "Matr",
       TRIM(CONCAT_WS(' ', "Nom", "Postnom", "Prenom")) AS nom,
       "Actif"
FROM public."TbPersonnels"
WHERE "Nom" ILIKE '%Assani%'
   OR "Postnom" ILIKE '%Assani%'
   OR "Prenom" ILIKE '%Assani%'
   OR "Nom" ILIKE '%Django%'
LIMIT 20;
