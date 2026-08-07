//works
import { useState, useRef, useEffect, useMemo, type ComponentType } from "react";
import { useParams, Link, useNavigate, Navigate } from "react-router-dom";
import { formatIST } from "@/lib/dateUtils";
import { formatStateDisplay } from "@/lib/indianStates";
import {
  ArrowLeft,
  MapPin,
  Truck,
  Mail,
  CheckCircle,
  User,
  Clock,
  Image as ImageIcon,
  ClipboardCheck,
  FileText,
  XCircle,
} from "lucide-react";

import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader, typography } from "@/components/common";
import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import { TicketPriorityRadioGroup } from "@/components/tickets/TicketPriorityRadioGroup";
import { StateSelect } from "@/components/tickets/StateSelect";
import { StatusBadge } from "@/components/tickets/StatusBadge";
import {
  type PriorityLevel,
  resolveTicketPriorityLevel,
  priorityDisplayLabel,
  booleanFromPriorityLevel,
  DEFAULT_PRIORITY_LEVEL,
} from "@/lib/priority";
import { ConfidenceScore } from "@/components/tickets/ConfidenceScore";
import { getDisplayConfidenceScore } from "@/lib/confidence";
import { FEAssignmentModal } from "@/components/tickets/FEAssignmentModal";
import { CloseTicketDialog } from "@/components/tickets/CloseTicketDialog";
import { RejectTicketDialog } from "@/components/tickets/RejectTicketDialog";

import { ProofImageViewerOverlay } from "@/components/tickets/ProofImageViewerOverlay";
import { ProofAttachmentGallery } from "@/components/tickets/ProofAttachmentGallery";
import { extractFirstProofGeo, extractProofImageSources } from "@/lib/extractProofAttachments";
import { formatProofGeoLine } from "@/lib/formatProofGeo";

