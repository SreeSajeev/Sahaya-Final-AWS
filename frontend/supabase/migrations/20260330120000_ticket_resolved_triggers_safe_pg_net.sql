-- Ticket status → RESOLVED fires triggers that call net.http_post (pg_net).
-- If pg_net is not enabled, schema "net" does not exist and the UPDATE fails with SQLSTATE 3F000,
-- blocking Verify & Close and any other path that sets status to RESOLVED.
--
-- 1) Optional: enable pg_net in Supabase (Dashboard → Database → Extensions → pg_net), or:
--    CREATE EXTENSION IF NOT EXISTS pg_net;
--    (Omit from this file so migrations do not fail on projects where extension creation is restricted.)
-- 2) These functions use dynamic SQL + EXCEPTION so a missing "net" schema or HTTP failure does not roll back the ticket UPDATE.

CREATE OR REPLACE FUNCTION public.notify_ticket_resolved() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tid uuid := new.id;
BEGIN
  IF old.status IS DISTINCT FROM 'RESOLVED' AND new.status = 'RESOLVED' THEN
    BEGIN
      -- Dynamic SQL: net.http_post is resolved at runtime so CREATE FUNCTION works even if pg_net was absent before.
      EXECUTE $q$
        SELECT net.http_post(
          url := 'https://pariskq-crm-backend.onrender.com/internal/ticket-resolved',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-secret', 'pariskq_ticket_resolved_2026_secret'
          ),
          body := jsonb_build_object('ticket_id', $1::uuid)
        )
      $q$ USING tid;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_ticket_resolved: skipped (%) %', SQLSTATE, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_backend_ticket_resolved() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tid uuid := new.id;
  secret text;
BEGIN
  IF old.status IS DISTINCT FROM 'RESOLVED' AND new.status = 'RESOLVED' THEN
    BEGIN
      BEGIN
        SELECT ds.decrypted_secret INTO secret
        FROM vault.decrypted_secrets ds
        WHERE ds.name = 'internal_trigger_secret'
        LIMIT 1;
      EXCEPTION WHEN OTHERS THEN
        secret := NULL;
      END;

      EXECUTE $q$
        SELECT net.http_post(
          url := 'https://pariskq-crm-backend.onrender.com/internal/ticket-resolved',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-secret', COALESCE($1::text, 'pariskq_ticket_resolved_2026_secret')
          ),
          body := jsonb_build_object('ticket_id', $2::uuid)
        )
      $q$ USING secret, tid;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_backend_ticket_resolved: skipped (%) %', SQLSTATE, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
