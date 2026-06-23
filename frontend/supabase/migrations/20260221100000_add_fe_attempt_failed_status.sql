-- Add FE_ATTEMPT_FAILED to allowed ticket statuses (multi-attempt resolution)
ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_status_check CHECK (
    status IN (
      'OPEN',
      'NEEDS_REVIEW',
      'ASSIGNED',
      'EN_ROUTE',
      'ON_SITE',
      'RESOLVED_PENDING_VERIFICATION',
      'RESOLVED',
      'REOPENED',
      'FE_ATTEMPT_FAILED'
    )
  );
