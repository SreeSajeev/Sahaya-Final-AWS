/**
 * CloseTicketDialog.tsx
 *
 * Confirmation dialog for Service Manager to close/resolve a ticket.
 * Loads Client notification recipients (same aggregation as rejection) with
 * checkboxes; optional Additional Emails field for new addresses.
 */

import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Ticket, TicketStatus } from "@/lib/types";
import { TicketNumberDisplay } from "@/components/common/TicketNumberDisplay";
import {
  RESOLUTION_CATEGORY_OTHER,
} from "@/constants/complaintCategories";
import { useOrgTicketConfigForClose } from "@/hooks/useOrgTicketConfigForClose";
import { fetchJson } from "@/lib/backendDataApi";
import { listResolutionLocations, type ResolutionLocation } from "@/lib/resolutionLocationsApi";

type ClosureRecipient = {
  id: string;
  email: string;
  name: string | null;
  source: string;
};

type ClosureContext = {
  ticket: {
    id: string;
    ticket_number: string;
    status: string;
    client_slug: string | null;
  };
  client: { id: string | null; name: string | null; slug: string } | null;
  recipients: ClosureRecipient[];
  canClose: boolean;
  organisation?: {
    review_field_label?: string | null;
    review_field_helper_text?: string | null;
  } | null;
};

