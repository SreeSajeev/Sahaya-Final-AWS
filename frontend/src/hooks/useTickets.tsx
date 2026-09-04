import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ticket, TicketFilters, TicketStatus } from "@/lib/types";
import { resolveTicketPriorityLevel, booleanFromPriorityLevel } from '@/lib/priority';
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { fetchJson } from "@/lib/backendDataApi";
import { fetchWorkspaceTicketsList } from "@/lib/tenantTicketsSupabase";
import { canRoleBulkAssign, isBulkAssignFeatureEnabled } from "@/lib/bulkAssignFeature";
const DEFAULT_TICKETS_MAX_ROWS = 1000;

/** Backend POST /tickets/:id/assign notification summary */
export type AssignmentNotifyChannel = {
  success: boolean;
  error: string | null;
};

export type AssignmentNotificationsPayload = {
  email: AssignmentNotifyChannel;
  sms: AssignmentNotifyChannel;
};

export type AssignTicketResponse = {
  success?: boolean;
  token?: string;
  onSiteToken?: string;
  resolutionToken?: string;
  notifications?: AssignmentNotificationsPayload;
};

function toastAssignmentNotifications(n?: AssignmentNotificationsPayload | null) {
  if (!n) {
    toast({
      title: "Ticket assigned",
      description: "Assignment saved. Notification status was not returned (update backend).",
    });
    return;
  }

  if (n.email.success) {
    toast({
      title: "Assignment email sent",
      description: "The field executive was emailed with on-site and resolution links.",
    });
  } else if (n.email.error) {
    const skipped = n.email.error.toLowerCase().includes("skipped");
    toast({
      variant: skipped ? "default" : "destructive",
      title: skipped ? "Assignment email skipped" : "Assignment email not sent",
      description: n.email.error,
    });
  }

  if (n.sms.success) {
    toast({
      title: "Assignment SMS sent",
      description: "An SMS was sent to the field executive's mobile number.",
    });
  } else if (n.sms.error) {
    const smsErr = (n.sms.error ?? "").toLowerCase();
    const skipped =
      smsErr.includes("skipped") ||
      smsErr.includes("sms is disabled") ||
      smsErr.includes("sms test mode") ||
      smsErr.includes("not configured");
    toast({
      variant: skipped ? "default" : "destructive",
      title: skipped ? "Assignment SMS skipped" : "Assignment SMS failed",
      description: n.sms.error,
    });
  }
}

/* =====================================================
   Tickets list (Supabase + RLS). All tenant roles scoped by organisation_id
   (and client_slug where applicable); SUPER_ADMIN: optional org filter.
===================================================== */
export function useTickets(
  filters?: TicketFilters,
  options?: { maxRows?: number }
) {
  const maxRows = options?.maxRows ?? DEFAULT_TICKETS_MAX_ROWS;
  const { userProfile, session } = useAuth();
  const organisationId = userProfile?.organisation_id ?? null;
  const isSuperAdmin = userProfile?.role === "SUPER_ADMIN";

  return useQuery({
    queryKey: [
      "tickets",
      session?.user?.id,
      filters,
      organisationId,
      isSuperAdmin,
      userProfile?.role,
      filters?.scopeAllOrganisations,
      filters?.organisationId,
      maxRows,
    ],
    enabled: Boolean(userProfile?.id && session?.access_token),
    queryFn: async () => {
      return fetchWorkspaceTicketsList({
        maxRows,
        organisationId,
        isSuperAdmin,
        role: userProfile?.role,
        filters: filters ?? {},
      });
    },
  });
}

/* =====================================================
   Single ticket
===================================================== */
export function useTicket(ticketId: string) {
  return useQuery({
    queryKey: ["ticket", ticketId],
    enabled: Boolean(ticketId),
    queryFn: async () => {
      return await fetchJson<Ticket>(`/data/tickets/${encodeURIComponent(ticketId)}`);
    },
  });
}

