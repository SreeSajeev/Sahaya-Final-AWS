-- Rollback for 20260611141000_audit_logs_tenant_isolation.sql

DROP POLICY IF EXISTS audit_logs_tenant_read ON public.audit_logs;

CREATE POLICY "Staff can view audit logs" ON public.audit_logs
FOR SELECT TO authenticated
USING (public.is_staff_or_above(auth.uid()));
