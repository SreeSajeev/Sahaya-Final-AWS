/**
 * Service Manager ticket detail — upload resolution proof + submit for verification.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchJson } from "@/lib/backendDataApi";
import { compressProofImage } from "@/lib/compressProofImage";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { formatIST } from "@/lib/dateUtils";

const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function SMTicketView() {
  const { ticketId = "" } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [remarks, setRemarks] = useState("");
  const [images, setImages] = useState<
    Array<{ contentType: string; filename: string; dataBase64: string; previewUrl: string }>
  >([]);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sm-ticket", ticketId],
    enabled: Boolean(ticketId),
    queryFn: () => fetchJson<{ item: Record<string, unknown> | null }>(`/sm/me/tickets/${ticketId}`),
  });

  const ticket = data?.item;

  const uploadProof = useMutation({
    mutationFn: async () => {
      if (!images.length) throw new Error("Add at least one resolution image");
      return fetchJson(`/sm/me/tickets/${ticketId}/resolution-proof`, {
        method: "POST",
        body: {
          remarks: remarks.trim() || null,
          images: images.map(({ contentType, filename, dataBase64 }) => ({
            contentType,
            filename,
            dataBase64,
            remark: remarks.trim() || null,
          })),
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Proof uploaded" });
      queryClient.invalidateQueries({ queryKey: ["sm-ticket", ticketId] });
      for (const img of images) URL.revokeObjectURL(img.previewUrl);
      setImages([]);
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Upload failed", description: err.message }),
  });

  const submitVerification = useMutation({
    mutationFn: async () =>
      fetchJson(`/sm/me/tickets/${ticketId}/submit-verification`, {
        method: "POST",
        body: { remarks: remarks.trim() || null },
      }),
    onSuccess: () => {
      toast({ title: "Submitted for verification" });
      queryClient.invalidateQueries({ queryKey: ["sm-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["sm-my-tickets"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Submit failed", description: err.message }),
  });

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      const next = [];
      for (const file of files.slice(0, 10 - images.length)) {
        if (!ALLOWED.has(file.type)) continue;
        const compressed = await compressProofImage(file);
        const dataBase64 = await fileToBase64(compressed);
        next.push({
          contentType: compressed.type || "image/jpeg",
          filename: compressed.name || "resolution.jpg",
          dataBase64,
          previewUrl: URL.createObjectURL(compressed),
        });
      }
      setImages((prev) => [...prev, ...next].slice(0, 10));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <AppLayoutNew>
        <div className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      </AppLayoutNew>
    );
  }

  if (error || !ticket) {
    return (
      <AppLayoutNew>
        <div className="p-6 space-y-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <p className="text-destructive">
            {error instanceof Error ? error.message : "Ticket not found or not assigned to you"}
          </p>
        </div>
      </AppLayoutNew>
    );
  }

  const status = String(ticket.status || "");
  const canAct = !["RESOLVED", "REJECTED", "RESOLVED_PENDING_VERIFICATION"].includes(status);

  return (
    <AppLayoutNew>
      <main className="p-6 space-y-5 max-w-3xl">
        <Button asChild variant="outline" size="sm">
          <Link to="/sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> My Assigned Tickets
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold font-mono">{String(ticket.ticket_number)}</h1>
          <Badge variant="outline">{status}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ticket details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Client: </span>
              {String(ticket.client_slug || "—")}
            </div>
            <div>
              <span className="text-muted-foreground">Location: </span>
              {String(ticket.location || "—")}
            </div>
            <div>
              <span className="text-muted-foreground">Issue: </span>
              {String(ticket.issue_type || ticket.category || "—")}
            </div>
            <div>
              <span className="text-muted-foreground">Vehicle: </span>
              {String(ticket.vehicle_number || "—")}
            </div>
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Assigned: </span>
              {ticket.assigned_at ? formatIST(String(ticket.assigned_at), "PPp") : "—"}
            </div>
            <div className="sm:col-span-2 whitespace-pre-wrap">
              <span className="text-muted-foreground">Remarks: </span>
              {String(ticket.remarks || "—")}
            </div>
          </CardContent>
        </Card>

        {canAct ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resolution proof</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sm-remarks">Resolution remarks</Label>
                <Textarea
                  id="sm-remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Describe the resolution…"
                  className="min-h-[100px] whitespace-pre-wrap"
                />
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> Add images
                </Button>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
                <span className="text-xs text-muted-foreground">{images.length}/10 images</span>
              </div>
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((img) => (
                    <img key={img.previewUrl} src={img.previewUrl} alt="" className="h-20 w-20 object-cover rounded border" />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={uploadProof.isPending || busy || images.length === 0}
                  onClick={() => uploadProof.mutate()}
                >
                  {uploadProof.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Upload proof
                </Button>
                <Button
                  variant="secondary"
                  disabled={submitVerification.isPending}
                  onClick={() => submitVerification.mutate()}
                >
                  {submitVerification.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Submit for verification
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                After submission, a Tenant Admin verifies and closes the ticket. You cannot close tickets from this portal.
              </p>
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            This ticket is {status}. No further Service Manager actions are available.
          </p>
        )}
      </main>
    </AppLayoutNew>
  );
}
