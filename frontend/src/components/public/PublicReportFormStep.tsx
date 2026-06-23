import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { COMPLAINT_CATEGORIES, ISSUE_TYPES } from "@/constants/complaintCategories";
import {
  PublicAttachmentPicker,
  filesToAttachmentMeta,
} from "@/components/public/PublicAttachmentPicker";
import {
  submitPublicComplaint,
  validatePublicSession,
  patchPublicSessionProfile,
} from "@/lib/publicComplaintApi";
import { PublicRequestError } from "@/lib/backendDataApi";
import {
  publicComplaintFormSchema,
  formatPublicZodError,
  type PublicComplaintFormValues,
} from "@/lib/publicComplaintValidation";
import {
  buildDefaultLocation,
  formatMobileDisplay,
  mergePublicReportSession,
  saveFormDraftAutosave,
  type PublicComplaintFormDraft,
  type PublicReportSession,
  type PublicSubmitSuccess,
} from "@/lib/publicReportSession";
import { toast } from "@/hooks/use-toast";

type PublicReportFormStepProps = {
  session: PublicReportSession;
  submitEnabled: boolean;
  onSubmitSuccess: (result: PublicSubmitSuccess) => void;
  /** Phase 5 draft-only path when submit is disabled. */
  onDraftComplete: (session: PublicReportSession) => void;
  onSessionExpired: () => void;
};

