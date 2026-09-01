/**
 * Manager can add context images + remarks after FE assignment (without reassigning).
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageIcon, Loader2, Plus, X } from "lucide-react";
import { fetchJson } from "@/lib/backendDataApi";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type PendingImage = {
  id: string;
  file: File;
  remark: string;
  previewUrl: string;
};

type Props = {
  ticketId: string;
  disabled?: boolean;
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function PostAssignmentContextPanel({ ticketId, disabled = false }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: PendingImage[] = [];
    for (const file of Array.from(files).slice(0, 10 - pending.length)) {
      if (!file.type.startsWith("image/")) continue;
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        remark: "",
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (next.length) setPending((prev) => [...prev, ...next]);
  };

  const removePending = (id: string) => {
    setPending((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const updateRemark = (id: string, remark: string) => {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, remark } : p)));
  };

  const submit = async () => {
    if (pending.length === 0) {
      toast({ title: "Add at least one image", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const context_images = await Promise.all(
        pending.map(async (p) => ({
          contentType: p.file.type || "image/jpeg",
          filename: p.file.name,
          remark: p.remark,
          dataBase64: await fileToBase64(p.file),
        }))
      );
      await fetchJson(`/tickets/${encodeURIComponent(ticketId)}/assignment-context`, {
        method: "POST",
        body: { context_images },
      });
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPending([]);
      await queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      toast({ title: "Context added", description: "Images are visible to the assigned FE." });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not add context",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="h-4 w-4" />
          Add context for Field Executive
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload guidance images and remarks after assignment — no reassignment required.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || submitting || pending.length >= 10}
          onClick={() => inputRef.current?.click()}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add image
        </Button>
        {pending.map((p) => (
          <div key={p.id} className="rounded-md border p-3 space-y-2">
            <div className="flex items-start gap-3">
              <img src={p.previewUrl} alt="" className="h-16 w-16 rounded object-cover border" />
              <div className="flex-1 space-y-2">
                <Label htmlFor={`ctx-remark-${p.id}`}>Remark for this image</Label>
                <Textarea
                  id={`ctx-remark-${p.id}`}
                  value={p.remark}
                  onChange={(e) => updateRemark(p.id, e.target.value)}
                  className="min-h-[60px] whitespace-pre-wrap"
                  placeholder="Describe what the FE should know about this image…"
                />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => removePending(p.id)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {pending.length > 0 && (
          <Button type="button" onClick={() => void submit()} disabled={disabled || submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              "Save context for FE"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
