/**
 * View-only ticket detail page for client portal.
 * Shows full ticket details, assigned Field Executive, and complete activity timeline
 * (complaint received, ticket created, assignments, comments, resolution/closed).
 */
import { useParams, Link, Navigate } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  Mail,
  User,
  Phone,
  Clock,
  MessageSquare,
  CheckCircle,
  Ticket as TicketIcon,
  UserPlus,
} from "lucide-react";
import { useTicket, useTicketComments, useTicketAssignments } from "@/hooks/useTickets";
import { useAuth } from "@/hooks/useAuth";
import { useTenantTerminology } from "@/hooks/useTenantTerminology";
import { PageHeader, TicketNumberDisplay, typography } from "@/components/common";
import { formatIST } from "@/lib/dateUtils";
import { formatProofGeoLine } from "@/lib/formatProofGeo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TicketAssignment, TicketComment } from "@/lib/types";
import { ProofImageViewerOverlay } from "@/components/tickets/ProofImageViewerOverlay";
import { ProofAttachmentGallery } from "@/components/tickets/ProofAttachmentGallery";
import { extractFirstProofGeo, extractProofImageSources } from "@/lib/extractProofAttachments";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Request Received",
  NEEDS_REVIEW: "Needs Review",
  ASSIGNED: "Technician Assigned",
  EN_ROUTE: "En Route",
  ON_SITE: "Technician On-Site",
  RESOLVED_PENDING_VERIFICATION: "Under Review",
  RESOLVED: "Completed",
  REOPENED: "Reopened",
  REJECTED: "Rejected",
};

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim() || "—";
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium text-foreground break-words">{display}</p>
    </div>
  );
}

type TimelineEvent = {
  id: string;
  at: string;
  title: string;
  description?: string | null;
  type: "lifecycle" | "assignment" | "comment" | "closed";
  /** Optional for comments: attachment images */
  images?: string[];
  remarks?: string;
  /** First proof image GPS when present on attachments.images[0].geo */
  proofGpsLine?: string | null;
};

