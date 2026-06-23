import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/backendDataApi';
import { normalizeOrgSlug } from '@/lib/tenantTicketsSupabase';

export type ClientNotificationEmail = {
  email: string;
  source: string;
};

export function useClientNotificationEmails(opts: {
  clientSlug: string | null | undefined;
  organisationId: string | null | undefined;
  enabled?: boolean;
}) {
  const slug = opts.clientSlug?.trim() ? normalizeOrgSlug(opts.clientSlug) : '';
  const organisationId = opts.organisationId?.trim() ?? '';
  const enabled = opts.enabled !== false && Boolean(slug);

  return useQuery({
    queryKey: ['client-notification-emails', slug, organisationId || null],
    enabled,
    queryFn: async (): Promise<ClientNotificationEmail[]> => {
      const params = new URLSearchParams();
      if (organisationId) params.set('organisationId', organisationId);
      const qs = params.toString();
      const res = await fetchJson<{ items: ClientNotificationEmail[] }>(
        `/data/clients/${encodeURIComponent(slug)}/notification-emails${qs ? `?${qs}` : ''}`
      );
      return res.items ?? [];
    },
  });
}