import {
  useTicket,
  useTicketComments,
  useTicketAssignments,
  useUpdateTicketStatus,
  useUpdateTicket,
  useCompleteReview,
} from "@/hooks/useTickets";
import { useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/backendDataApi";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TicketStatus } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useTenantTerminology } from "@/hooks/useTenantTerminology";
import { TicketNumberDisplay } from "@/components/common/TicketNumberDisplay";
import { ReviewCompleteSchema, formatZodError } from "@/lib/validation";
import { canFirstAssignTicket, canReassignTicket } from "@/lib/ticketReassignment";
import { z } from "zod";

function isoToDatetimeLocalInput(iso: string | null | undefined): string {
  if (!iso || String(iso).trim() === "") return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const isClient = userProfile?.role === "CLIENT";
  const canPerformActions =
    userProfile?.role === "ADMIN" ||
    userProfile?.role === "STAFF" ||
    userProfile?.role === "SUPER_ADMIN";

  const queryClient = useQueryClient();
  const { data: ticket, isLoading } = useTicket(ticketId ?? "");
  const terminology = useTenantTerminology(
    ticket?.organisation_id ?? userProfile?.organisation_id ?? null
  );
  const { data: comments } = useTicketComments(ticketId ?? "");
  const { data: assignments } = useTicketAssignments(ticketId ?? "");
  const updateStatus = useUpdateTicketStatus();
  const updateTicket = useUpdateTicket();
  const completeReview = useCompleteReview();

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignModalMode, setAssignModalMode] = useState<"assign" | "reassign">("assign");
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closePending, setClosePending] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectPending, setRejectPending] = useState(false);
  const [proofViewerOpen, setProofViewerOpen] = useState(false);
  const [proofViewerSources, setProofViewerSources] = useState<string[] | null>(null);
  const [proofViewerIndex, setProofViewerIndex] = useState(0);

  const canCompleteReview =
    Boolean(ticket?.needs_review) &&
    (userProfile?.role === "ADMIN" ||
      userProfile?.role === "STAFF" ||
      userProfile?.role === "SUPER_ADMIN");

  const [reviewCategory, setReviewCategory] = useState("");
  const [reviewIssueType, setReviewIssueType] = useState("");
  const [reviewVehicleNumber, setReviewVehicleNumber] = useState("");
  const [reviewLocation, setReviewLocation] = useState("");
  const [reviewPriorityLevel, setReviewPriorityLevel] = useState<PriorityLevel>(DEFAULT_PRIORITY_LEVEL);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [clientSlugDraft, setClientSlugDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");
  const reviewFormSynced = useRef(false);
  useEffect(() => {
    if (ticket && canCompleteReview) {
      if (!reviewFormSynced.current) {
        reviewFormSynced.current = true;
        setReviewCategory(ticket.category ?? "");
        setReviewIssueType(ticket.issue_type ?? "");
        setReviewVehicleNumber(ticket.vehicle_number ?? "");
        setReviewLocation(ticket.location ?? "");
        setReviewPriorityLevel(resolveTicketPriorityLevel(ticket));
      }
    } else {
      reviewFormSynced.current = false;
    }
  }, [ticket, canCompleteReview]);

  useEffect(() => {
    if (ticket) setClientSlugDraft(ticket.client_slug ?? "");
  }, [ticket]);

  const currentAssignment = useMemo(() => {
    if (!assignments?.length) return undefined;
    if (ticket?.current_assignment_id) {
      const match = assignments.find(
        (a: { id?: string }) => a.id === ticket.current_assignment_id
      );
      if (match) return match;
    }
    return assignments[0];
  }, [assignments, ticket?.current_assignment_id]);

  const reassignDuePrefill = useMemo(() => {
    const raw = (currentAssignment as { assignment_due_at?: string | null } | undefined)
      ?.assignment_due_at;
    return isoToDatetimeLocalInput(raw ?? null);
  }, [currentAssignment]);

  const rejectionMeta = useMemo(() => {
    if (!ticket || ticket.status !== "REJECTED") return null;
    type RejectionAtt = {
      reason?: string;
      rejected_by_name?: string;
      rejected_at?: string;
      recipients?: string[];
    };
    const fromComment = (comments ?? []).find((c) => {
      const a = c.attachments as { rejection?: RejectionAtt } | null;
      return a?.rejection != null && typeof a.rejection === "object";
    });
    const rej = (fromComment?.attachments as { rejection?: RejectionAtt } | null)?.rejection;
    return {
      reason: ticket.rejection_reason?.trim() || rej?.reason?.trim() || null,
      rejectedAt: ticket.rejected_at || rej?.rejected_at || null,
      rejectedByName: rej?.rejected_by_name?.trim() || null,
      recipients: Array.isArray(rej?.recipients) ? rej.recipients : [],
    };
  }, [ticket, comments]);

  if (isLoading) {
    const content = (
      <PageContainer>
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(
                isClient
                  ? "/app/client"
                  : userProfile?.role === "FIELD_EXECUTIVE"
                    ? "/fe"
                    : "/app/tickets"
              )
            }
            aria-label={
              isClient
                ? "Back to client portal"
                : userProfile?.role === "FIELD_EXECUTIVE"
                  ? "My tickets"
                  : "All Tickets"
            }
            className="gap-1.5 px-2"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span>
              {isClient
                ? "Back to client portal"
                : userProfile?.role === "FIELD_EXECUTIVE"
                  ? "My tickets"
                  : "All Tickets"}
            </span>
          </Button>
        </div>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading ticket…
        </div>
      </PageContainer>
    );
    return isClient ? content : <AppLayoutNew>{content}</AppLayoutNew>;
  }

  if (!ticket) {
    const content = (
      <PageContainer>
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-semibold">Ticket not found</h2>
          <Link to={isClient ? "/app/client" : "/app/tickets"} className="text-primary hover:underline">
            Back to {isClient ? "client portal" : "All Tickets"}
          </Link>
        </div>
      </PageContainer>
    );
    return isClient ? content : <AppLayoutNew>{content}</AppLayoutNew>;
  }

  if (userProfile?.role === "CLIENT" && ticket.client_slug !== userProfile.client_slug) {
    return <Navigate to="/app/client" replace />;
  }
  if (
    userProfile?.role !== "SUPER_ADMIN" &&
    userProfile?.organisation_id &&
    ticket.organisation_id &&
    ticket.organisation_id !== userProfile.organisation_id
  ) {
    return <Navigate to="/app/tickets" replace />;
  }

  const clientSlugMissing = !ticket.client_slug?.trim();
  if (clientSlugMissing && userProfile?.role !== "STAFF") {
    return <Navigate to={isClient ? "/app/client" : "/app/tickets"} replace />;
  }

  const assignedFE = currentAssignment?.field_executives;

  const isPendingVerification =
    ticket.status === "RESOLVED_PENDING_VERIFICATION";

  const isResolved = ticket.status === "RESOLVED";

  /* ================= ACTION HANDLERS ================= */

  const handleSaveClient = () => {
    if (!ticket || userProfile?.role !== "STAFF") return;
    const v = clientSlugDraft.trim();
    if (!v) return;
    updateTicket.mutate(
      {
        ticketId: ticket.id,
        updates: { client_slug: v },
      },
      {
        onSuccess: () =>
          toast({
            title: "Client saved",
            description: "Client has been set on this ticket.",
          }),
        onError: (err: unknown) =>
          toast({
            title: "Save failed",
            description: err instanceof Error ? err.message : "Update failed",
            variant: "destructive",
          }),
      }
    );
  };

  const handleApprove = () => {
    if (ticket.status === "NEEDS_REVIEW") {
      updateStatus.mutate({ ticketId: ticket.id, status: "OPEN" });
    }
  };

  const handleVerifyAndClose = () => {
    updateStatus.mutate(
      { ticketId: ticket.id, status: "RESOLVED" as TicketStatus },
      {
        onSuccess: () =>
          toast({
            title: "Ticket Closed",
            description: `Ticket ${ticket.ticket_number} verified and closed.`,
          }),
      }
    );
  };

  const handlePriorityLevelChange = (level: PriorityLevel) => {
    if (!ticket) return;
    updateTicket.mutate(
      {
        ticketId: ticket.id,
        updates: {
          priority_level: level,
          priority: booleanFromPriorityLevel(level),
        },
      },
      {
        onError: (err) =>
          toast({
            title: "Failed to update priority",
            description: err.message,
            variant: "destructive",
          }),
      }
    );
  };

  const handleStateChange = (state: string | null) => {
    if (!ticket) return;
    updateTicket.mutate(
      {
        ticketId: ticket.id,
        updates: { state },
      },
      {
        onError: (err) =>
          toast({
            title: "Failed to update state",
            description: err.message,
            variant: "destructive",
          }),
      }
    );
  };

  const handleSaveLocation = () => {
    if (!ticket) return;
    const trimmed = locationDraft.trim();
    if (!trimmed) {
      toast({
        title: "Location is required",
        description: "Please enter a location before saving.",
        variant: "destructive",
      });
      return;
    }
    updateTicket.mutate(
      {
        ticketId: ticket.id,
        updates: { location: trimmed },
      },
      {
        onSuccess: () => setLocationDraft(""),
        onError: (err) =>
          toast({
            title: "Failed to update location",
            description: err.message,
            variant: "destructive",
          }),
      }
    );
  };

  const handleCompleteReview = () => {
    if (!ticket) return;
    setReviewErrors({});
    const payload = {
      category: reviewCategory.trim(),
      issue_type: reviewIssueType.trim(),
      location: reviewLocation.trim(),
      vehicle_number: reviewVehicleNumber.trim() || null,
      priority_level: reviewPriorityLevel,
      priority: booleanFromPriorityLevel(reviewPriorityLevel),
    };
    const result = ReviewCompleteSchema.safeParse(payload);
    if (!result.success) {
      const err = result.error as z.ZodError;
      const next: Record<string, string> = {};
      err.errors.forEach((e) => {
        const path = e.path[0] as string;
        if (path && e.message) next[path] = e.message;
      });
      setReviewErrors(next);
      toast({
        title: "Validation failed",
        description: formatZodError(err),
        variant: "destructive",
      });
      return;
    }
    completeReview.mutate(
      {
        ticketId: ticket.id,
        category: result.data.category,
        issue_type: result.data.issue_type,
        location: result.data.location,
        vehicle_number: result.data.vehicle_number ?? null,
        priority_level: result.data.priority_level ?? reviewPriorityLevel,
        priority: result.data.priority ?? booleanFromPriorityLevel(reviewPriorityLevel),
      },
      {
        onError: (err) =>
          toast({
            title: "Update failed",
            description: err.message,
            variant: "destructive",
          }),
      }
    );
  };

  const handleClose = async (
    verificationRemarks: string,
    reviewNotes: string,
    resolutionCategory: string,
    notificationEmail?: string | null,
    resolutionOtherDetails?: string | null
  ) => {
    if (isClient) return;
    setClosePending(true);
    try {
      const closeResult = await fetchJson<{
        success?: boolean;
        resolution_email_status?: {
          sent?: boolean;
          skipped?: boolean;
          attempted?: boolean;
          reason?: string | null;
          sent_count?: number;
          recipient_count?: number;
        };
      }>(`/tickets/${ticket.id}/close`, {
        method: "POST",
        body: {
          verification_remarks:
            verificationRemarks != null && String(verificationRemarks).trim() !== ""
              ? String(verificationRemarks).trim()
              : null,
          review_notes:
            reviewNotes != null && String(reviewNotes).trim() !== ""
              ? String(reviewNotes).trim()
              : null,
          resolution_category:
            resolutionCategory != null && String(resolutionCategory).trim() !== ""
              ? String(resolutionCategory).trim()
              : undefined,
          ...(resolutionCategory === "OTHER" &&
          resolutionOtherDetails != null &&
          String(resolutionOtherDetails).trim() !== ""
            ? { resolution_other_details: String(resolutionOtherDetails).trim() }
            : {}),
          ...(notificationEmail != null && String(notificationEmail).trim() !== ""
            ? { notification_email: String(notificationEmail).trim() }
            : {}),
        },
      });
      setCloseDialogOpen(false);
      const st = closeResult?.resolution_email_status;
      let emailHint = "";
      if (st) {
        if (st.sent) {
          emailHint = " Resolution email sent to all recipients.";
        } else if (st.skipped && st.reason === "no_recipients") {
          emailHint = " Resolution email skipped — no valid recipient addresses.";
        } else if (st.reason === "partial_failure") {
          emailHint = ` Resolution email partially sent (${st.sent_count ?? 0}/${st.recipient_count ?? 0}).`;
        } else if (st.reason) {
          emailHint = ` Resolution email: ${st.reason}.`;
        }
      }
      toast({
        title: "Ticket Closed",
        description: `Ticket ${ticket.ticket_number} verified and closed.${emailHint}`,
      });
      window.location.reload();
    } catch (err) {
      toast({
        title: "Close failed",
        description:
          err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setClosePending(false);
    }
  };

  const handleReject = async (payload: {
    reason: string;
    recipients: string[];
    evidence: { commentId: string; proofIndex: number } | null;
    evidenceUpload: {
      contentType: string;
      filename: string;
      dataBase64: string;
    } | null;
  }) => {
    if (isClient) return;
    const trimmed = payload.reason.trim();
    if (!trimmed) return;

    setRejectPending(true);
    try {
      const result = await fetchJson<{
        success?: boolean;
        rejection_email_status?: {
          attempted?: boolean;
          sent?: boolean;
          skipped?: boolean;
          reason?: string | null;
          recipient_count?: number;
          sent_count?: number;
        };
      }>(`/tickets/${ticket.id}/reject`, {
        method: "POST",
        body: {
          reason: trimmed,
          recipients: payload.recipients,
          evidence: payload.evidence,
          evidence_upload: payload.evidenceUpload,
        },
      });

      setRejectDialogOpen(false);

      const st = result?.rejection_email_status;
      let emailNote = "";
      if (st?.skipped && st.reason === "no_recipients") {
        emailNote = " No rejection email was sent (no recipients selected).";
      } else if (st?.sent) {
        emailNote = " Rejection email sent.";
      } else if (st?.attempted && !st?.sent) {
        emailNote = " Ticket rejected; email delivery had an issue (check ops logs).";
      }

      toast({
        title: "Ticket rejected",
        description: `Ticket ${ticket.ticket_number} was rejected.${emailNote}`,
      });

      queryClient.invalidateQueries({ queryKey: ["ticket", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["ticket-assignments", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } catch (err) {
      toast({
        title: "Reject failed",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setRejectPending(false);
    }
  };

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



  /* ================= UI ================= */

  const backTo = isClient
    ? "/app/client"
    : userProfile?.role === "FIELD_EXECUTIVE"
      ? "/fe"
      : "/app/tickets";
  const backLabel = isClient
    ? "Back to client portal"
    : userProfile?.role === "FIELD_EXECUTIVE"
      ? "My tickets"
      : "All Tickets";
  const detailContent = (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          leading={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(backTo)}
              aria-label={backLabel}
              className="gap-1.5 px-2"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span>{backLabel}</span>
            </Button>
          }
          titleSlot={
            <div className="flex flex-wrap items-center gap-4">
              <h1 className="truncate">
                <TicketNumberDisplay
                  ticketNumber={ticket.ticket_number}
                  organisationId={ticket.organisation_id}
                  variant="prominent"
                />
              </h1>
              <StatusBadge status={ticket.status} />
              <TicketPriorityBadge
                priority={ticket.priority}
                priority_level={ticket.priority_level}
              />
            </div>
          }
          description={`Opened ${formatIST(ticket.opened_at, "PPpp")}`}
          actions={
            canPerformActions ? (
              <div className="flex flex-wrap items-center gap-2">
              {canFirstAssignTicket(ticket) && (
                <Button
                  onClick={() => {
                    setAssignModalMode("assign");
                    setAssignModalOpen(true);
                  }}
                >
                  <User className="mr-2 h-4 w-4" />
                  Assign {terminology.fieldExecutiveLabel}
                </Button>
              )}
              {canReassignTicket(ticket) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssignModalMode("reassign");
                    setAssignModalOpen(true);
                  }}
                >
                  <User className="mr-2 h-4 w-4" />
                  Reassign {terminology.fieldExecutiveLabel}
                </Button>
              )}
              {ticket.status === "NEEDS_REVIEW" && (
                <Button onClick={handleApprove}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve & Open
                </Button>
              )}
              {(ticket.status === "OPEN" || ticket.status === "NEEDS_REVIEW") && (
                <Button
                  variant="destructive"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={rejectPending}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject Ticket
                </Button>
              )}

              {isPendingVerification && (
                <Button
                  onClick={() => setCloseDialogOpen(true)}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={closePending}
                >
                  {closePending ? "Closing…" : "Verify & Close"}
                </Button>
              )}

              {isResolved && (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Resolved
                </Badge>
              )}
            </div>
            ) : isResolved && !canPerformActions ? (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="mr-2 h-4 w-4" />
                Resolved
              </Badge>
            ) : null
          }
        />

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* LEFT */}
          <div className="md:col-span-2 space-y-6">
            {/* DETAILS */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Ticket Details</CardTitle>
                {canCompleteReview && (
                  <Button
                    onClick={handleCompleteReview}
                    disabled={completeReview.isPending}
                  >
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Complete Review
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Info label="Complaint ID" value={ticket.complaint_id} />
                {userProfile?.role === "STAFF" && !ticket.client_slug?.trim() ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="client-slug">Client Short Name *</Label>
                    <div className="flex flex-wrap gap-2 items-end">
                      <Input
                        id="client-slug"
                        value={clientSlugDraft}
                        onChange={(e) => setClientSlugDraft(e.target.value)}
                        className="max-w-md"
                        placeholder="Enter client short name"
                      />
                      <Button
                        type="button"
                        onClick={handleSaveClient}
                        disabled={updateTicket.isPending || !clientSlugDraft.trim()}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Info label="Client" value={ticket.client_slug ?? undefined} />
                )}
                {canCompleteReview ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="review-vehicle">Vehicle Number</Label>
                      <Input
                        id="review-vehicle"
                        value={reviewVehicleNumber}
                        onChange={(e) => setReviewVehicleNumber(e.target.value)}
                        className={reviewErrors.vehicle_number ? "border-destructive" : ""}
                      />
                      {reviewErrors.vehicle_number && (
                        <p className="text-xs text-destructive">{reviewErrors.vehicle_number}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="review-category">Category *</Label>
                      <Input
                        id="review-category"
                        value={reviewCategory}
                        onChange={(e) => setReviewCategory(e.target.value)}
                        className={reviewErrors.category ? "border-destructive" : ""}
                      />
                      {reviewErrors.category && (
                        <p className="text-xs text-destructive">{reviewErrors.category}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="review-issue-type">Issue Type *</Label>
                      <Input
                        id="review-issue-type"
                        value={reviewIssueType}
                        onChange={(e) => setReviewIssueType(e.target.value)}
                        className={reviewErrors.issue_type ? "border-destructive" : ""}
                      />
                      {reviewErrors.issue_type && (
                        <p className="text-xs text-destructive">{reviewErrors.issue_type}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="review-location">Location *</Label>
                      <Input
                        id="review-location"
                        value={reviewLocation}
                        onChange={(e) => setReviewLocation(e.target.value)}
                        className={reviewErrors.location ? "border-destructive" : ""}
                      />
                      {reviewErrors.location && (
                        <p className="text-xs text-destructive">{reviewErrors.location}</p>
                      )}
                    </div>
                    <div className="sm:col-span-2 space-y-2">
                      <Label>Priority</Label>
                      <TicketPriorityRadioGroup
                        value={reviewPriorityLevel}
                        onValueChange={setReviewPriorityLevel}
                        idPrefix="review-priority"
                      />
                    </div>
                    {ticket.short_description && (
                      <div className="sm:col-span-2 flex items-start gap-2">
                        <FileText className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm text-muted-foreground">Details</p>
                          <p className="font-medium whitespace-pre-wrap break-words text-sm">{ticket.short_description}</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Info label="Vehicle Number" value={ticket.vehicle_number} mono />
                    <Info label="Vehicle Name" value={ticket.vehicle_name} />
                    <Info label="Vehicle Type" value={ticket.vehicle_type} />
                    <Info label="Registration Number" value={ticket.registration_number} />
                    <Info label="Category" value={ticket.category} />
                    <Info label="Issue Type" value={ticket.issue_type} />
                    <Info label="Client" value={ticket.client_slug} />
                    {canPerformActions && !ticket.location?.trim() ? (
                      <div className="space-y-2">
                        <Label htmlFor="ticket-location" className="text-sm font-medium">
                          Location <span className="text-destructive">*</span>
                        </Label>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Input
                            id="ticket-location"
                            placeholder="e.g., Mumbai, Andheri East"
                            value={locationDraft}
                            onChange={(e) => setLocationDraft(e.target.value)}
                            disabled={updateTicket.isPending}
                            className="w-full"
                          />
                          <Button
                            type="button"
                            onClick={handleSaveLocation}
                            disabled={updateTicket.isPending || !locationDraft.trim()}
                            className="shrink-0"
                          >
                            Save
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          This ticket has no location yet. Add one to keep records complete.
                        </p>
                      </div>
                    ) : (
                      <IconInfo icon={MapPin} label="Location" value={ticket.location} />
                    )}
                    {canPerformActions ? (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">State</Label>
                        <StateSelect
                          value={ticket.state}
                          onValueChange={handleStateChange}
                          disabled={updateTicket.isPending}
                          aria-label="Ticket state"
                        />
                      </div>
                    ) : (
                      <Info label="State" value={formatStateDisplay(ticket.state)} />
                    )}
                    {canPerformActions ? (
                      <div className="sm:col-span-2 space-y-2 rounded-md border border-border/60 px-3 py-3">
                        <Label className="text-sm font-medium">Priority</Label>
                        <TicketPriorityRadioGroup
                          value={resolveTicketPriorityLevel(ticket)}
                          onValueChange={handlePriorityLevelChange}
                          disabled={updateTicket.isPending}
                          idPrefix="ticket-priority"
                        />
                      </div>
                    ) : (
                      <Info
                        label="Priority"
                        value={priorityDisplayLabel(resolveTicketPriorityLevel(ticket))}
                      />
                    )}
                    {ticket.short_description && (
                      <div className="sm:col-span-2 flex items-start gap-2">
                        <FileText className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm text-muted-foreground">Details</p>
                          <p className="font-medium whitespace-pre-wrap break-words">{ticket.short_description}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {!canCompleteReview && (
                  <IconInfo icon={Mail} label="Reported By" value={ticket.opened_by_email} />
                )}
                {canCompleteReview && (
                  <div className="sm:col-span-2">
                    <IconInfo icon={Mail} label="Reported By" value={ticket.opened_by_email} />
                  </div>
                )}
                {ticket.creator_display != null && String(ticket.creator_display).trim() !== "" && (
                  <div className="sm:col-span-2 flex items-start gap-2">
                    <User className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">Created / opened by</p>
                      <p className="font-medium break-words text-sm">{String(ticket.creator_display).trim()}</p>
                    </div>
                  </div>
                )}
                {ticket.status === "REJECTED" && (
                  <div className="sm:col-span-2 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm font-semibold text-destructive">Rejection</p>
                    <Info
                      label="Rejection Reason"
                      value={rejectionMeta?.reason?.trim() ? rejectionMeta.reason : "Not recorded"}
                    />
                    {rejectionMeta?.rejectedAt && (
                      <Info
                        label="Rejected At"
                        value={formatIST(rejectionMeta.rejectedAt, "PPpp")}
                      />
                    )}
                    <Info
                      label="Rejected By"
                      value={rejectionMeta?.rejectedByName || "Not recorded"}
                    />
                    {rejectionMeta && rejectionMeta.recipients.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground">Email recipients</p>
                        <ul className="list-disc pl-5 text-sm">
                          {rejectionMeta.recipients.map((email) => (
                            <li key={email} className="break-all">
                              {email}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Attempt Failed: show when FE reported resolution failed */}
            {ticket.status === "FE_ATTEMPT_FAILED" && currentAssignment && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-800">
                    <Truck className="h-5 w-5" />
                    Attempt Failed
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-amber-800">
                    <strong>Reason:</strong> {(currentAssignment as { failure_reason?: string | null }).failure_reason ?? "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Attempt count: {assignments?.length ?? 0}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Assignment */}
            {currentAssignment && assignedFE && ticket.status !== "FE_ATTEMPT_FAILED" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Assigned {terminology.fieldExecutiveLabel}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 font-semibold">
                      {assignedFE.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{assignedFE.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Assigned{" "}
                        {formatIST(
                          currentAssignment.assigned_at ||
                            currentAssignment.created_at,
                          "PPp"
                        )}
                      </p>
                    </div>
                    <Badge>{assignedFE.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  {(currentAssignment as { assignment_due_at?: string | null }).assignment_due_at != null &&
                    String((currentAssignment as { assignment_due_at?: string | null }).assignment_due_at).trim() !==
                      "" && (
                      <p className="text-sm text-muted-foreground border-t pt-3 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-4 w-full sm:w-auto">
                        <span className="font-medium text-foreground">Assignment due: </span>
                        {formatIST(
                          String((currentAssignment as { assignment_due_at?: string }).assignment_due_at),
                          "PPp"
                        )}
                      </p>
                    )}
                </CardContent>
              </Card>
            )}

            {/* ACTIVITY */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {comments?.map((c) => {
                  const a = (c.attachments ?? {}) as {
                    remarks?: unknown;
                    fe_remark?: { event_type?: string };
                    rejection?: {
                      reason?: string;
                      rejected_by_name?: string;
                      rejected_by_user_id?: string;
                    };
                  };

                  const rejection = a.rejection as
                    | {
                        reason?: string;
                        rejected_by_name?: string;
                        rejected_by_user_id?: string;
                        rejected_at?: string;
                        recipients?: string[];
                        evidence?: {
                          comment_id?: string;
                          proof_index?: number;
                          category?: string;
                        } | null;
                      }
                    | undefined;
                  const isFeAdditional = a.fe_remark?.event_type === "FE_ADDITIONAL_REMARK";
                  const images = extractProofImageSources(c.attachments);
                  const proofGpsLine = formatProofGeoLine(extractFirstProofGeo(c.attachments));
                  return (
                    <div key={c.id} className="border-l-2 pl-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline">
                          {isFeAdditional && !rejection ? "Additional Remark" : c.source}
                        </Badge>
                        {formatIST(c.created_at, "PPp")}
                      </div>
                      {rejection != null && typeof rejection === "object" ? (
                        <div className="mt-2 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                          <p className="font-semibold text-destructive">Ticket Rejected</p>
                          <p>
                            <span className="text-muted-foreground">By: </span>
                            <span className="font-medium">
                              {rejection.rejected_by_name?.trim()
                                ? rejection.rejected_by_name
                                : "Unknown"}
                            </span>
                          </p>
                          {rejection.rejected_at && (
                            <p>
                              <span className="text-muted-foreground">Date: </span>
                              {formatIST(rejection.rejected_at, "PPp")}
                            </p>
                          )}
                          <div>
                            <p className="text-muted-foreground">Reason:</p>
                            <p className="whitespace-pre-wrap break-words font-medium">
                              {rejection.reason?.trim()
                                ? rejection.reason
                                : (c.body ?? "").replace(/^Ticket rejected:\s*/i, "").trim() ||
                                  "Not recorded"}
                            </p>
                          </div>
                          {Array.isArray(rejection.recipients) && rejection.recipients.length > 0 && (
                            <div>
                              <p className="text-muted-foreground">Email sent to:</p>
                              <ul className="list-disc pl-5">
                                {rejection.recipients.map((email) => (
                                  <li key={email} className="break-all">
                                    {email}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {rejection.evidence?.comment_id != null && (
                            <p className="text-muted-foreground">
                              Evidence:{" "}
                              {(rejection.evidence as { source?: string }).source ===
                              "MANAGER_UPLOAD"
                                ? "Manager rejection photo"
                                : "FE proof"}{" "}
                              (comment {String(rejection.evidence.comment_id).slice(0, 8)}…, index{" "}
                              {rejection.evidence.proof_index ?? 0})
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>
                      )}

                      {images.length > 0 && (
                        <ProofAttachmentGallery
                          sources={images}
                          imgClassName="max-h-64 rounded border object-contain"
                          onOpenAtIndex={(index) => openProofViewer(images, index)}
                          proofGpsLine={proofGpsLine}
                        />
                      )}

                      {a?.remarks && (
                        <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                          <strong>Remarks:</strong> {String(a.remarks)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT */}
          <div className="space-y-6">
            {canPerformActions && (
              <Card>
                <CardHeader>
                  <CardTitle>Parsing Confidence</CardTitle>
                </CardHeader>
                <CardContent>
                  <ConfidenceScore score={getDisplayConfidenceScore(ticket)} size="lg" />
                </CardContent>
              </Card>
            )}

            {canPerformActions && ticket.status === "ON_SITE" && (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                Resolution token unlocks automatically after FE uploads on-site proof.
              </div>
            )}
          </div>
        </div>
      </div>

      {canPerformActions && (
        <FEAssignmentModal
          ticket={ticket}
          open={assignModalOpen}
          onOpenChange={setAssignModalOpen}
          mode={assignModalMode}
          initialAssignmentDueLocal={
            assignModalMode === "reassign" ? reassignDuePrefill : ""
          }
        />
      )}

      {canPerformActions && (
      <CloseTicketDialog
        ticket={ticket}
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        onConfirm={handleClose}
        isPending={closePending}
      />
      )}

      {canPerformActions && (
        <RejectTicketDialog
          ticket={ticket}
          open={rejectDialogOpen}
          onOpenChange={setRejectDialogOpen}
          onConfirm={handleReject}
          isPending={rejectPending}
        />
      )}

      <ProofImageViewerOverlay
        open={proofViewerOpen && !!proofViewerSources?.length}
        sources={proofViewerSources ?? undefined}
        initialIndex={proofViewerIndex}
        onClose={closeProofViewer}
      />
    </PageContainer>
  );
  return isClient ? detailContent : <AppLayoutNew>{detailContent}</AppLayoutNew>;
}

/* ===== Helpers ===== */
type InfoProps = {
  label: string;
  value?: string | null;
  mono?: boolean;
};

function Info({ label, value, mono }: InfoProps) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={
          mono
            ? "font-mono font-medium whitespace-pre-wrap break-words"
            : "font-medium whitespace-pre-wrap break-words"
        }
      >
        {value || "—"}
      </p>
    </div>
  );
}

type IconInfoProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
};

function IconInfo({ icon: Icon, label, value }: IconInfoProps) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-1 h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-medium whitespace-pre-wrap break-words">{value || "—"}</p>
      </div>
    </div>
  );
}
