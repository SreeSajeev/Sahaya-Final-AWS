-- UI-level restoration: make "Hitachi" appear in SuperAdmin organisations list.
-- No ticket/user updates. No organisation_id changes. No filtering or workflow changes.

-- Step 1 & 2: Insert Hitachi only if it does not already exist
INSERT INTO public.organisations (id, name, slug, status)
SELECT gen_random_uuid(), 'Hitachi', 'hitachi', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.organisations
  WHERE name = 'Hitachi' OR slug = 'hitachi'
);