function msUntil(iso: string | undefined): number {
  if (!iso) return 0;
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

function formatCountdown(ms: number): string {
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function draftFromSession(session: PublicReportSession): PublicComplaintFormValues {
  const d = session.formDraft;
  const ctx = session.complaintPointContext;
  return {
    reporter_name: d?.reporter_name ?? session.reporterName ?? "",
    category: d?.category ?? ctx.defaults.category ?? "",
    issue_type: d?.issue_type ?? ctx.defaults.issue_type ?? "",
    custom_category: d?.custom_category ?? "",
    custom_issue_type: d?.custom_issue_type ?? "",
    description: d?.description ?? "",
    location: d?.location ?? buildDefaultLocation(ctx),
    vehicle_number: d?.vehicle_number ?? "",
    complaint_id: d?.complaint_id ?? "",
  };
}

export function PublicReportFormStep({
  session,
  submitEnabled,
  onSubmitSuccess,
  onDraftComplete,
  onSessionExpired,
}: PublicReportFormStepProps) {
  const [form, setForm] = useState(() => draftFromSession(session));
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [submitPending, setSubmitPending] = useState(false);
  const [validating, setValidating] = useState(true);
  const [verificationMs, setVerificationMs] = useState(() =>
    msUntil(session.verificationExpiresAt)
  );

  const setField = <K extends keyof PublicComplaintFormValues>(
    key: K,
    value: PublicComplaintFormValues[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const runValidate = async (): Promise<boolean> => {
    const token = session.verificationToken;
    if (!token) {
      onSessionExpired();
      return false;
    }
    try {
      const res = await validatePublicSession(token);
      mergePublicReportSession(session.publicToken, {
        verificationExpiresAt: res.verification_expires_at,
        mobileLast4: res.mobile_last4 ?? undefined,
      });
      setVerificationMs(msUntil(res.verification_expires_at));
      return true;
    } catch {
      onSessionExpired();
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setValidating(true);
      const ok = await runValidate();
      if (!cancelled) setValidating(false);
      if (!ok && !cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setVerificationMs(msUntil(session.verificationExpiresAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [session.verificationExpiresAt]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void runValidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => void runValidate(), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.verificationToken]);

  useEffect(() => {
    if (verificationMs <= 0 && session.verificationExpiresAt) {
      onSessionExpired();
    }
  }, [verificationMs, session.verificationExpiresAt, onSessionExpired]);

  useEffect(() => {
    if (!session.verificationToken) return;
    const handle = window.setTimeout(() => {
      saveFormDraftAutosave(session.publicToken, {
        reporter_name: form.reporter_name,
        category: form.category,
        issue_type: form.issue_type,
        custom_category: form.custom_category,
        custom_issue_type: form.custom_issue_type,
        description: form.description,
        location: form.location,
        vehicle_number: form.vehicle_number,
        complaint_id: form.complaint_id,
        attachment_meta: filesToAttachmentMeta(imageFiles),
      });
    }, 800);
    return () => window.clearTimeout(handle);
  }, [form, imageFiles, session.publicToken, session.verificationToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = publicComplaintFormSchema.safeParse(form);
    if (!parsed.success) {
      toast({
        title: "Please fix the form",
        description: formatPublicZodError(parsed.error),
        variant: "destructive",
      });
      return;
    }
    const token = session.verificationToken;
    if (!token) {
      onSessionExpired();
      return;
    }
    setSubmitPending(true);
    try {
      const ok = await runValidate();
      if (!ok) return;

      await patchPublicSessionProfile(token, parsed.data.reporter_name);

      if (!submitEnabled) {
        const effectiveCategory =
          parsed.data.category === "Other"
            ? parsed.data.custom_category.trim()
            : parsed.data.category;
        const effectiveIssueType =
          parsed.data.issue_type === "Other"
            ? parsed.data.custom_issue_type.trim()
            : parsed.data.issue_type;

        const draft: PublicComplaintFormDraft = {
          reporter_name: parsed.data.reporter_name,
          category: effectiveCategory,
          issue_type: effectiveIssueType,
          custom_category: parsed.data.custom_category,
          custom_issue_type: parsed.data.custom_issue_type,
          description: parsed.data.description,
          location: parsed.data.location.trim(),
          vehicle_number: parsed.data.vehicle_number,
          complaint_id: parsed.data.complaint_id,
          attachment_meta: filesToAttachmentMeta(imageFiles),
        };

        const next = mergePublicReportSession(session.publicToken, {
          reporterName: parsed.data.reporter_name,
          formDraft: draft,
        });
        if (next) onDraftComplete(next);
        return;
      }

      const res = await submitPublicComplaint(token, parsed.data);
      const complaintId = parsed.data.complaint_id.trim() || null;

      onSubmitSuccess({
        ticket_number: res.ticket_number,
        complaint_id: complaintId,
        reporter_name: parsed.data.reporter_name,
        submitted_at: new Date().toISOString(),
        status: res.status,
        idempotent: res.idempotent,
      });
    } catch (err) {
      if (err instanceof PublicRequestError) {
        const code = err.code ?? "";
        if (code === "COMPLAINT_ID_EXISTS") {
          toast({
            title: "Complaint ID already exists",
            description: err.ticket_number
              ? `Existing ticket: ${err.ticket_number}. Use a different reference or contact support.`
              : err.message,
            variant: "destructive",
          });
          return;
        }
        if (
          code === "SESSION_EXPIRED" ||
          code === "SESSION_INVALID" ||
          err.status === 410 ||
          err.status === 401
        ) {
          onSessionExpired();
          return;
        }
        if (code === "SESSION_LOCKED" || err.status === 423) {
          toast({
            title: "Verification locked",
            description: err.message,
            variant: "destructive",
          });
          return;
        }
        if (err.status >= 500) {
          toast({
            title: "Could not submit",
            description: "Something went wrong. Please try again in a moment.",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Could not submit",
          description: err.message,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Could not submit",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitPending(false);
    }
  };

  if (validating) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Checking your session…
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Complaint details</CardTitle>
          <CardDescription>
            Mobile {formatMobileDisplay(session.mobileLast4)} · Complete within{" "}
            {formatCountdown(verificationMs)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {verificationMs < 5 * 60 * 1000 && verificationMs > 0 && (
            <Alert>
              <AlertDescription>
                Your session expires in {formatCountdown(verificationMs)}. Submit soon.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="reporter_name">Your name</Label>
            <Input
              id="reporter_name"
              value={form.reporter_name}
              onChange={(e) => setField("reporter_name", e.target.value)}
              autoComplete="name"
              disabled={submitPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) => setField("category", v)}
              disabled={submitPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {COMPLAINT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.category === "Other" && (
              <Input
                placeholder="Specify category"
                value={form.custom_category}
                onChange={(e) => setField("custom_category", e.target.value)}
                disabled={submitPending}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Issue type</Label>
            <Select
              value={form.issue_type}
              onValueChange={(v) => setField("issue_type", v)}
              disabled={submitPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select issue type" />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.issue_type === "Other" && (
              <Input
                placeholder="Specify issue type"
                value={form.custom_issue_type}
                onChange={(e) => setField("custom_issue_type", e.target.value)}
                disabled={submitPending}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => setField("location", e.target.value)}
              disabled={submitPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              disabled={submitPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicle_number">Vehicle number (optional)</Label>
            <Input
              id="vehicle_number"
              value={form.vehicle_number}
              onChange={(e) => setField("vehicle_number", e.target.value)}
              disabled={submitPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="complaint_id">Reference ID (optional)</Label>
            <Input
              id="complaint_id"
              value={form.complaint_id}
              onChange={(e) => setField("complaint_id", e.target.value)}
              disabled={submitPending}
            />
          </div>

          <PublicAttachmentPicker
            files={imageFiles}
            onChange={setImageFiles}
            disabled={submitPending}
          />

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={submitPending}
          >
            {submitPending
              ? submitEnabled
                ? "Submitting…"
                : "Saving…"
              : submitEnabled
                ? "Submit complaint"
                : "Save and continue"}
          </Button>
          {!submitEnabled && (
            <p className="text-center text-xs text-muted-foreground">
              Ticket submission is not enabled. Your details are saved locally only.
            </p>
          )}
          {submitEnabled && (
            <p className="text-center text-xs text-muted-foreground">
              Submitting creates a support ticket. Photo upload will be available in a future
              update.
            </p>
          )}
        </CardContent>
      </Card>
    </form>
  );
}