interface CloseTicketDialogProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    verificationRemarks: string,
    reviewNotes: string,
    resolutionCategory: string,
    recipients: string[],
    notificationEmail?: string | null,
    resolutionOtherDetails?: string | null,
    resolutionLocationId?: string,
    closeFormValues?: Record<string, string | number | null>
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
  return t.split(/[,;]/).every((p) => {
    const part = p.trim();
    return part.length === 0 || SINGLE_EMAIL_RE.test(part);
  });
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
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [context, setContext] = useState<ClosureContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [resolutionLocations, setResolutionLocations] = useState<ResolutionLocation[]>([]);
  const [resolutionLocationId, setResolutionLocationId] = useState("");
  const [closeFormValues, setCloseFormValues] = useState<Record<string, string | number | null>>({});

  const isOtherCategory = resolutionCategory === RESOLUTION_CATEGORY_OTHER;
  const { resolutionCategoryOptions, closeFormFields } = useOrgTicketConfigForClose({
    organisationId: ticket.organisation_id ?? null,
    enabled: open,
  });
  const canClose = CLOSEABLE_STATUSES.includes(ticket.status);
  const requiresResolutionLocation = resolutionLocations.length > 0;
  const reviewFieldLabel =
    context?.organisation?.review_field_label?.trim() || "Location";
  const reviewFieldHelperText =
    context?.organisation?.review_field_helper_text?.trim() || "";
  const canConfirm =
    canClose &&
    resolutionCategory.trim() !== "" &&
    remarks.trim() !== "" &&
    (!requiresResolutionLocation || resolutionLocationId !== "") &&
    (!isOtherCategory || resolutionOtherDetails.trim() !== "") &&
    isValidNotificationEmailField(notificationEmail) &&
    !contextLoading &&
    !contextError &&
    closeFormFields.every((field) => !field.required || String(closeFormValues[field.id] ?? "").trim() !== "");

  useEffect(() => {
    if (!open) {
      setRemarks("");
      setReviewNotes("");
      setResolutionCategory("");
      setResolutionOtherDetails("");
      setNotificationEmail("");
      setSelectedEmails(new Set());
      setContext(null);
      setContextError(null);
      setResolutionLocationId("");
      setCloseFormValues({});
      return;
    }

    let cancelled = false;
    (async () => {
      setContextLoading(true);
      setContextError(null);
      try {
        const data = await fetchJson<ClosureContext>(`/tickets/${ticket.id}/closure-context`);
        if (cancelled) return;
        setContext(data);
        const emails = (data.recipients ?? []).map((r) => r.email);
        setSelectedEmails(new Set(emails));
        setResolutionLocations(await listResolutionLocations(true));
        const existingLocId = (ticket as { resolution_location_id?: string | null }).resolution_location_id;
        if (existingLocId && String(existingLocId).trim()) {
          setResolutionLocationId(String(existingLocId).trim());
        }
      } catch (err) {
        if (cancelled) return;
        setContextError(err instanceof Error ? err.message : "Failed to load closure recipients");
      } finally {
        if (!cancelled) setContextLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, ticket.id, ticket.resolution_location_id]);

  const feAttendedLocationName =
    (ticket as { resolution_location_name?: string | null }).resolution_location_name?.trim() || "";

  const toggleEmail = (email: string, checked: boolean) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (checked) next.add(email);
      else next.delete(email);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    const emailTrim = notificationEmail.trim();
    onConfirm(
      remarks,
      reviewNotes,
      resolutionCategory.trim(),
      Array.from(selectedEmails),
      emailTrim !== "" ? emailTrim : null,
      isOtherCategory ? resolutionOtherDetails.trim() : null,
      resolutionLocationId.trim() !== "" ? resolutionLocationId : undefined,
      closeFormValues
    );
  };

  const recipients = context?.recipients ?? [];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
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

                  {contextLoading ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading Client contacts…
                    </div>
                  ) : contextError ? (
                    <p className="text-sm text-destructive">{contextError}</p>
                  ) : (
                    <>
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
                        <Label htmlFor="close-remarks">Resolution Remarks *</Label>
                        <Textarea
                          id="close-remarks"
                          placeholder="Describe how the issue was resolved…"
                          value={remarks}
                          onChange={(e) => setRemarks(e.target.value)}
                          className={`min-h-[80px] whitespace-pre-wrap ${!remarks.trim() ? "border-destructive/80" : ""}`}
                          required
                        />
                        {!remarks.trim() ? (
                          <p className="text-xs text-destructive">Resolution remarks are required.</p>
                        ) : null}
                        {reviewFieldHelperText ? (
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap rounded-md border border-dashed p-2 bg-muted/30">
                            {reviewFieldHelperText}
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        {feAttendedLocationName ? (
                          <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2 bg-muted/20">
                            Field Executive selected: <strong>{feAttendedLocationName}</strong>.
                            Confirm or change the attended location below.
                          </p>
                        ) : null}
                        <Label htmlFor="close-resolution-location">
                          Resolution Location{requiresResolutionLocation ? " *" : ""}
                        </Label>
                        {resolutionLocations.length === 0 ? (
                          <p className="text-sm text-amber-800 rounded-md border border-amber-200 bg-amber-50/70 p-3">
                            No active resolution locations are configured for this organisation.
                            Closing will proceed without an attended-location snapshot. Add locations
                            under Data → Resolution Locations to make this mandatory.
                          </p>
                        ) : (
                          <Select value={resolutionLocationId} onValueChange={setResolutionLocationId}>
                            <SelectTrigger id="close-resolution-location">
                              <SelectValue placeholder="Select attended location" />
                            </SelectTrigger>
                            <SelectContent>
                              {resolutionLocations.map((location) => (
                                <SelectItem key={location.id} value={location.id}>
                                  {location.name}{location.code ? ` (${location.code})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="close-review-notes">{reviewFieldLabel}</Label>
                        <Textarea
                          id="close-review-notes"
                          placeholder={`Optional ${reviewFieldLabel.toLowerCase()} note for this closure`}
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          className="min-h-[100px] whitespace-pre-wrap"
                        />
                        <p className="text-xs text-muted-foreground">
                          Optional note stored with the ticket; does not replace the reported site location.
                        </p>
                      </div>
                      {closeFormFields.map((field) => {
                        const value = closeFormValues[field.id] ?? "";
                        const setValue = (next: string) =>
                          setCloseFormValues((current) => ({
                            ...current,
                            [field.id]: field.fieldType === "number" && next !== "" ? Number(next) : next || null,
                          }));
                        return (
                          <div key={field.id} className="space-y-2">
                            <Label htmlFor={`close-form-${field.id}`}>
                              {field.label}{field.required ? " *" : ""}
                            </Label>
                            {field.fieldType === "textarea" ? (
                              <Textarea id={`close-form-${field.id}`} placeholder={field.placeholder} value={String(value)} onChange={(e) => setValue(e.target.value)} />
                            ) : field.fieldType === "dropdown" ? (
                              <Select value={String(value)} onValueChange={setValue}>
                                <SelectTrigger id={`close-form-${field.id}`}><SelectValue placeholder={field.placeholder || `Select ${field.label}`} /></SelectTrigger>
                                <SelectContent>{(field.options ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                              </Select>
                            ) : (
                              <Input id={`close-form-${field.id}`} type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"} placeholder={field.placeholder} value={String(value)} onChange={(e) => setValue(e.target.value)} />
                            )}
                          </div>
                        );
                      })}

                      <div className="space-y-2">
                        <Label>Recipients</Label>
                        {recipients.length === 0 ? (
                          <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                            No email contacts are configured for this client. You can still close the
                            ticket, or add addresses under Additional Emails.
                          </p>
                        ) : (
                          <ul className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                            {recipients.map((r) => {
                              const checked = selectedEmails.has(r.email);
                              return (
                                <li key={r.id} className="flex items-start gap-2">
                                  <Checkbox
                                    id={`close-rcpt-${r.id}`}
                                    checked={checked}
                                    onCheckedChange={(v) => toggleEmail(r.email, v === true)}
                                    disabled={isPending}
                                  />
                                  <label
                                    htmlFor={`close-rcpt-${r.id}`}
                                    className="text-sm leading-tight cursor-pointer text-foreground"
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

                      <div className="space-y-2">
                        <Label htmlFor="close-notification-email">Additional Emails</Label>
                        <Input
                          id="close-notification-email"
                          type="text"
                          autoComplete="email"
                          placeholder="name@company.com or a@x.com, b@y.com"
                          value={notificationEmail}
                          onChange={(e) => setNotificationEmail(e.target.value)}
                          disabled={isPending}
                        />
                        <p className="text-xs text-muted-foreground">
                          Optional. Manually typed addresses are merged with selected recipients
                          (duplicates removed). Use comma or semicolon to separate multiple.
                        </p>
                        {notificationEmail.trim() !== "" &&
                          !isValidNotificationEmailField(notificationEmail) && (
                            <p className="text-xs text-destructive">
                              One or more additional emails have an invalid format.
                            </p>
                          )}
                      </div>
                    </>
                  )}
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
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
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
