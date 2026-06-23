import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ComplaintPoint } from "@/lib/complaintPointsApi";
import {
  complaintPointQrDownloadFilename,
  downloadCanvasAsPng,
} from "@/lib/complaintPointQr";
import { Copy, Download } from "lucide-react";

const QR_SIZE = 256;

type ComplaintPointQrModalProps = {
  point: ComplaintPoint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantName?: string;
  onCopyUrl?: (url: string) => void;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}

export function ComplaintPointQrModal({
  point,
  open,
  onOpenChange,
  tenantName,
  onCopyUrl,
}: ComplaintPointQrModalProps) {
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const publicUrl = point?.public_url?.trim() ?? "";

  const handleDownload = () => {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas || !point) return;
    downloadCanvasAsPng(canvas, complaintPointQrDownloadFilename(point.name));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>QR code — {point?.name ?? "Complaint point"}</DialogTitle>
          <DialogDescription>
            Scan to open the public complaint form. QR is generated from the public URL — not stored
            in the database.
          </DialogDescription>
        </DialogHeader>

        {point && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <DetailRow label="Name" value={point.name} />
              {point.building && <DetailRow label="Location" value={point.building} />}
              {point.floor && <DetailRow label="Sub Location" value={point.floor} />}
              {tenantName && <DetailRow label="Tenant" value={tenantName} />}
              <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm items-center">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={point.status === "active" ? "default" : "secondary"}>
                  {point.status}
                </Badge>
              </div>
            </div>

            {publicUrl ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Public URL</p>
                  <div className="flex items-start gap-2 rounded-md border bg-background p-2">
                    <code className="flex-1 break-all text-xs">{publicUrl}</code>
                    {onCopyUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => onCopyUrl(publicUrl)}
                        aria-label="Copy public URL"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex justify-center rounded-lg border bg-white p-4">
                  <div ref={canvasWrapRef}>
                    <QRCodeCanvas
                      value={publicUrl}
                      size={QR_SIZE}
                      level="M"
                      includeMargin
                      aria-label={`QR code for ${point.name}`}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                No public URL available for this complaint point.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {publicUrl && point && (
            <Button type="button" className="gap-2" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download QR
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
