-- =============================================================================
-- Agenda du Chef — nettoyage / enrichissement TbAgenda_Chef + RLS Sec_*
-- =============================================================================

-- Séquence IdAgenda
CREATE SEQUENCE IF NOT EXISTS public."TbAgenda_Chef_IdAgenda_seq";
SELECT setval(
  'public."TbAgenda_Chef_IdAgenda_seq"',
  GREATEST(COALESCE((SELECT MAX("IdAgenda") FROM public."TbAgenda_Chef"), 0), 1),
  true
);
ALTER TABLE public."TbAgenda_Chef"
  ALTER COLUMN "IdAgenda" SET DEFAULT nextval('public."TbAgenda_Chef_IdAgenda_seq"');
ALTER SEQUENCE public."TbAgenda_Chef_IdAgenda_seq" OWNED BY public."TbAgenda_Chef"."IdAgenda";

-- Supprimer champ inutile (compteur UI, non métier)
ALTER TABLE public."TbAgenda_Chef" DROP COLUMN IF EXISTS "Activite";

-- Champs utiles
ALTER TABLE public."TbAgenda_Chef"
  ADD COLUMN IF NOT EXISTS secretariat_code TEXT
    REFERENCES public.tb_secretariat_desks(code),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.tb_profiles(id),
  ADD COLUMN IF NOT EXISTS chef_whatsapp VARCHAR(20),
  ADD COLUMN IF NOT EXISTS chef_email VARCHAR(120),
  ADD COLUMN IF NOT EXISTS type_evenement VARCHAR(30) DEFAULT 'rendez_vous',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Élargir quelques colonnes trop courtes pour un usage réel
ALTER TABLE public."TbAgenda_Chef"
  ALTER COLUMN "Pers_Sollicitee" TYPE VARCHAR(80),
  ALTER COLUMN "Organis_Service" TYPE VARCHAR(80),
  ALTER COLUMN "Operateur" TYPE VARCHAR(60),
  ALTER COLUMN "Nom_Chef" TYPE VARCHAR(80),
  ALTER COLUMN "Avis_Chef" TYPE VARCHAR(30),
  ALTER COLUMN "Lien_Visio" TYPE VARCHAR(255),
  ALTER COLUMN "Couleur_Objet" TYPE VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_agenda_chef_desk
  ON public."TbAgenda_Chef" (secretariat_code);
CREATE INDEX IF NOT EXISTS idx_agenda_chef_dates
  ON public."TbAgenda_Chef" ("Date_RDV" DESC NULLS LAST, "Heure_RDV" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_agenda_chef_entite
  ON public."TbAgenda_Chef" ("Entite");

COMMENT ON TABLE public."TbAgenda_Chef" IS
  'Agenda électronique du Chef — audiences, réunions, rendez-vous (par bureau Sec_*)';

-- RLS
ALTER TABLE public."TbAgenda_Chef" ENABLE ROW LEVEL SECURITY;

-- Policies définitives dans 025_ged_agenda_chef_isolation.sql
-- (isolement par profil created_by ; Superuser seul en transverse)

-- Valeurs distinctes pour combos (lecture authentifiée via table)
GRANT SELECT, INSERT, UPDATE, DELETE ON public."TbAgenda_Chef" TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public."TbAgenda_Chef_IdAgenda_seq" TO authenticated;
