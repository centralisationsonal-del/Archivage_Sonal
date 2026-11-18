ALTER TABLE public.tb_demandes_docs
  ADD COLUMN IF NOT EXISTS recipient_id UUID
    REFERENCES public.tb_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_demandes_docs_recipient
  ON public.tb_demandes_docs(recipient_id, created_at DESC);

DROP POLICY IF EXISTS "demandes_docs_select" ON public.tb_demandes_docs;
CREATE POLICY "demandes_docs_select" ON public.tb_demandes_docs
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR requester_id = auth.uid()
    OR recipient_id = auth.uid()
    OR (recipient_id IS NULL AND public.is_documentation_archives())
  );

DROP POLICY IF EXISTS "demandes_docs_insert" ON public.tb_demandes_docs;
CREATE POLICY "demandes_docs_insert" ON public.tb_demandes_docs
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND recipient_id IS NOT NULL
    AND recipient_id <> auth.uid()
  );

DROP POLICY IF EXISTS "demandes_docs_update" ON public.tb_demandes_docs;
CREATE POLICY "demandes_docs_update" ON public.tb_demandes_docs
  FOR UPDATE TO authenticated
  USING (
    public.is_dir_administrative()
    OR recipient_id = auth.uid()
    OR (recipient_id IS NULL AND public.is_documentation_archives())
  )
  WITH CHECK (
    public.is_dir_administrative()
    OR recipient_id = auth.uid()
    OR (recipient_id IS NULL AND public.is_documentation_archives())
  );

CREATE TABLE IF NOT EXISTS public.tb_ged_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.tb_profiles(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.tb_profiles(id) ON DELETE CASCADE,
  subject TEXT,
  message TEXT NOT NULL,
  attachment_path TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ged_messages_recipient_check
    CHECK (recipient_id IS NULL OR recipient_id <> sender_id),
  CONSTRAINT ged_messages_broadcast_subject_check
    CHECK (recipient_id IS NOT NULL OR subject IS NOT NULL OR length(btrim(message)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_ged_messages_sender
  ON public.tb_ged_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ged_messages_recipient
  ON public.tb_ged_messages(recipient_id, created_at DESC);

ALTER TABLE public.tb_ged_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ged_messages_select" ON public.tb_ged_messages;
CREATE POLICY "ged_messages_select" ON public.tb_ged_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR recipient_id = auth.uid()
    OR recipient_id IS NULL
  );

DROP POLICY IF EXISTS "ged_messages_insert" ON public.tb_ged_messages;
CREATE POLICY "ged_messages_insert" ON public.tb_ged_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (recipient_id IS NOT NULL AND recipient_id <> auth.uid())
      OR (recipient_id IS NULL AND public.is_dir_administrative())
    )
  );

GRANT SELECT, INSERT ON public.tb_ged_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tb_demandes_docs TO authenticated;

CREATE OR REPLACE FUNCTION public.ged_profile_activity_stats(p_profile_id UUID)
RETURNS TABLE (
  archived BIGINT,
  sent BIGINT,
  requested BIGINT,
  unanswered BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_profile_id IS NULL
     OR auth.uid() IS NULL
     OR (p_profile_id <> auth.uid() AND NOT public.is_dir_administrative()) THEN
    RAISE EXCEPTION 'Accès interdit aux statistiques de ce profil';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.tb_archives a
      WHERE a.agent_archive_id = p_profile_id),
    (SELECT count(*) FROM public.tb_circulations c
      WHERE c.sender_id = p_profile_id)
      + (SELECT count(*) FROM public.tb_ged_messages m
        WHERE m.sender_id = p_profile_id AND m.attachment_path IS NOT NULL),
    (SELECT count(*) FROM public.tb_demandes_docs d
      WHERE d.requester_id = p_profile_id),
    (SELECT count(*) FROM public.tb_demandes_docs d
      WHERE d.requester_id = p_profile_id AND d.status = 'envoyee');
END;
$$;

