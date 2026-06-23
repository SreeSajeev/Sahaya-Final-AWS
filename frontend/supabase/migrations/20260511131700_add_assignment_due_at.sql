-- Add staff-selected assignment deadline to ticket assignments.
-- This is independent of SLA calculation, but can be used to override SLA assignment_deadline.

ALTER TABLE public.ticket_assignments
  ADD COLUMN IF NOT EXISTS assignment_due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ticket_assignments_assignment_due_at
  ON public.ticket_assignments (assignment_due_at)
  WHERE assignment_due_at IS NOT NULL;

