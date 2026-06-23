-- Phase 6.0: Idempotency foundation for public complaint submit (Phase 6.1).
-- One submission row per OTP session; enables safe replay of POST /public/submit-complaint.
-- No RPC, routes, or application code in this migration.
--
-- Pre-apply check (service role; should return 0 rows):
--   SELECT otp_session_id, COUNT(*) AS n
--   FROM public.public_complaint_submissions
--   GROUP BY otp_session_id
--   HAVING COUNT(*) > 1;
--
-- Rollback (only if table empty or duplicates resolved):
--   ALTER TABLE public.public_complaint_submissions
--     DROP CONSTRAINT IF EXISTS public_complaint_submissions_otp_session_id_key;

ALTER TABLE public.public_complaint_submissions
  ADD CONSTRAINT public_complaint_submissions_otp_session_id_key UNIQUE (otp_session_id);

COMMENT ON CONSTRAINT public_complaint_submissions_otp_session_id_key
  ON public.public_complaint_submissions IS
  'Phase 6.1 submit idempotency: at most one submission per verified OTP session.';