REVOKE ALL ON FUNCTION public.ged_profile_activity_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ged_profile_activity_stats(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_see_invisible_archive()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_dir_administrative();
$$;

DROP POLICY IF EXISTS "archives_select_involved" ON public.tb_archives;
CREATE POLICY "archives_select_involved" ON public.tb_archives
  FOR SELECT TO authenticated
  USING (
    (
      invisible_tous = true
      AND (
        public.is_dir_administrative()
        OR agent_archive_id = auth.uid()
      )
    )
    OR (
      invisible_tous = false
      AND (
        public.is_dir_administrative()
        OR agent_archive_id = auth.uid()
        OR (
          owner_scope = 'secretariat'
          AND owner_direction_id = (
            SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid()
          )
          AND (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
        )
        OR EXISTS (
          SELECT 1
          FROM public.tb_circulations c
          WHERE c.archive_id = tb_archives.id
            AND (
              c.sender_id = auth.uid()
              OR c.receiver_id = auth.uid()
              OR c.handler_id = auth.uid()
              OR c.approver_id = auth.uid()
              OR auth.uid() = ANY (c.cc_users)
              OR c.receiver_matr = (
                SELECT matr FROM public.tb_profiles WHERE id = auth.uid()
              )
              OR c.sender_matr = (
                SELECT matr FROM public.tb_profiles WHERE id = auth.uid()
              )
              OR c.approver_matr = (
                SELECT matr FROM public.tb_profiles WHERE id = auth.uid()
              )
              OR (SELECT matr FROM public.tb_profiles WHERE id = auth.uid()) = ANY (c.cc_matrs)
              OR (
                (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
                AND (
                  c.sender_direction_id = (
                    SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid()
                  )
                  OR c.receiver_direction_id = (
                    SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid()
                  )
                )
                AND (
                  c.status = 'en_attente_orientation'
                  OR (
                    c.receiver_matr IS NULL
                    AND c.parcours_type IN ('P1', 'P3', 'P4', 'BROADCAST')
                  )
                )
                AND (c.handler_id IS NULL OR c.handler_id = auth.uid())
              )
              OR (
                public.is_documentation_archives()
                AND (c.sender_id = auth.uid() OR c.receiver_id = auth.uid())
              )
            )
        )
      )
    )
  );

DROP POLICY IF EXISTS "circulations_select" ON public.tb_circulations;
CREATE POLICY "circulations_select" ON public.tb_circulations
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR handler_id = auth.uid()
    OR approver_id = auth.uid()
    OR auth.uid() = ANY (cc_users)
    OR receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR sender_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR approver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR (SELECT matr FROM public.tb_profiles WHERE id = auth.uid()) = ANY (cc_matrs)
    OR (
      public.is_secretariat_role()
      AND public.current_secretariat_code() IS NOT NULL
      AND secretariat_desk = public.current_secretariat_code()
    )
    OR (
      public.is_secretariat_role()
      AND public.current_secretariat_code() IS NULL
      AND (
        sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
        OR receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
      )
      AND (
        status = 'en_attente_orientation'
        OR (receiver_matr IS NULL AND parcours_type IN ('P1', 'P3', 'P4', 'BROADCAST'))
      )
      AND (handler_id IS NULL OR handler_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "events_select" ON public.tb_circulation_events;
CREATE POLICY "events_select" ON public.tb_circulation_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tb_circulations c
      WHERE c.id = circulation_id
        AND (
          public.is_dir_administrative()
          OR c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR c.handler_id = auth.uid()
          OR c.approver_id = auth.uid()
          OR auth.uid() = ANY (c.cc_users)
          OR c.receiver_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
          OR c.sender_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
          OR (SELECT matr FROM public.tb_profiles WHERE id = auth.uid()) = ANY (c.cc_matrs)
          OR (
            (SELECT role FROM public.tb_profiles WHERE id = auth.uid()) = 'secretariat'
            AND (
              c.sender_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
              OR c.receiver_direction_id = (SELECT direction_id FROM public.tb_profiles WHERE id = auth.uid())
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "aval_etapes_select" ON public.tb_aval_etapes;
CREATE POLICY "aval_etapes_select" ON public.tb_aval_etapes
  FOR SELECT TO authenticated
  USING (
    public.is_dir_administrative()
    OR required_profile_id = auth.uid()
    OR required_matr = (SELECT matr FROM public.tb_profiles WHERE id = auth.uid())
    OR actor_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tb_circulations c
      WHERE c.id = circulation_id
        AND (
          c.sender_id = auth.uid()
          OR c.receiver_id = auth.uid()
          OR c.approver_id = auth.uid()
          OR c.handler_id = auth.uid()
          OR auth.uid() = ANY (c.cc_users)
        )
    )
  );

DROP POLICY IF EXISTS "archives_storage_select" ON storage.objects;
CREATE POLICY "archives_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'archives'
    AND (
      public.is_dir_administrative()
      OR EXISTS (
        SELECT 1
        FROM public.tb_archives a
        WHERE a.file_path = storage.objects.name
      )
      OR EXISTS (
        SELECT 1
        FROM public.tb_demandes_docs d
        WHERE d.reply_file_path = storage.objects.name
          AND (
            d.requester_id = auth.uid()
            OR d.recipient_id = auth.uid()
            OR (
              d.recipient_id IS NULL
              AND public.is_documentation_archives()
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.tb_ged_messages m
        WHERE m.attachment_path = storage.objects.name
          AND (
            m.sender_id = auth.uid()
            OR m.recipient_id = auth.uid()
            OR m.recipient_id IS NULL
          )
      )
    )
  );