function buildTimeline(
  ticket: { id: string; opened_at?: string | null; created_at?: string | null; updated_at?: string | null; status?: string },
  assignments: (TicketAssignment & { field_executives?: { name?: string } | null })[],
  comments: (TicketComment & { attachments?: { image_base64?: string; remarks?: string } })[] | null,
  fieldExecutiveLabel: string
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const openedAt = ticket.opened_at ?? ticket.created_at;
  const createdAt = ticket.created_at ?? openedAt;

  if (openedAt) {
    events.push({
      id: "complaint-received",
      at: openedAt,
      title: "Complaint received",
      description: "Your request was received and logged.",
      type: "lifecycle",
    });
  }
  if (createdAt && createdAt !== openedAt) {
    events.push({
      id: "ticket-created",
      at: createdAt,
      title: "Ticket created",
      description: "A ticket was created for your request.",
      type: "lifecycle",
    });
  } else if (createdAt) {
    events[0].title = "Complaint received & ticket created";
    events[0].description = "Your request was received and a ticket was created.";
  }

  const assignmentsChronological = [...(assignments ?? [])].sort((a, b) => {
    const tA = new Date(a.assigned_at ?? a.created_at ?? 0).getTime();
    const tB = new Date(b.assigned_at ?? b.created_at ?? 0).getTime();
    return tA - tB;
  });
  assignmentsChronological.forEach((a, i) => {
    const at = a.assigned_at ?? a.created_at ?? "";
    const feName = (a.field_executives as { name?: string } | null)?.name ?? "Technician";
    events.push({
      id: `assignment-${a.id}`,
      at,
      title: `${fieldExecutiveLabel} assigned`,
      description: `${feName} was assigned to this ticket.`,
      type: "assignment",
    });
  });

  (comments ?? []).forEach((c) => {
    const att = (c.attachments ?? {}) as { remarks?: unknown };
    const images = extractProofImageSources(c.attachments);
    events.push({
      id: `comment-${c.id}`,
      at: c.created_at ?? "",
      title: c.source === "SYSTEM" ? "System update" : c.source === "FE" ? "Technician update" : c.source,
      description: c.body ?? undefined,
      type: "comment",
      images,
      remarks: typeof att.remarks === "string" ? att.remarks : att.remarks != null ? String(att.remarks) : undefined,
      proofGpsLine: formatProofGeoLine(extractFirstProofGeo(c.attachments)),
    });
  });

  if (ticket.status === "RESOLVED" && ticket.updated_at) {
    events.push({
      id: "ticket-closed",
      at: ticket.updated_at,
      title: "Ticket closed",
      description: "This ticket has been completed and closed.",
      type: "closed",
    });
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return events;
}

export default function ClientTicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { userProfile } = useAuth();
  const { data: ticket, isLoading } = useTicket(ticketId ?? "");
  const terminology = useTenantTerminology(
    ticket?.organisation_id ?? userProfile?.organisation_id ?? null
  );
  const { data: comments } = useTicketComments(ticketId ?? "");
  const { data: assignments } = useTicketAssignments(ticketId ?? "");
  const [proofViewerOpen, setProofViewerOpen] = useState(false);
  const [proofViewerSources, setProofViewerSources] = useState<string[] | null>(null);
  const [proofViewerIndex, setProofViewerIndex] = useState(0);

  const openProofViewer = (sources: string[], index = 0) => {
    setProofViewerSources(sources);
    setProofViewerIndex(index);
    setProofViewerOpen(true);
  };

  const closeProofViewer = () => {
    setProofViewerOpen(false);
    // Clear reference to help GC with large base64 strings.
    setTimeout(() => setProofViewerSources(null), 0);
  };

  const currentAssignment = useMemo(() => {
    if (!ticket?.current_assignment_id || !assignments?.length) return assignments?.[0] ?? null;
    return assignments.find((a) => a.id === ticket.current_assignment_id) ?? assignments[0];
  }, [ticket?.current_assignment_id, assignments]);

  const timelineEvents = useMemo(() => {
    if (!ticket) return [];
    return buildTimeline(ticket, assignments ?? [], comments ?? [], terminology.fieldExecutiveLabel);
  }, [ticket, assignments, comments, terminology.fieldExecutiveLabel]);

  if (isLoading) {
    return (
      <div className="w-full md:mx-auto md:max-w-3xl px-3 md:px-6 py-8">
        <div className="flex h-48 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading ticket…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="w-full md:mx-auto md:max-w-3xl px-3 md:px-6 py-8">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Ticket not found</h2>
          <Button variant="outline" asChild>
            <Link to="/app/client">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (userProfile?.role === "CLIENT" && ticket.client_slug !== userProfile.client_slug) {
    return <Navigate to="/app/client" replace />;
  }

  const statusLabel = STATUS_LABELS[ticket.status] ?? ticket.status;
  const fe = currentAssignment?.field_executives as { name?: string; phone?: string | null } | null | undefined;

  return (
    <div className="w-full md:mx-auto md:max-w-3xl px-3 md:px-6 py-6 md:py-8">
      <div className="flex flex-col gap-8">
        <PageHeader
          leading={
            <Button variant="ghost" size="icon" asChild aria-label="Back to dashboard">
              <Link to="/app/client">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
          }
          titleSlot={
            <h1 className="truncate text-foreground">
              <TicketNumberDisplay
                ticketNumber={ticket.ticket_number}
                organisationId={ticket.organisation_id}
                variant="prominent"
              />
            </h1>
          }
          description={`Created ${formatIST(ticket.opened_at ?? ticket.created_at, "PPpp")}`}
          actions={
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary shrink-0">
              <span className="h-2 w-2 rounded-full bg-current" />
              {statusLabel}
            </span>
          }
        />

        {/* Full Ticket Details */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TicketIcon className="h-5 w-5" />
              Ticket Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ticket number</p>
              <TicketNumberDisplay
                ticketNumber={ticket.ticket_number}
                organisationId={ticket.organisation_id}
                variant="default"
              />
            </div>
            <InfoRow label="Complaint ID" value={ticket.complaint_id} />
            <InfoRow label="Vehicle number" value={ticket.vehicle_number} />
            <InfoRow label="Category" value={ticket.category} />
            <InfoRow label="Issue type" value={ticket.issue_type} />
            <InfoRow label="Location" value={ticket.location} />
            <InfoRow label="Current status" value={statusLabel} />
            <div className="sm:col-span-2 flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Reported by email
              </p>
              <p className="text-sm font-medium text-foreground break-all">{ticket.opened_by_email ?? "—"}</p>
            </div>
            <div className="sm:col-span-2 flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Opened date
              </p>
              <p className="text-sm font-medium text-foreground">
                {formatIST(ticket.opened_at ?? ticket.created_at, "PPpp")}
              </p>
            </div>
            {(ticket.short_description?.trim()) && (
              <div className="sm:col-span-2 flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Description / remarks
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words bg-muted/50 rounded-lg p-3">
                  {ticket.short_description.trim()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Field Executive Assignment */}
        {currentAssignment && (
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Assigned {terminology.fieldExecutiveLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{fe?.name ?? "Technician"}</p>
                  {fe?.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Phone className="h-3.5 w-3.5" />
                      {fe.phone}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground sm:ml-auto">
                <Clock className="h-4 w-4 shrink-0" />
                Assigned {formatIST(currentAssignment.assigned_at ?? currentAssignment.created_at, "PPp")}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Activity Timeline */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Activity Timeline
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal mt-1">
              Full history of your ticket from complaint to resolution.
            </p>
          </CardHeader>
          <CardContent>
            {timelineEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No activity yet.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" aria-hidden />
                <ul className="space-y-0">
                  {timelineEvents.map((evt) => (
                    <li key={evt.id} className="relative flex gap-4 pb-6 last:pb-0">
                      <div
                        className={`
                          relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-background
                          ${evt.type === "closed" ? "border-green-500 text-green-600" : "border-primary/40 text-primary"}
                        `}
                      >
                        {evt.type === "closed" ? (
                          <CheckCircle className="h-3.5 w-3.5" />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-current" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="font-medium text-foreground">{evt.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatIST(evt.at, "PPp")}
                        </p>
                        {evt.description && (
                          <p className="text-sm text-muted-foreground mt-1.5 whitespace-pre-wrap break-words">
                            {evt.description}
                          </p>
                        )}
                        {evt.remarks && (
                          <p className="text-sm text-muted-foreground mt-1 italic whitespace-pre-wrap break-words">
                            Remarks: {evt.remarks}
                          </p>
                        )}
                        {(evt.images?.length ?? 0) > 0 && (
                          <ProofAttachmentGallery
                            sources={evt.images ?? []}
                            imgClassName="max-h-48 rounded border object-contain"
                            onOpenAtIndex={(index) => openProofViewer(evt.images ?? [], index)}
                            proofGpsLine={evt.proofGpsLine}
                            className="mt-0"
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <ProofImageViewerOverlay
          open={proofViewerOpen && !!proofViewerSources?.length}
          sources={proofViewerSources ?? undefined}
          initialIndex={proofViewerIndex}
          onClose={closeProofViewer}
        />

        <div className="flex justify-start">
          <Button variant="outline" asChild>
            <Link to="/app/client">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
