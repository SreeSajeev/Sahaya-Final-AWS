-- Additive priority_level (LOW / MEDIUM / HIGH) alongside legacy boolean priority.
-- priority_level is source of truth; priority boolean is derived for backward compatibility.
-- Rollback: DROP TRIGGER ...; DROP FUNCTION ...; ALTER TABLE tickets DROP COLUMN priority_level;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS priority_level text;

UPDATE public.tickets
SET priority_level = CASE WHEN priority = true THEN 'HIGH' ELSE 'LOW' END
WHERE priority_level IS NULL;

ALTER TABLE public.tickets
  ALTER COLUMN priority_level SET DEFAULT 'MEDIUM',
  ALTER COLUMN priority_level SET NOT NULL;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_priority_level_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_priority_level_check
  CHECK (priority_level IN ('LOW', 'MEDIUM', 'HIGH'));

COMMENT ON COLUMN public.tickets.priority_level IS
  'Ticket priority level (LOW, MEDIUM, HIGH). Source of truth; legacy priority boolean is derived.';

-- Keep priority boolean in sync when either column is written (RPC, direct SQL, legacy API).
CREATE OR REPLACE FUNCTION public.sync_ticket_priority_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.priority_level IS DISTINCT FROM OLD.priority_level THEN
      NEW.priority := (NEW.priority_level = 'HIGH');
    ELSIF NEW.priority IS DISTINCT FROM OLD.priority THEN
      NEW.priority_level := CASE WHEN NEW.priority THEN 'HIGH' ELSE 'LOW' END;
    ELSE
      NEW.priority := (NEW.priority_level = 'HIGH');
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  IF NEW.priority_level IS NOT NULL THEN
    NEW.priority := (NEW.priority_level = 'HIGH');
  ELSIF NEW.priority IS NOT NULL THEN
    NEW.priority_level := CASE WHEN NEW.priority THEN 'HIGH' ELSE 'LOW' END;
  ELSE
    NEW.priority_level := 'MEDIUM';
    NEW.priority := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ticket_priority_fields ON public.tickets;

CREATE TRIGGER trg_sync_ticket_priority_fields
  BEFORE INSERT OR UPDATE OF priority, priority_level
  ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ticket_priority_fields();
