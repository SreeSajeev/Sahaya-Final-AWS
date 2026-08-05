import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useParams } from "react-router-dom";
import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { fetchPublicJson, postFeProofPublic } from "@/lib/backendDataApi";
import {
  approxBase64Bytes,
  compressProofImage,
  formatBytes,
  MAX_PROOF_IMAGES,
  PROOF_UPLOAD_BUDGET_BYTES,
} from "@/lib/compressProofImage";
import { ProofImageViewerOverlay } from "@/components/tickets/ProofImageViewerOverlay";
import { cn } from "@/lib/utils";

type ProofImageItem = {
  id: string;
  file: File;
  previewUrl: string;
};

type SubmitPhase = "idle" | "preparing" | "location" | "uploading";

function fileKey(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

type FeActionTokenContext = {
  action_type?: string;
  expires_at?: string;
  [key: string]: unknown;
};

type FeActionTicketContext = {
  ticket_number?: string;
  vehicle_number?: string;
  location?: string;
  status?: string;
  [key: string]: unknown;
};

export default function FEActionPage() {
  const { tokenId } = useParams<{ tokenId: string }>();

  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState<FeActionTokenContext | null>(null);
  const [ticket, setTicket] = useState<FeActionTicketContext | null>(null);
  /** On-site/resolution proof images only (≤MAX_PROOF_IMAGES); video is tracked separately — no base64 video in payload. */
  const [proofImages, setProofImages] = useState<ProofImageItem[]>([]);
  /** At most one video; metadata only forwarded until backend accepts uploads. */
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [remarks, setRemarks] = useState("");
  const [resolutionOutcome, setResolutionOutcome] = useState<"SUCCESS" | "FAILED">("SUCCESS");
  const [failureReason, setFailureReason] = useState("");
  const [submitPending, setSubmitPending] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [geoFetching, setGeoFetching] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [pickingPhotos, setPickingPhotos] = useState(false);
  const [previewViewerOpen, setPreviewViewerOpen] = useState(false);
  const [previewViewerIndex, setPreviewViewerIndex] = useState(0);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const proofImagesRef = useRef(proofImages);
  proofImagesRef.current = proofImages;

  const imageFiles = useMemo(() => proofImages.map((p) => p.file), [proofImages]);

  const usedBudgetBytes = useMemo(
    () => imageFiles.reduce((sum, f) => sum + approxBase64Bytes(f), 0),
    [imageFiles]
  );
  const budgetPct = Math.min(100, Math.round((usedBudgetBytes / PROOF_UPLOAD_BUDGET_BYTES) * 100));
  const budgetWarning = budgetPct >= 80;
  const budgetExceeded = usedBudgetBytes > PROOF_UPLOAD_BUDGET_BYTES;

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

  /* Revoke preview object URLs on unmount (ref avoids stale empty closure). */
  useEffect(() => {
    return () => {
      proofImagesRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

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

  const addProofFiles = async (picked: File[]) => {
    if (picked.length === 0) return;

    const slotsLeft = MAX_PROOF_IMAGES - proofImages.length;
    if (slotsLeft <= 0) {
      toast({
        title: `Maximum ${MAX_PROOF_IMAGES} photos`,
        description: "Remove a photo before adding more.",
        variant: "destructive",
      });
      return;
    }

    const imagesOnly = picked.filter((f) => f.type.startsWith("image/"));
    if (imagesOnly.length === 0) {
      toast({ title: "Please select image files only", variant: "destructive" });
      return;
    }

    const existingKeys = new Set(proofImages.map((p) => fileKey(p.file)));
    const unique = imagesOnly.filter((f) => !existingKeys.has(fileKey(f)));
    const candidates = unique.slice(0, slotsLeft);

    if (unique.length > slotsLeft) {
      toast({
        title: `Maximum ${MAX_PROOF_IMAGES} photos`,
        description: `Only ${slotsLeft} more photo${slotsLeft === 1 ? "" : "s"} can be added. Extra selections were ignored.`,
        variant: "destructive",
      });
    }

    if (candidates.length === 0) {
      toast({ title: "Those photos are already selected" });
      return;
    }

    setPickingPhotos(true);
    try {
      const next: ProofImageItem[] = [];
      let compressCount = 0;

      for (const raw of candidates) {
        const { file, compressed } = await compressProofImage(raw);
        if (compressed) compressCount += 1;

        // Soft per-file guard after compression (~3.5MB raw → larger base64)
        if (approxBase64Bytes(file) > PROOF_UPLOAD_BUDGET_BYTES) {
          toast({
            title: "Photo too large",
            description: `${raw.name} is still too large after compression. Try another photo.`,
            variant: "destructive",
          });
          continue;
        }

        next.push({
          id: `${fileKey(file)}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          // blob: URLs require `blob:` in CSP img-src.
          previewUrl: URL.createObjectURL(file),
        });
      }

      if (next.length === 0) return;

      setProofImages((prev) => {
        const merged = [...prev, ...next].slice(0, MAX_PROOF_IMAGES);
        const projected = merged.reduce((s, p) => s + approxBase64Bytes(p.file), 0);
        if (projected > PROOF_UPLOAD_BUDGET_BYTES) {
          // Keep previous selection; revoke new previews
          next.forEach((n) => URL.revokeObjectURL(n.previewUrl));
          toast({
            title: "Upload size budget exceeded",
            description: "Remove a photo or choose smaller images (limit ~10MB total).",
            variant: "destructive",
          });
          return prev;
        }
        return merged;
      });

      if (compressCount > 0) {
        toast({
          title: "Photos ready",
          description: `${next.length} added${compressCount ? ` (${compressCount} compressed for faster upload)` : ""}.`,
        });
      }
    } finally {
      setPickingPhotos(false);
    }
  };

  const removeProofImage = (id: string) => {
    setProofImages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const onCameraChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    await addProofFiles(picked);
  };

  const onGalleryChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    await addProofFiles(picked);
  };

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
    if (imageFiles.length > MAX_PROOF_IMAGES) {
      toast({ title: `Please upload up to ${MAX_PROOF_IMAGES} images`, variant: "destructive" });
      return;
    }
    const approxTotalBase64Bytes = imageFiles.reduce((sum, f) => sum + approxBase64Bytes(f), 0);
    if (approxTotalBase64Bytes > PROOF_UPLOAD_BUDGET_BYTES) {
      toast({
        title: "Images too large",
        description: "Please upload fewer images or smaller images (to stay within the 10MB upload limit).",
        variant: "destructive",
      });
      return;
    }

    setSubmitPending(true);
    setSubmitPhase("preparing");
    try {
      setGeoMessage(null);
      setGeoFetching(true);
      setSubmitPhase("location");

      // Capture geolocation in parallel so we don't delay submission unnecessarily.
      const geoPromise = fetchProofGeoOptional().finally(() => setGeoFetching(false));

      setSubmitPhase("preparing");
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

      setSubmitPhase("uploading");
      await postFeProofPublic(body);

      setSubmitted(true);
      toast({
        title:
          isResolution && resolutionOutcome === "FAILED"
            ? "Failed attempt recorded"
            : "Proof submitted successfully",
        description: "You may now close this page.",
      });
    } catch (err: unknown) {
      console.error("SUBMIT FAILED:", err);
      const message = String(err instanceof Error ? err.message : err || "");
      const tooLarge =
        message.includes("PAYLOAD_TOO_LARGE") ||
        message.includes("413") ||
        /payload too large|entity too large|request entity too large/i.test(message);
      const tooMany = message.toLowerCase().includes("too many") && message.toLowerCase().includes("image");
      toast({
        title: tooLarge ? "Payload too large" : tooMany ? "Too many images" : "Submission failed",
        description: tooLarge
          ? "The photos exceed the server upload limit (~10MB JSON). Try fewer images or smaller photos."
          : tooMany
            ? `Please upload at most ${MAX_PROOF_IMAGES} images.`
            : message.includes("locked")
              ? "Resolution is locked. Complete on-site and upload proof first."
              : message || "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitPending(false);
      setSubmitPhase("idle");
    }
  };

  const submitLabel = (() => {
    if (!submitPending) {
      return token?.action_type === "RESOLUTION" && resolutionOutcome === "FAILED"
        ? "Report Failed Attempt"
        : "Submit Proof";
    }
    if (submitPhase === "location") return "Getting location…";
    if (submitPhase === "uploading") return "Uploading proof…";
    return "Preparing photos…";
  })();

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
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 text-center max-w-md w-full">
          <h2 className="text-lg font-semibold text-green-600">Proof Submitted</h2>
          <p className="text-sm text-muted-foreground mt-2">You may close this page.</p>
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
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 md:items-center safe-px safe-pb pb-28 md:pb-4">
      <Card className="w-full max-w-md my-4 md:my-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg md:text-xl leading-snug">
            {isResolution ? "Resolution Proof Upload" : "On-Site Proof Upload"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 pb-6">
          {/* ================= Ticket Details ================= */}
          <div className="rounded-lg border bg-white p-3 md:p-4 shadow-sm space-y-4">
            {isResolutionLocked && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Resolution link is locked until on-site is marked and proof is uploaded successfully.
              </div>
            )}

            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">Ticket Details</div>
              <div className="text-base font-semibold">Ticket {ticket.ticket_number ?? "N/A"}</div>
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
                    className="flex flex-col gap-3 sm:flex-row sm:gap-4"
                  >
                    <div className="flex items-center space-x-2 min-h-11">
                      <RadioGroupItem value="SUCCESS" id="outcome-success" />
                      <Label htmlFor="outcome-success" className="font-normal cursor-pointer">
                        Success (issue resolved)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 min-h-11">
                      <RadioGroupItem value="FAILED" id="outcome-failed" />
                      <Label htmlFor="outcome-failed" className="font-normal cursor-pointer">
                        Failed (could not resolve)
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                {resolutionOutcome === "FAILED" && (
                  <div className="space-y-2">
                    <Label htmlFor="failure-reason">Reason for failure *</Label>
                    <textarea
                      id="failure-reason"
                      className="w-full border rounded p-3 text-base md:text-sm min-h-[96px]"
                      placeholder="Required: explain why the issue could not be resolved"
                      value={failureReason}
                      onChange={(e) => setFailureReason(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            <>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Photos {isResolution && resolutionOutcome === "FAILED" ? "(optional)" : "(required)"} — max {MAX_PROOF_IMAGES}</Label>
                  <p className="text-xs text-muted-foreground">
                    {proofImages.length} of {MAX_PROOF_IMAGES} selected
                    {pickingPhotos ? " · Optimizing…" : ""}
                  </p>
                </div>

                {/* Hidden inputs — camera prefers rear; gallery is multi-select without capture */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                  onChange={onCameraChange}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                  onChange={onGalleryChange}
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={
                      pickingPhotos ||
                      submitPending ||
                      isResolutionLocked ||
                      proofImages.length >= MAX_PROOF_IMAGES
                    }
                    onClick={() => cameraInputRef.current?.click()}
                    aria-label="Take photo with camera"
                    className={cn(
                      "flex min-h-[5.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-primary bg-primary px-3 py-4 text-center text-primary-foreground shadow-sm transition",
                      "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      "disabled:pointer-events-none disabled:opacity-50",
                    )}
                  >
                    {pickingPhotos ? (
                      <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
                    ) : (
                      <Camera className="h-7 w-7" aria-hidden />
                    )}
                    <span className="text-sm font-bold leading-tight">Take Photo</span>
                    <span className="text-[11px] font-medium leading-tight opacity-90">
                      Use device camera
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={
                      pickingPhotos ||
                      submitPending ||
                      isResolutionLocked ||
                      proofImages.length >= MAX_PROOF_IMAGES
                    }
                    onClick={() => galleryInputRef.current?.click()}
                    aria-label="Choose photos from gallery"
                    className={cn(
                      "flex min-h-[5.5rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-primary/40 bg-background px-3 py-4 text-center text-foreground shadow-sm transition",
                      "hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      "disabled:pointer-events-none disabled:opacity-50",
                    )}
                  >
                    <ImageIcon className="h-7 w-7 text-primary" aria-hidden />
                    <span className="text-sm font-bold leading-tight">Choose From Gallery</span>
                    <span className="text-[11px] font-medium leading-tight text-muted-foreground">
                      Select one or more photos
                    </span>
                  </button>
                </div>

                {/* Size budget */}
                <div className="space-y-1" aria-live="polite">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Upload size budget</span>
                    <span className={budgetExceeded ? "text-destructive font-medium" : budgetWarning ? "text-amber-700 font-medium" : ""}>
                      {formatBytes(usedBudgetBytes)} / {formatBytes(PROOF_UPLOAD_BUDGET_BYTES)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full transition-all ${
                        budgetExceeded ? "bg-destructive" : budgetWarning ? "bg-amber-500" : "bg-primary"
                      }`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                  {budgetWarning && !budgetExceeded && (
                    <p className="text-xs text-amber-700">Approaching the upload size limit. Consider fewer or smaller photos.</p>
                  )}
                  {budgetExceeded && (
                    <p className="text-xs text-destructive">Over the upload size limit. Remove a photo before submitting.</p>
                  )}
                </div>

                {proofImages.length > 0 && (
                  <ul
                    className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                    aria-label="Selected photo previews"
                  >
                    {proofImages.map((item, index) => (
                      <li
                        key={item.id}
                        className="relative mx-auto w-full max-w-[140px]"
                      >
                        <button
                          type="button"
                          className="block aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => {
                            setPreviewViewerIndex(index);
                            setPreviewViewerOpen(true);
                          }}
                          aria-label={`Inspect photo ${index + 1}`}
                          disabled={submitPending}
                        >
                          <img
                            src={item.previewUrl}
                            alt={`Selected photo ${index + 1}`}
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        </button>
                        <button
                          type="button"
                          className="absolute -right-1.5 -top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white text-red-600 shadow-md hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeProofImage(item.id);
                          }}
                          aria-label={`Remove photo ${index + 1}`}
                          disabled={submitPending || pickingPhotos}
                        >
                          <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {proofImages.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Tap a photo to zoom and inspect before submitting.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Video (optional — max 1, not uploaded yet)</Label>
                <input
                  type="file"
                  accept="video/*"
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setVideoFile(f ?? null);
                    e.target.value = "";
                  }}
                />
                {videoFile && (
                  <p className="text-xs text-muted-foreground break-all">
                    {videoFile.name} ({Math.round(videoFile.size / 1024)} KB) — metadata only sent until upload API
                    ships.
                  </p>
                )}
              </div>
              {geoFetching && <p className="text-xs text-muted-foreground">Fetching location…</p>}
              {!geoFetching && geoMessage && <p className="text-xs text-muted-foreground">{geoMessage}</p>}
              <textarea
                className="w-full border rounded p-3 text-base md:text-sm min-h-[88px]"
                placeholder={isResolution ? "Optional remarks" : "Optional remarks"}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </>

            {/* Desktop inline submit */}
            <Button
              className="hidden w-full md:inline-flex min-h-11"
              onClick={handleSubmit}
              disabled={submitPending || isResolutionLocked || pickingPhotos || budgetExceeded}
            >
              {submitPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              {submitLabel}
            </Button>
          </div>

          {/* Mobile sticky submit — same handler */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:hidden safe-pb safe-px">
            <Button
              className="w-full min-h-12 max-w-md mx-auto"
              onClick={handleSubmit}
              disabled={submitPending || isResolutionLocked || pickingPhotos || budgetExceeded}
            >
              {submitPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              {submitLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ProofImageViewerOverlay
        open={previewViewerOpen && proofImages.length > 0}
        sources={proofImages.map((p) => p.previewUrl)}
        initialIndex={previewViewerIndex}
        alt="Selected proof photo"
        onClose={() => setPreviewViewerOpen(false)}
      />
    </div>
  );
}
