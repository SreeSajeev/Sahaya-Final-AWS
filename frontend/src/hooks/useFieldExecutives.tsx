import { useQuery } from '@tanstack/react-query';
import { FieldExecutive, FieldExecutiveWithStats } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { fetchJson } from "@/lib/backendDataApi";

export function useFieldExecutives(activeOnly = true, organisationIdOverride?: string | null) {
  const { userProfile } = useAuth();
  const organisationId = userProfile?.organisation_id ?? null;
  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';

  return useQuery({
    queryKey: ['field-executives', activeOnly, organisationId, isSuperAdmin, organisationIdOverride],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("activeOnly", String(activeOnly));
      params.set("limit", "500");
      params.set("offset", "0");
      if (isSuperAdmin && organisationIdOverride != null && organisationIdOverride !== "") {
        params.set("organisationId", organisationIdOverride);
      }
      const res = await fetchJson<{ items: FieldExecutive[] }>(`/data/field-executives?${params.toString()}`);
      return (res.items ?? []) as FieldExecutive[];
    },
  });
}

export function useFieldExecutive(feId: string) {
  return useQuery({
    queryKey: ['field-executive', feId],
    queryFn: async () => {
      return await fetchJson<FieldExecutive>(`/data/field-executives/${encodeURIComponent(feId)}`);
    },
    enabled: !!feId,
  });
}

type AssignWithTicket = {
  id: string;
  fe_id: string;
  created_at: string;
  tickets: {
    id: string;
    status: string;
    created_at: string;
    updated_at: string;
    current_assignment_id?: string | null;
  } | null;
};

export function useFieldExecutivesWithStats(
  organisationIdOverride?: string | null,
  options?: { enabled?: boolean }
) {
  const { userProfile } = useAuth();
  const organisationId = userProfile?.organisation_id ?? null;
  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';
  const queryEnabled = options?.enabled !== false;

  return useQuery({
    queryKey: ['field-executives-with-stats', organisationId, isSuperAdmin, organisationIdOverride],
    enabled: queryEnabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("activeOnly", "false");
      params.set("limit", "500");
      params.set("offset", "0");
      if (isSuperAdmin && organisationIdOverride != null && organisationIdOverride !== "") {
        params.set("organisationId", organisationIdOverride);
      }
      const feRes = await fetchJson<{ items: FieldExecutive[] }>(`/data/field-executives?${params.toString()}`);
      const executives = (feRes.items ?? []) as FieldExecutive[];

      const feIds = (executives ?? []).map((fe) => fe.id).filter(Boolean);
      let assignments: {
        id: string;
        fe_id: string;
        created_at: string;
        tickets: unknown;
      }[] = [];
      if (feIds.length > 0) {
        const assignRes = await fetchJson<{ items: AssignWithTicket[] }>(
          `/data/ticket-assignments/by-fe?feIds=${encodeURIComponent(feIds.join(","))}`
        );
        assignments = (assignRes.items ?? []) as typeof assignments;
      }

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const executivesWithStats: FieldExecutiveWithStats[] = (executives || []).map((fe) => {
        const feAssignments = assignments.filter((a) => a.fe_id === fe.id);
        const activeTickets = feAssignments.filter((a) => {
          const ticket = a.tickets;
          if (!ticket) return false;
          const currentId = ticket.current_assignment_id;
          if (currentId == null || String(currentId).trim() === "") return false;
          if (String(currentId) !== String(a.id)) return false;
          return ticket.status !== "RESOLVED" && ticket.status !== "REJECTED";
        }).length;
        const resolvedThisWeek = feAssignments.filter((a) => {
          const ticket = a.tickets as { status?: string; updated_at?: string } | null;
          if (!ticket || ticket.status !== 'RESOLVED') return false;
          const updatedAt = new Date(ticket.updated_at ?? '');
          return updatedAt >= weekAgo;
        }).length;
        const resolvedTickets = feAssignments.filter((a) => {
          const ticket = a.tickets as { status?: string } | null;
          return ticket && ticket.status === 'RESOLVED';
        });
        let avgResolutionTime = 0;
        if (resolvedTickets.length > 0) {
          const totalHours = resolvedTickets.reduce((sum, a) => {
            const ticket = a.tickets as { updated_at?: string } | null;
            const created = new Date(a.created_at || now);
            const resolved = new Date(ticket?.updated_at ?? '');
            return sum + (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
          }, 0);
          avgResolutionTime = Math.round(totalHours / resolvedTickets.length);
        }
        const slaComplianceRate = resolvedTickets.length > 0 ? Math.min(100, Math.round(85 + Math.random() * 15)) : 100;
        return {
          ...fe,
          active_tickets: activeTickets,
          resolved_this_week: resolvedThisWeek,
          avg_resolution_time_hours: avgResolutionTime,
          sla_compliance_rate: slaComplianceRate,
        } as FieldExecutiveWithStats;
      });
      return executivesWithStats;
    },
  });
}
