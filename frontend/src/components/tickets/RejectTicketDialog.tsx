/**
 * RejectTicketDialog.tsx
 *
 * Manager rejection workflow:
 * - required rejection reason
 * - Client contact recipient checkboxes
 * - optional FE proof selection OR fresh manager photo upload
 */

import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { XCircle, Loader2 } from "lucide-react";
import { Ticket } from "@/lib/types";
import { TicketNumberDisplay } from "@/components/common/TicketNumberDisplay";
import { fetchJson } from "@/lib/backendDataApi";

export type RejectEvidenceRef = {
  commentId: string;
  proofIndex: number;
} | null;

export type RejectEvidenceUpload = {
  contentType: string;
  filename: string;
  dataBase64: string;
} | null;

type RejectionRecipient = {
  id: string;
  email: string;
  name: string | null;
  source: string;
};

type EvidenceOption = {
  id: string;
  commentId: string;
  proofIndex: number;
  label: string;
  createdAt: string | null;
};

type RejectionContext = {
  ticket: {
    id: string;
    ticket_number: string;
    status: string;
    issue_type: string | null;
    category: string | null;
    location: string | null;
    client_slug: string | null;
  };
  client: { id: string | null; name: string | null; slug: string } | null;
  recipients: RejectionRecipient[];
  evidenceOptions: EvidenceOption[];
  canReject: boolean;
};

interface RejectTicketDialogProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: {
    reason: string;
    recipients: string[];
    evidence: RejectEvidenceRef;
    evidenceUpload: RejectEvidenceUpload;
  }) => void;
  isPending: boolean;
}

const REJECTABLE = new Set(["OPEN", "NEEDS_REVIEW"]);
const ALLOWED_UPLOAD_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type PhotoMode = "none" | "fe" | "upload";