/* =====================================================
   Ticket comments
===================================================== */
export function useTicketComments(ticketId: string) {
  return useQuery({
    queryKey: ["ticket-comments", ticketId],
    enabled: Boolean(ticketId),
    queryFn: async () => {
      const res = await fetchJson<{ items: unknown[] }>(
        `/data/tickets/${encodeURIComponent(ticketId)}/comments?limit=500&offset=0`
      );
      return res.items ?? [];
    },
  });
}

/* =====================================================
   Ticket assignments
===================================================== */
export function useTicketAssignments(ticketId: string) {
  return useQuery({
    queryKey: ["ticket-assignments", ticketId],
    enabled: Boolean(ticketId),
    queryFn: async () => {
      const res = await fetchJson<{ items: unknown[] }>(
        `/data/tickets/${encodeURIComponent(ticketId)}/assignments?limit=300&offset=0`
      );
      return res.items ?? [];
    },
  });
}

/* =====================================================
   Update ticket (generic)
===================================================== */
export function useUpdateTicket() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      ticketId,
      updates,
    }: {
      ticketId: string;
      updates: Partial<Ticket>;
    }) => {
      if (userProfile?.role === "CLIENT") {
        throw new Error("Not allowed for client");
      }
      if (
        Object.prototype.hasOwnProperty.call(updates, "client_slug") &&
        userProfile?.role !== "STAFF"
      ) {
        throw new Error("Only Service Manager can set client");
      }
      return await fetchJson<Ticket>(`/data/tickets/${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        body: { updates },
      });
    },
    onSuccess: (data, variables) => {
      const normalized: Ticket = {
        ...data,
        priority: data.priority === true,
        priority_level: resolveTicketPriorityLevel(data),
      };
      queryClient.setQueryData(["ticket", variables.ticketId], normalized);
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", variables.ticketId] });
      toast({ title: "Ticket updated" });
    },
  });
}

/* =====================================================
   Complete review (dedicated backend route)
===================================================== */
export function useCompleteReview() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      ticketId,
      category,
      issue_type,
      location,
      vehicle_number,
      priority,
      priority_level,
    }: {
      ticketId: string;
      category: string;
      issue_type: string;
      location: string;
      vehicle_number?: string | null;
      priority?: boolean;
      priority_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    }) => {
      if (userProfile?.role === "CLIENT") {
        throw new Error("Not allowed for client");
      }
      const level =
        priority_level ??
        (priority === true ? 'HIGH' : priority === false ? 'LOW' : undefined);
      return await fetchJson<Ticket>(`/tickets/${encodeURIComponent(ticketId)}/review-complete`, {
        method: "PATCH",
        body: {
          category,
          issue_type,
          location,
          vehicle_number: vehicle_number ?? null,
          ...(level
            ? {
                priority_level: level,
                priority: booleanFromPriorityLevel(level),
              }
            : {}),
        },
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", data.id] });
      toast({ title: "Review completed" });
    },
  });
}

/* =====================================================
   Update ticket status
===================================================== */
export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      ticketId,
      status,
    }: {
      ticketId: string;
      status: TicketStatus;
    }) => {
      if (userProfile?.role === "CLIENT") {
        throw new Error("Not allowed for client");
      }
      return await fetchJson<Ticket>(`/data/tickets/${encodeURIComponent(ticketId)}/status`, {
        method: "POST",
        body: { status },
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", data.id] });
      toast({ title: "Status updated" });
    },
  });
}

export type AssignmentContextImagePayload = {
  contentType: string;
  filename?: string | null;
  dataBase64: string;
  remark?: string | null;
};

/* =====================================================
   Assign ticket (via backend: creates assignment, ON_SITE token, emails, SLA)
===================================================== */
export function useAssignTicket() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      ticketId,
      feId,
      assignedUserId,
      assignmentType = "FIELD_EXECUTIVE",
      assignmentRemarks,
      assignmentDueAt,
      state,
      contextImages,
    }: {
      ticketId: string;
      feId?: string | null;
      assignedUserId?: string | null;
      assignmentType?: "FIELD_EXECUTIVE" | "SERVICE_MANAGER";
      assignmentRemarks?: string | null;
      /** Optional ISO timestamp; included when backend supports `assignment_due_at`. */
      assignmentDueAt?: string | null;
      state?: string | null;
      contextImages?: AssignmentContextImagePayload[];
    }) => {
      if (userProfile?.role === "CLIENT") {
        throw new Error("Not allowed for client");
      }
      try {
        return await fetchJson<AssignTicketResponse>(
          `/tickets/${encodeURIComponent(ticketId)}/assign`,
          {
            method: "POST",
            body: {
              assignment_type: assignmentType,
              ...(assignmentType === "SERVICE_MANAGER"
                ? { assigned_user_id: assignedUserId }
                : { feId }),
              ...(assignmentRemarks && String(assignmentRemarks).trim() !== ""
                ? { assignment_remarks: assignmentRemarks }
                : {}),
              ...(assignmentDueAt && String(assignmentDueAt).trim() !== ""
                ? { assignment_due_at: assignmentDueAt }
                : {}),
              ...(state !== undefined ? { state } : {}),
              ...(contextImages && contextImages.length > 0
                ? { context_images: contextImages }
                : {}),
            },
          }
        );
      } catch (err) {
        const isNetwork =
          err instanceof TypeError &&
          (err.message === "Failed to fetch" || err.message?.includes("fetch"));
        throw new Error(
          isNetwork
            ? "Cannot reach backend. Check that the API is running and that your network allows https://api.sahaya.pariskq.in (or set VITE_CRM_API_URL for a custom host)."
            : err instanceof Error
              ? err.message
              : "Assignment request failed"
        );
      }
    },
    onSuccess: (data, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["fe-active-tokens"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-list-supplement"] });
      queryClient.invalidateQueries({ queryKey: ["field-executives-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["sm-my-tickets"] });
      toast({
        title: "Ticket assigned",
        description: "Assignment saved. Email and SMS status follows.",
      });
      toastAssignmentNotifications(data?.notifications ?? null);
    },
  });
}

/* =====================================================
   Reassign ticket to a different FE (preserves history)
===================================================== */
export function useReassignTicket() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      ticketId,
      feId,
      assignedUserId,
      assignmentType = "FIELD_EXECUTIVE",
      assignmentRemarks,
      assignmentDueAt,
      state,
      contextImages,
    }: {
      ticketId: string;
      feId?: string | null;
      assignedUserId?: string | null;
      assignmentType?: "FIELD_EXECUTIVE" | "SERVICE_MANAGER";
      assignmentRemarks?: string | null;
      assignmentDueAt?: string | null;
      state?: string | null;
      contextImages?: AssignmentContextImagePayload[];
    }) => {
      if (userProfile?.role === "CLIENT") {
        throw new Error("Not allowed for client");
      }
      try {
        return await fetchJson<AssignTicketResponse>(
          `/tickets/${encodeURIComponent(ticketId)}/reassign`,
          {
            method: "POST",
            body: {
              assignment_type: assignmentType,
              ...(assignmentType === "SERVICE_MANAGER"
                ? { assigned_user_id: assignedUserId }
                : { feId }),
              ...(assignmentRemarks && String(assignmentRemarks).trim() !== ""
                ? { assignment_remarks: assignmentRemarks }
                : {}),
              ...(assignmentDueAt && String(assignmentDueAt).trim() !== ""
                ? { assignment_due_at: assignmentDueAt }
                : {}),
              ...(state !== undefined ? { state } : {}),
              ...(contextImages && contextImages.length > 0
                ? { context_images: contextImages }
                : {}),
            },
          }
        );
      } catch (err) {
        const isNetwork =
          err instanceof TypeError &&
          (err.message === "Failed to fetch" || err.message?.includes("fetch"));
        throw new Error(
          isNetwork
            ? "Cannot reach backend. Check that the API is running and that your network allows https://api.sahaya.pariskq.in (or set VITE_CRM_API_URL for a custom host)."
            : err instanceof Error
              ? err.message
              : "Reassignment request failed"
        );
      }
    },
    onSuccess: (data, { ticketId }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["fe-active-tokens"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-list-supplement"] });
      queryClient.invalidateQueries({ queryKey: ["field-executives-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["sm-my-tickets"] });
      toast({
        title: "Ticket reassigned",
        description: "The new assignee has been notified.",
      });
      toastAssignmentNotifications(data?.notifications ?? null);
    },
  });
}

export type BulkAssignResultItem = {
  ticket_id: string;
  ticket_number?: string | null;
  success: boolean;
  error?: string;
  assignment_id?: string;
  notifications?: AssignmentNotificationsPayload;
};

export type BulkAssignResponse = {
  group_label?: string | null;
  fe_id: string;
  summary: {
    requested: number;
    succeeded: number;
    failed: number;
  };
  results: BulkAssignResultItem[];
};

/* =====================================================
   Bulk assign tickets (isolated endpoint)
===================================================== */
export function useBulkAssignTickets() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      ticketIds,
      feId,
      assignmentDueAt,
      groupLabel,
      notes,
    }: {
      ticketIds: string[];
      feId: string;
      assignmentDueAt?: string | null;
      groupLabel?: string | null;
      notes?: string | null;
    }) => {
      if (!isBulkAssignFeatureEnabled()) {
        throw new Error("Bulk assignment is not enabled");
      }
      if (!canRoleBulkAssign(userProfile?.role)) {
        throw new Error("Not allowed for this role");
      }
      return await fetchJson<BulkAssignResponse>("/tickets/bulk-assign", {
        method: "POST",
        body: {
          ticketIds,
          feId,
          ...(assignmentDueAt && String(assignmentDueAt).trim() !== ""
            ? { assignment_due_at: assignmentDueAt }
            : {}),
          ...(groupLabel && String(groupLabel).trim() !== ""
            ? { group_label: groupLabel.trim() }
            : {}),
          ...(notes && String(notes).trim() !== "" ? { notes: notes.trim() } : {}),
        },
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["fe-active-tokens"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-list-supplement"] });
      for (const r of data.results ?? []) {
        if (r.success) {
          queryClient.invalidateQueries({ queryKey: ["ticket", r.ticket_id] });
        }
      }
      const { succeeded, failed } = data.summary;
      const failedRows = (data.results ?? []).filter((r) => !r.success);
      let description = `${succeeded} assigned${failed > 0 ? `, ${failed} failed` : ""}.`;
      if (failedRows.length > 0) {
        const preview = failedRows
          .slice(0, 3)
          .map((r) => r.ticket_number ?? r.ticket_id)
          .join(", ");
        description +=
          failedRows.length > 3 ? ` Issues: ${preview}…` : ` Issues: ${preview}`;
      }
      toast({
        title: failed > 0 && succeeded === 0 ? "Bulk assignment failed" : "Bulk assignment complete",
        description,
        variant: failed > 0 && succeeded === 0 ? "destructive" : failed > 0 ? "default" : "default",
      });
    },
  });
}

/** Tickets eligible for bulk assign (matches TicketDetail single-assign gate). */
export function isTicketBulkAssignable(status: TicketStatus): boolean {
  return status === "OPEN" || status === "FE_ATTEMPT_FAILED";
}

/* =====================================================
   Add comment (FE + STAFF)
===================================================== */
export function useAddComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ticketId,
      body,
      source = "STAFF",
      attachments = null,
    }: {
      ticketId: string;
      body: string;
      source?: "EMAIL" | "FE" | "STAFF" | "SYSTEM";
      attachments?: any[] | null;
    }) => {
      return await fetchJson<any>(`/data/tickets/${encodeURIComponent(ticketId)}/comments`, {
        method: "POST",
        body: { body, source, attachments },
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["ticket-comments", vars.ticketId],
      });
      toast({ title: "Comment added" });
    },
  });
}
