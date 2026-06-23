import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ProofImageViewerOverlayProps = {
  open: boolean;
  /** Single source (backward compatible). */
  src?: string;
  /** Optional multi-source gallery. When provided, viewer can navigate. */
  sources?: string[];
  initialIndex?: number;
  alt?: string;
  onClose: () => void;
};

/**
 * Presentation-only fullscreen image viewer.
 * - Mounts only when open=true
 * - Close via Escape, backdrop click, or close button (DialogContent provides X)
 * - Does not assume base64; `src` can be any string URL.
 */
export function ProofImageViewerOverlay({
  open,
  src,
  sources,
  initialIndex = 0,
  alt = "",
  onClose,
}: ProofImageViewerOverlayProps) {
  const list = useMemo(() => (sources && sources.length > 0 ? sources : src ? [src] : []), [sources, src]);
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (!open) return;
    setIndex(Math.min(Math.max(initialIndex, 0), Math.max(list.length - 1, 0)));
  }, [open, initialIndex, list.length]);

  // Prevent background scroll while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Requirement: overlay must not mount unless user clicks image.
  if (!open) return null;
  if (list.length === 0) return null;

  const currentSrc = list[index];
  const hasMany = list.length > 1;
  const canPrev = hasMany && index > 0;
  const canNext = hasMany && index < list.length - 1;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="w-screen h-screen max-w-none max-h-none border-0 bg-transparent p-0 overflow-hidden"
      >
        <div className="relative flex h-full w-full items-center justify-center p-4">
          <img
            src={currentSrc}
            alt={alt}
            className="max-h-full max-w-full object-contain select-none"
            draggable={false}
          />

          {hasMany && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-white hover:bg-white/15 disabled:opacity-40"
                disabled={!canPrev}
                onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              >
                Prev
              </Button>
              <span className="tabular-nums">{index + 1} / {list.length}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-white hover:bg-white/15 disabled:opacity-40"
                disabled={!canNext}
                onClick={() => setIndex((i) => Math.min(i + 1, list.length - 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

