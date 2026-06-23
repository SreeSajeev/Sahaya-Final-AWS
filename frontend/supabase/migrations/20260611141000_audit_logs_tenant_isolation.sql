-- HIGH-15: Tenant-scoped audit_logs SELECT (mirrors tickets_tenant_read pattern).
-- Rollback: 20260611141000_audit_logs_tenant_isolation_rollback.sql

DROP POLICY IF EXISTS "Staff can view audit logs" ON public.audit_logs;

CREATE POLICY audit_logs_tenant_read ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  public.is_super_admin_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.auth_id = auth.uid()
      AND COALESCE(u.active, true)
      AND u.organisation_id IS NOT NULL
      AND audit_logs.organisation_id IS NOT NULL
      AND u.organisation_id = audit_logs.organisation_id
  )
);

COMMENT ON POLICY audit_logs_tenant_read ON public.audit_logs IS
  'SUPER_ADMIN sees all audit rows; tenant staff/admin see organisation_id match only.';
