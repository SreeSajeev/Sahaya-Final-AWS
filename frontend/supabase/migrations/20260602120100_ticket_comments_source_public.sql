-- Phase 6.0: Allow ticket_comments.source = PUBLIC for Phase 6.3 public intake attachments.
-- Additive CHECK only; no application code uses PUBLIC until Phase 6.3.
--
-- Rollback (only if no rows with source = PUBLIC):
--   ALTER TABLE public.ticket_comments DROP CONSTRAINT IF EXISTS ticket_comments_source_check;
--   ALTER TABLE public.ticket_comments ADD CONSTRAINT ticket_comments_source_check
--     CHECK (source IN ('EMAIL','FE','STAFF','SYSTEM'));

ALTER TABLE public.ticket_comments DROP CONSTRAINT IF EXISTS ticket_comments_source_check;

ALTER TABLE public.ticket_comments ADD CONSTRAINT ticket_comments_source_check
  CHECK (source IN ('EMAIL','FE','STAFF','SYSTEM','PUBLIC'));

COMMENT ON CONSTRAINT ticket_comments_source_check ON public.ticket_comments IS
  'Comment origin; PUBLIC reserved for public QR complaint intake (Phase 6.3+).';
