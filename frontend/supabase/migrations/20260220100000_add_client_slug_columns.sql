-- Minimal client isolation: add client_slug to tickets and users.
-- No constraints, no RLS, no policy changes.

ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS client_slug TEXT;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS client_slug TEXT;
