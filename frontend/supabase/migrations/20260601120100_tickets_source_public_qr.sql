-- Phase 1: Extend tickets.source for PUBLIC_QR intake (and MANUAL used in production).
-- Additive constraint only; does not change ticket lifecycle or existing rows with allowed sources.
-- Rollback: see 20260601120100 rollback in Phase 1 runbook.

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_source_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_source_check
  CHECK (source IN ('EMAIL','FE','STAFF','SYSTEM','MANUAL','PUBLIC_QR'));
