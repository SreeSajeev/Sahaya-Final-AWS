/**
 * CloseTicketDialog.tsx
 *
 * Confirmation dialog for Service Manager to close/resolve a ticket.
 * Only allows closing tickets that are in appropriate states (ON_SITE, RESOLVED_PENDING_VERIFICATION).
 * Requires Issue Type (stored as resolution_category); includes optional verification remarks (sent to backend and included in resolution email).
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { Ticket, TicketStatus } from "@/lib/types";
import { TicketNumberDisplay } from "@/components/common/TicketNumberDisplay";
import {
  RESOLUTION_CATEGORY_OTHER,
} from "@/constants/complaintCategories";
import { useOrgTicketConfigForClose } from "@/hooks/useOrgTicketConfigForClose";
import { fetchJson } from "@/lib/backendDataApi";

interface CloseTicketDialogProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    verificationRemarks: string,
    reviewNotes: string,
    resolutionCategory: string,
    notificationEmail?: string | null,
    resolutionOtherDetails?: string | null
  ) => void;
  isPending: boolean;
}

const CLOSEABLE_STATUSES: TicketStatus[] = [
  "ON_SITE",
  "RESOLVED_PENDING_VERIFICATION",
];

const SINGLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidNotificationEmailField(value: string): boolean {
  const t = value.trim();
  if (t === "") return true;
  return t.split(/[,;]/).every((p) => SINGLE_EMAIL_RE.test(p.trim()));
}

export function CloseTicketDialog({
  ticket,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: CloseTicketDialogProps) {
  const [remarks, setRemarks] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [resolutionCategory, setResolutionCategory] = useState("");
  const [resolutionOtherDetails, setResolutionOtherDetails] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const isOtherCategory = resolutionCategory === RESOLUTION_CATEGORY_OTHER;
  const { resolutionCategoryOptions } = useOrgTicketConfigForClose({
    organisationId: ticket.organisation_id ?? null,
    enabled: open,
  });
  const canClose = CLOSEABLE_STATUSES.includes(ticket.status);
  const canConfirm =
    canClose &&
    resolutionCategory.trim() !== "" &&
    (!isOtherCategory || resolutionOtherDetails.trim() !== "") &&
    isValidNotificationEmailField(notificationEmail);

  useEffect(() => {
    if (!open) {
      setRemarks("");
      setReviewNotes("");
      setResolutionCategory("");
      setResolutionOtherDetails("");
      setNotificationEmail("");
    }
  }, [open]);

  const { data: org } = useQuery({
    queryKey: ["close-dialog-org", ticket.organisation_id],
    enabled: Boolean(open && ticket.organisation_id),
    queryFn: async () => {
      return await fetchJson<{
        review_field_label?: string | null;
        review_field_helper_text?: string | null;
      }>(`/data/organisations/${encodeURIComponent(ticket.organisation_id ?? "")}`);
    },
  });

  const reviewLabel =
    org?.review_field_label != null && String(org.review_field_label).trim() !== ""
      ? String(org.review_field_label).trim()
      : "Review Notes";
  const reviewHelper =
    org?.review_field_helper_text != null && String(org.review_field_helper_text).trim() !== ""
      ? String(org.review_field_helper_text).trim()
      : "Add review notes before closing this ticket.";

  const handleConfirm = () => {
    if (!canConfirm) return;
    const emailTrim = notificationEmail.trim();
    onConfirm(
      remarks,
      reviewNotes,
      resolutionCategory.trim(),
      emailTrim !== "" ? emailTrim : null,
      isOtherCategory ? resolutionOtherDetails.trim() : null
    );
    setRemarks("");
    setReviewNotes("");
    setResolutionCategory("");
    setResolutionOtherDetails("");
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Close Ticket
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {canClose ? (
                <>
                  <p>
                    Are you sure you want to close ticket{" "}
                    <TicketNumberDisplay
                      ticketNumber={ticket.ticket_number}
                      organisationId={ticket.organisation_id}
                      variant="default"
                    />
                    ?
                  </p>
                  <p>
                    This will mark the ticket as{" "}
                    <Badge className="bg-green-100 text-green-800 border-0">RESOLVED</Badge> and
                    finalize the ticket lifecycle. This action indicates that the issue has been
                    verified and resolved.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="close-resolution-category">Issue Type *</Label>
                    <Select
                      value={resolutionCategory}
                      onValueChange={(value) => {
                        setResolutionCategory(value);
                        if (value !== RESOLUTION_CATEGORY_OTHER) {
                          setResolutionOtherDetails("");
                        }
                      }}
                    >
                      <SelectTrigger id="close-resolution-category">
                        <SelectValue placeholder="Select issue type" />
                      </SelectTrigger>
                      <SelectContent>
                        {resolutionCategoryOptions.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                        <SelectItem value={RESOLUTION_CATEGORY_OTHER}>Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {isOtherCategory && (
                    <div className="space-y-2">
                      <Label htmlFor="close-resolution-other">Specify Issue Type *</Label>
                      <Textarea
                        id="close-resolution-other"
                        placeholder="Enter issue type details..."
                        value={resolutionOtherDetails}
                        onChange={(e) => setResolutionOtherDetails(e.target.value)}
                        className={`min-h-[80px] whitespace-pre-wrap ${!resolutionOtherDetails.trim() ? "border-destructive/80" : ""}`}
                        required
                      />
                      {!resolutionOtherDetails.trim() && (
                        <p className="text-xs text-destructive">
                          Details are required when Other is selected.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="close-remarks">Verification remarks (optional)</Label>
                    <Textarea
                      id="close-remarks"
                      placeholder="Notes for the client..."
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className="min-h-[80px] whitespace-pre-wrap"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="close-review-notes">{reviewLabel}</Label>
                    <Textarea
                      id="close-review-notes"
                      placeholder={reviewHelper}
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      className="min-h-[100px] whitespace-pre-wrap"
                    />
                    <p className="text-xs text-muted-foreground">{reviewHelper}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="close-notification-email">Additional notify email (optional)</Label>
                    <Input
                      id="close-notification-email"
                      type="text"
                      autoComplete="email"
                      placeholder="name@company.com or a@x.com, b@y.com"
                      value={notificationEmail}
                      onChange={(e) => setNotificationEmail(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      If provided, sent as resolution email in addition to the ticket reporter address (deduplicated).
                      You can use comma-separated addresses in one field if needed.
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800">Cannot Close This Ticket</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Tickets can only be closed when they are in <strong>ON_SITE</strong> or{" "}
                      <strong>RESOLVED_PENDING_VERIFICATION</strong> status.
                    </p>
                    <p className="text-sm text-amber-700 mt-2">
                      Current status: <Badge variant="outline">{ticket.status}</Badge>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          {canClose && (
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isPending || !canConfirm}
              className="bg-green-600 hover:bg-green-700"
            >
              {isPending ? "Closing…" : "Close Ticket"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
