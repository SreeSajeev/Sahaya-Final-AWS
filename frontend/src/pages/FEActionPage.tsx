import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { fetchPublicJson, postFeProofPublic } from "@/lib/backendDataApi";

export default function FEActionPage() {
  const { tokenId } = useParams<{ tokenId: string }>();

  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState<any>(null);
  const [ticket, setTicket] = useState<any>(null);
  /** On-site/resolution proof images only (≤5); video is tracked separately — no base64 video in payload. */
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  /** At most one video; metadata only forwarded until backend accepts uploads. */
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [remarks, setRemarks] = useState("");
  const [resolutionOutcome, setResolutionOutcome] = useState<"SUCCESS" | "FAILED">("SUCCESS");
  const [failureReason, setFailureReason] = useState("");
  const [submitPending, setSubmitPending] = useState(false);
  const [geoFetching, setGeoFetching] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const MAX_PROOF_IMAGES = 5;

  /* ================= LOAD TOKEN + TICKET ================= */
  useEffect(() => {
    const load = async () => {
      if (!tokenId) {
        setLoading(false);
        return;
      }

      try {
        setLoadError(null);
        const ctx = await fetchPublicJson<{ token: Record<string, unknown>; ticket: Record<string, unknown> }>(
          `/fe/action/${encodeURIComponent(tokenId)}/context`
        );
        setToken(ctx.token);
        setTicket(ctx.ticket);
      } catch (err) {
        console.error("LOAD FAILED:", err);
        setLoadError("Unable to load ticket details.\nPlease contact the support team.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tokenId]);

  const toBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });

  type ProofGeo = {
    lat: number;
    lng: number;
    accuracy: number;
    captured_at: string;
  };

  const fetchProofGeoOptional = (): Promise<ProofGeo | null> =>
    new Promise<ProofGeo | null>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve(null);
        return;
      }

      const timeoutMs = 3500;
      let didFinish = false;

      const timeoutId = window.setTimeout(() => {
        if (didFinish) return;
        didFinish = true;
        resolve(null);
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (didFinish) return;
          didFinish = true;
          window.clearTimeout(timeoutId);
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            captured_at: new Date().toISOString(),
          });
        },
        () => {
          if (didFinish) return;
          didFinish = true;
          window.clearTimeout(timeoutId);
          resolve(null);
        },
        {
          enableHighAccuracy: false,
          maximumAge: 0,
          timeout: timeoutMs,
        }
      );
    });

  /* ================= SUBMIT PROOF ================= */
  const handleSubmit = async () => {
    if (!token || !ticket) {
      toast({ title: "Missing token or ticket" });
      return;
    }

    if (ticket.status === "REJECTED") {
      toast({ title: "Ticket rejected — action not allowed", variant: "destructive" });
      return;
    }

    const isResolution = token.action_type === "RESOLUTION";

    if (isResolution) {
      if (resolutionOutcome === "FAILED") {
        if (!failureReason.trim()) {
          toast({ title: "Please provide a reason for failure", variant: "destructive" });
          return;
        }
      } else {
        if (imageFiles.length === 0) {
          toast({ title: "Please upload at least one photo for resolution proof" });
          return;
        }
      }
    } else {
      if (imageFiles.length === 0) {
        toast({ title: "Please upload at least one photo" });
        return;
      }
    }

    // Safety: keep request payload size within backend body-parser limit (10mb).
    // We approximate base64 overhead ~= 1.33x and reject if the combined payload is likely to exceed the limit.
    const MAX_TOTAL_BASE64_BYTES = 9 * 1024 * 1024; // keep room for JSON overhead
    if (imageFiles.length > MAX_PROOF_IMAGES) {
      toast({ title: `Please upload up to ${MAX_PROOF_IMAGES} images`, variant: "destructive" });
      return;
    }
    const approxTotalBase64Bytes = imageFiles.reduce(
      (sum, f) => sum + Math.ceil(f.size * (4 / 3)),
      0
    );
    if (approxTotalBase64Bytes > MAX_TOTAL_BASE64_BYTES) {
      toast({
        title: "Images too large",
        description: "Please upload fewer images or smaller images (to stay within the 10MB upload limit).",
        variant: "destructive",
      });
      return;
    }

    setSubmitPending(true);
    try {
      setGeoMessage(null);
      setGeoFetching(true);

      // Capture geolocation in parallel so we don't delay submission unnecessarily.
      const geoPromise = fetchProofGeoOptional().finally(() => setGeoFetching(false));

      const base64Images =
        imageFiles.length > 0 ? await Promise.all(imageFiles.map((f) => toBase64(f))) : [];
      const geo = await geoPromise;

      if (!geo && imageFiles.length > 0) {
        setGeoMessage("Location unavailable; submitting without GPS.");
      }

      const attachments =
        base64Images.length > 0
          ? {
              images: base64Images.map((b) =>
                geo
                  ? {
                      image_base64: b,
                      geo,
                    }
                  : {
                      image_base64: b,
                    }
              ),
              image_base64: base64Images[0], // legacy compatibility
              remarks,
              action_type: token.action_type,
            }
          : {};

      const body: Record<string, unknown> = {
        token: token.id,
      };
      if (isResolution) {
        body.outcome = resolutionOutcome;
        if (resolutionOutcome === "FAILED") body.failure_reason = failureReason.trim();
      }

      // Attach proofs only when images were actually selected.
      if (base64Images.length > 0) {
        body.attachments = {
          ...attachments,
          action_type: isResolution ? "RESOLUTION" : "ON_SITE",
        };
      }

      /** Forward-only metadata for a selected video — no binary (avoids oversized JSON). Backend may ignore until upload API exists. */
      if (videoFile) {
        body.video_attachment_meta = {
          filename: videoFile.name,
          byte_size: videoFile.size,
          mime_type: videoFile.type || "application/octet-stream",
          status: "pending_multipart_upload",
        };
      }

      await postFeProofPublic(body);

      setSubmitted(true);
      toast({
        title: isResolution && resolutionOutcome === "FAILED" ? "Failed attempt recorded" : "Proof submitted successfully",
        description: "You may now close this page.",
      });
    } catch (err: any) {
      console.error("SUBMIT FAILED:", err);
      const message = String(err?.message || "");
      const tooLarge =
        message.includes("PAYLOAD_TOO_LARGE") ||
        message.includes("413") ||
        /payload too large|entity too large|request entity too large/i.test(message);
      const tooMany = message.toLowerCase().includes("too many") && message.toLowerCase().includes("image");
      toast({
        title: tooLarge
          ? "Payload too large"
          : tooMany
            ? "Too many images"
            : "Submission failed",
        description: tooLarge
          ? "The photos exceed the server upload limit (~10MB JSON). Try fewer images or smaller photos."
          : tooMany
            ? "Please upload at most 5 images."
            : message.includes("locked")
              ? "Resolution is locked. Complete on-site and upload proof first."
              : message,
        variant: "destructive",
      });
    } finally {
      setSubmitPending(false);
    }
  };

  /* ================= UI ================= */

  if (loading) {
    return <div className="p-8 text-center">Loading…</div>;
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Unable to load</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {String(loadError)
              .split("\n")
              .map((line, idx) => (
                <p key={idx} className="text-sm text-muted-foreground">
                  {line}
                </p>
              ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!token || !ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid or expired link</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Please request a new link from the support team.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6 text-center">
          <h2 className="text-lg font-semibold text-green-600">
            Proof Submitted
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            You may close this page.
          </p>
        </Card>
      </div>
    );
  }

  const isResolution = token.action_type === "RESOLUTION";
  const isResolutionLocked = isResolution && token.token_state === "LOCKED";
  const issueDescription =
    (ticket.remarks && String(ticket.remarks).trim()) ||
    (ticket.short_description && String(ticket.short_description).trim()) ||
    (ticket.description && String(ticket.description).trim()) ||
    "";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {isResolution ? "Resolution Proof Upload" : "On-Site Proof Upload"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ================= Ticket Details ================= */}
          <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
          {isResolutionLocked && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Resolution link is locked until on-site is marked and proof is uploaded successfully.
            </div>
          )}

            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">Ticket Details</div>
              <div className="text-base font-semibold">
                Ticket {ticket.ticket_number ?? "N/A"}
              </div>
            </div>

            <div className="space-y-3">
              {ticket.vehicle_number && (
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">Vehicle</div>
                  <div className="text-sm font-medium">{ticket.vehicle_number}</div>
                </div>
              )}
              {ticket.category && (
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">Category</div>
                  <div className="text-sm font-medium">{ticket.category}</div>
                </div>
              )}
              {ticket.issue_type && (
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">Issue Type</div>
                  <div className="text-sm font-medium">{ticket.issue_type}</div>
                </div>
              )}
              {ticket.location && (
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground">Location</div>
                  <div className="text-sm font-medium">{ticket.location}</div>
                </div>
              )}
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="space-y-0.5">
                <div className="text-xs text-muted-foreground">Issue Description</div>
                <div className="text-sm font-medium whitespace-pre-wrap">
                  {issueDescription || "No issue description provided."}
                </div>
              </div>

              {(ticket.opened_by_email || ticket.contact_number) && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Reported By</div>
                  {ticket.opened_by_email && (
                    <div className="text-sm font-medium break-words">{ticket.opened_by_email}</div>
                  )}
                  {ticket.contact_number && (
                    <div className="text-sm font-medium">Contact: {ticket.contact_number}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* ================= Proof Upload ================= */}
          <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">
                Upload {isResolution ? "Resolution" : "On-Site"} Proof
              </div>
              <div className="text-sm font-medium">
                {isResolution ? "Resolution proof upload" : "On-site proof upload"}
              </div>
            </div>

          {isResolution && (
            <>
              <div className="space-y-2">
                <Label>Outcome</Label>
                <RadioGroup
                  value={resolutionOutcome}
                  onValueChange={(v) => setResolutionOutcome(v as "SUCCESS" | "FAILED")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="SUCCESS" id="outcome-success" />
                    <Label htmlFor="outcome-success" className="font-normal cursor-pointer">Success (issue resolved)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="FAILED" id="outcome-failed" />
                    <Label htmlFor="outcome-failed" className="font-normal cursor-pointer">Failed (could not resolve)</Label>
                  </div>
                </RadioGroup>
              </div>
              {resolutionOutcome === "FAILED" && (
                <div className="space-y-2">
                  <Label htmlFor="failure-reason">Reason for failure *</Label>
                  <textarea
                    id="failure-reason"
                    className="w-full border rounded p-2 text-sm min-h-[80px]"
                    placeholder="Required: explain why the issue could not be resolved"
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <>
            <div className="space-y-2">
              <Label>Photos (required for proof — max {5})</Label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setImageFiles((prev) => {
                    const merged = [...prev, ...picked];
                    const seen = new Set<string>();
                    const deduped = merged.filter((f) => {
                      const k = `${f.name}:${f.size}:${f.lastModified}`;
                      if (seen.has(k)) return false;
                      seen.add(k);
                      return true;
                    });
                    return deduped.slice(0, MAX_PROOF_IMAGES);
                  });
                  e.target.value = "";
                }}
              />
              {imageFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {imageFiles.length} image{imageFiles.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Video (optional — max 1, not uploaded yet)</Label>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setVideoFile(f ?? null);
                  e.target.value = "";
                }}
              />
              {videoFile && (
                <p className="text-xs text-muted-foreground break-all">
                  {videoFile.name} ({Math.round(videoFile.size / 1024)} KB) — metadata only sent until upload API ships.
                </p>
              )}
            </div>
            {geoFetching && (
              <p className="text-xs text-muted-foreground">Fetching location…</p>
            )}
            {!geoFetching && geoMessage && (
              <p className="text-xs text-destructive">{geoMessage}</p>
            )}
            <textarea
              className="w-full border rounded p-2 text-sm"
              placeholder={isResolution ? "Optional remarks" : "Optional remarks"}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </>

          <Button className="w-full" onClick={handleSubmit} disabled={submitPending || isResolutionLocked}>
            {submitPending ? "Submitting…" : isResolution && resolutionOutcome === "FAILED" ? "Report Failed Attempt" : "Submit Proof"}
          </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
