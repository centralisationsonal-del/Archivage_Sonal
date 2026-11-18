-- Boîte de demandes documentaires : tous → Documentation & Archives (privé)

CREATE TYPE public.demande_doc_status AS ENUM (
  'envoyee',
  'message_recu',
  'document_inexistant',
  'en_cours',
  'livree'
);

CREATE TABLE IF NOT EXISTS public.tb_demandes_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.tb_profiles(id) ON DELETE CASCADE,
  requester_matr VARCHAR(40),
  requester_name TEXT,
  message TEXT NOT NULL,
  reference_souhaitee VARCHAR(80),
  status public.demande_doc_status NOT NULL DEFAULT 'envoyee',
  signal_note TEXT,
  signal_at TIMESTAMPTZ,
  signal_by UUID REFERENCES public.tb_profiles(id),
  reply_file_path TEXT,
  reply_file_name TEXT,
  reply_note TEXT,
  replied_at TIMESTAMPTZ,
  replied_by UUID REFERENCES public.tb_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demandes_docs_requester
  ON public.tb_demandes_docs(requester_id);
CREATE INDEX IF NOT EXISTS idx_demandes_docs_status
  ON public.tb_demandes_docs(status);
CREATE INDEX IF NOT EXISTS idx_demandes_docs_created
  ON public.tb_demandes_docs(created_at DESC);

ALTER TABLE public.tb_demandes_docs ENABLE ROW LEVEL SECURITY;

-- Réactiver helper Archives si besoin
CREATE OR REPLACE FUNCTION public.is_documentation_archives()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tb_profiles
    WHERE id = auth.uid() AND role = 'documentation_archives'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_documentation_archives() TO authenticated;

-- SELECT : demandeur voit ses demandes ; Archives / Superuser / Contrôle voient tout
DROP POLICY IF EXISTS "demandes_docs_select" ON public.tb_demandes_docs;
CREATE POLICY "demandes_docs_select" ON public.tb_demandes_docs
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR public.is_documentation_archives()
    OR public.is_controle()
    OR requester_id = auth.uid()
  );

-- INSERT : uniquement pour soi (autres rôles ne lisent pas les demandes des collègues)
DROP POLICY IF EXISTS "demandes_docs_insert" ON public.tb_demandes_docs;
CREATE POLICY "demandes_docs_insert" ON public.tb_demandes_docs
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- UPDATE : Archives / Superuser (signaux + réponse) ; demandeur ne modifie pas le statut Archives
DROP POLICY IF EXISTS "demandes_docs_update" ON public.tb_demandes_docs;
CREATE POLICY "demandes_docs_update" ON public.tb_demandes_docs
  FOR UPDATE TO authenticated
  USING (
    public.is_dir_administrative()
    OR public.is_documentation_archives()
  );

COMMENT ON TABLE public.tb_demandes_docs IS
  'Demandes de documents adressées au service Documentation & Archives — lecture privée Archives.';
