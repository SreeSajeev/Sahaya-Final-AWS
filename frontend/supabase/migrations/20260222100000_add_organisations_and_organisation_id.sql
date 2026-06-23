-- Phase 1: Organisations table (minimal)
CREATE TABLE IF NOT EXISTS public.organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended'))
);

-- Phase 2: Link users to organisation
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

-- Phase 3: Link tickets to organisation
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

-- Phase 4: Link field_executives to organisation
ALTER TABLE public.field_executives
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES public.organisations(id);

-- Backfill: create default organisation and assign existing data
INSERT INTO public.organisations (id, name, slug, status)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Default',
  'default',
  'active'
)
ON CONFLICT (slug) DO NOTHING;

-- Backfill users: SUPER_ADMIN stays NULL; others get default org
UPDATE public.users
SET organisation_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organisation_id IS NULL
  AND role != 'SUPER_ADMIN';

-- Backfill tickets
UPDATE public.tickets
SET organisation_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organisation_id IS NULL;

-- Backfill field_executives
UPDATE public.field_executives
SET organisation_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organisation_id IS NULL;

-- Optional: add NOT NULL after backfill (uncomment when ready)
-- ALTER TABLE public.tickets ALTER COLUMN organisation_id SET NOT NULL;
-- ALTER TABLE public.field_executives ALTER COLUMN organisation_id SET NOT NULL;