export function RejectTicketDialog({
  ticket,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: RejectTicketDialogProps) {
  const [reason, setReason] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [photoMode, setPhotoMode] = useState<PhotoMode>("none");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadPayload, setUploadPayload] = useState<RejectEvidenceUpload>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [context, setContext] = useState<RejectionContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canReject = REJECTABLE.has(ticket.status);
  const reasonOk = reason.trim().length > 0 && reason.trim().length <= 1000;
  const canConfirm = canReject && reasonOk && !isPending && !contextLoading && !uploadError;

  useEffect(() => {
    if (!open) {
      setReason("");
      setSelectedEmails(new Set());
      setSelectedEvidenceId(null);
      setPhotoMode("none");
      setUploadPreview(null);
      setUploadPayload(null);
      setUploadError(null);
      setContext(null);
      setContextError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setContextLoading(true);
      setContextError(null);
      try {
        const data = await fetchJson<RejectionContext>(
          `/tickets/${ticket.id}/rejection-context`
        );
        if (cancelled) return;
        setContext(data);
        const emails = (data.recipients ?? []).map((r) => r.email);
        setSelectedEmails(new Set(emails));
      } catch (err) {
        if (cancelled) return;
        setContextError(err instanceof Error ? err.message : "Failed to load rejection context");
      } finally {
        if (!cancelled) setContextLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, ticket.id]);

  const toggleEmail = (email: string, checked: boolean) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (checked) next.add(email);
      else next.delete(email);
      return next;
    });
  };

  const clearUpload = () => {
    setUploadPreview(null);
    setUploadPayload(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const ct = (file.type || "").toLowerCase();
    if (!ALLOWED_UPLOAD_TYPES.has(ct)) {
      setUploadError("Use JPEG, PNG, or WebP only.");
      clearUpload();
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("Photo must be 4 MB or smaller.");
      clearUpload();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const match = result.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        setUploadError("Could not read image.");
        clearUpload();
        return;
      }
      setUploadPreview(result);
      setUploadPayload({
        contentType: ct === "image/jpg" ? "image/jpeg" : ct,
        filename: file.name || "rejection-photo.jpg",
        dataBase64: match[2],
      });
      setPhotoMode("upload");
      setSelectedEvidenceId(null);
    };
    reader.onerror = () => {
      setUploadError("Could not read image.");
      clearUpload();
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = (e: MouseEvent) => {
    e.preventDefault();
    if (!canConfirm) return;
    const evidenceOpt =
      photoMode === "fe"
        ? context?.evidenceOptions?.find((o) => o.id === selectedEvidenceId)
        : undefined;
    onConfirm({
      reason: reason.trim(),
      recipients: Array.from(selectedEmails),
      evidence:
        photoMode === "fe" && evidenceOpt
          ? { commentId: evidenceOpt.commentId, proofIndex: evidenceOpt.proofIndex }
          : null,
      evidenceUpload: photoMode === "upload" ? uploadPayload : null,
    });
  };

  const clientLabel = context?.client?.name?.trim() || ticket.client_slug || "—";
  const recipients = context?.recipients ?? [];
  const evidenceOptions = context?.evidenceOptions ?? [];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Reject Ticket
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                Ticket:{" "}
                <TicketNumberDisplay
                  ticketNumber={ticket.ticket_number}
                  organisationId={ticket.organisation_id}
                  variant="compact"
                />
              </p>
              <p>Client: {clientLabel}</p>
              <p>Issue Type: {ticket.issue_type?.trim() || "—"}</p>
              <p className="pt-1">
                This moves the ticket to terminal status <strong>REJECTED</strong>, records the
                reason, and optionally emails selected Client contacts.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {contextLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Client contacts…
          </div>
        ) : contextError ? (
          <p className="text-sm text-destructive">{contextError}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Rejection Reason *</Label>
              <Textarea
                id="reject-reason"
                placeholder="Explain why this ticket is being rejected…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[100px]"
                maxLength={1000}
                disabled={isPending}
              />
              {reason.trim().length === 0 ? (
                <p className="text-xs text-destructive">Rejection reason is required.</p>
              ) : (
                <p className="text-xs text-muted-foreground">{reason.trim().length}/1000</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Send rejection email to</Label>
              {recipients.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                  No email contacts are configured for this client. The ticket can still be
                  rejected, but no rejection email will be sent.
                </p>
              ) : (
                <ul className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {recipients.map((r) => {
                    const checked = selectedEmails.has(r.email);
                    return (
                      <li key={r.id} className="flex items-start gap-2">
                        <Checkbox
                          id={`reject-rcpt-${r.id}`}
                          checked={checked}
                          onCheckedChange={(v) => toggleEmail(r.email, v === true)}
                          disabled={isPending}
                        />
                        <label
                          htmlFor={`reject-rcpt-${r.id}`}
                          className="text-sm leading-tight cursor-pointer"
                        >
                          {r.name?.trim() ? (
                            <>
                              <span className="font-medium">{r.name.trim()}</span>
                              {" — "}
                            </>
                          ) : null}
                          <span className="text-muted-foreground">{r.email}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <Label>Rejection Photo (optional)</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={photoMode === "none" ? "default" : "outline"}
                  disabled={isPending}
                  onClick={() => {
                    setPhotoMode("none");
                    setSelectedEvidenceId(null);
                    clearUpload();
                  }}
                >
                  No photo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={photoMode === "fe" ? "default" : "outline"}
                  disabled={isPending || evidenceOptions.length === 0}
                  onClick={() => {
                    setPhotoMode("fe");
                    clearUpload();
                  }}
                >
                  Select FE proof
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={photoMode === "upload" ? "default" : "outline"}
                  disabled={isPending}
                  onClick={() => {
                    setPhotoMode("upload");
                    setSelectedEvidenceId(null);
                  }}
                >
                  Upload photo
                </Button>
              </div>

              {photoMode === "fe" && (
                <ul className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-3">
                  {evidenceOptions.map((opt) => (
                    <li key={opt.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`reject-ev-${opt.id}`}
                        checked={selectedEvidenceId === opt.id}
                        onCheckedChange={(v) => {
                          setSelectedEvidenceId(v === true ? opt.id : null);
                        }}
                        disabled={isPending}
                      />
                      <label htmlFor={`reject-ev-${opt.id}`} className="text-sm cursor-pointer">
                        {opt.label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              {photoMode === "upload" && (
                <div className="space-y-2 rounded-md border p-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onFileChange}
                    disabled={isPending}
                    className="block w-full text-sm"
                  />
                  <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP · max 4 MB</p>
                  {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
                  {uploadPreview && (
                    <div className="space-y-2">
                      <img
                        src={uploadPreview}
                        alt="Rejection photo preview"
                        className="max-h-40 rounded border object-contain"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={clearUpload}
                      >
                        Remove photo
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm || Boolean(contextError)}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isPending ? "Rejecting…" : "Reject Ticket"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
