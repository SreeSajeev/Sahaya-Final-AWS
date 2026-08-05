import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.35;

/**
 * Fullscreen proof image lightbox with zoom, pan, and multi-image navigation.
 * Loads the same source strings used by the gallery (typically full base64 / public URLs).
 */
export function ProofImageViewerOverlay({
  open,
  src,
  sources,
  initialIndex = 0,
  alt = "Proof image",
  onClose,
}: ProofImageViewerOverlayProps) {
  const list = useMemo(
    () => (sources && sources.length > 0 ? sources : src ? [src] : []),
    [sources, src],
  );
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setIndex(Math.min(Math.max(initialIndex, 0), Math.max(list.length - 1, 0)));
    resetView();
  }, [open, initialIndex, list.length, resetView]);

  useEffect(() => {
    resetView();
  }, [index, resetView]);

  // Prevent background scroll while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const zoomBy = useCallback((delta: number) => {
    setScale((prev) => {
      const next = clampScale(prev + delta);
      if (next <= MIN_SCALE) {
        setOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
  }, [list.length]);

  // Non-passive wheel so we can prevent page scroll / pinch-zoom browser chrome
  useEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const step = e.ctrlKey ? ZOOM_STEP * 0.55 : ZOOM_STEP * 0.4;
      setScale((prev) => {
        const next = clampScale(prev + direction * step);
        if (next <= MIN_SCALE) setOffset({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [open]);

  // Keyboard: arrows, +/- , 0 reset (Escape handled by Dialog)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(-ZOOM_STEP);
      } else if (e.key === "0") {
        e.preventDefault();
        resetView();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, goPrev, goNext, zoomBy, resetView]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scale <= MIN_SCALE) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setOffset({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    });
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
    }
  };

  const onDoubleClick = () => {
    if (scale > MIN_SCALE) {
      resetView();
    } else {
      setScale(2.25);
    }
  };

  // Requirement: overlay must not mount unless user clicks image.
  if (!open) return null;
  if (list.length === 0) return null;

  const currentSrc = list[index];
  const hasMany = list.length > 1;
  const canPrev = hasMany && index > 0;
  const canNext = hasMany && index < list.length - 1;
  const isZoomed = scale > MIN_SCALE;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        hideCloseButton
        aria-describedby={undefined}
        className="fixed inset-0 left-0 top-0 flex h-[100dvh] w-screen max-h-none max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-transparent p-0 shadow-none overflow-hidden data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">
          Proof image viewer{hasMany ? ` — image ${index + 1} of ${list.length}` : ""}
        </DialogTitle>

        {/* Dimmed stage — click outside image closes */}
        <div
          ref={stageRef}
          className="relative flex h-full w-full items-center justify-center bg-black/90"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {/* Large always-visible close */}
          <button
            type="button"
            onClick={onClose}
            className="fixed right-3 top-3 z-[60] inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/75 text-white shadow-lg ring-1 ring-white/40 hover:bg-black/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-5 sm:top-5 sm:h-14 sm:w-14"
            aria-label="Close image viewer"
          >
            <X className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
          </button>

          {/* Zoom toolbar */}
          <div className="fixed left-1/2 top-3 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 p-1.5 text-white shadow-lg ring-1 ring-white/20 sm:top-5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:bg-white/15"
              onClick={() => zoomBy(-ZOOM_STEP)}
              disabled={scale <= MIN_SCALE}
              aria-label="Zoom out"
            >
              <Minus className="h-5 w-5" />
            </Button>
            <span className="min-w-[3.5rem] text-center text-xs tabular-nums sm:text-sm">
              {Math.round(scale * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:bg-white/15"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={scale >= MAX_SCALE}
              aria-label="Zoom in"
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:bg-white/15"
              onClick={resetView}
              disabled={!isZoomed}
              aria-label="Reset zoom"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>

          {/* Side nav arrows */}
          {hasMany && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="fixed left-2 top-1/2 z-[60] h-12 w-12 -translate-y-1/2 rounded-full bg-black/65 text-white hover:bg-black/80 disabled:opacity-30 sm:left-4 sm:h-14 sm:w-14"
                disabled={!canPrev}
                onClick={goPrev}
                aria-label="Previous image"
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="fixed right-2 top-1/2 z-[60] h-12 w-12 -translate-y-1/2 rounded-full bg-black/65 text-white hover:bg-black/80 disabled:opacity-30 sm:right-4 sm:h-14 sm:w-14"
                disabled={!canNext}
                onClick={goNext}
                aria-label="Next image"
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          {/* Image plane */}
          <div
            className={cn(
              "relative flex max-h-[100dvh] max-w-[100vw] items-center justify-center px-12 py-20 sm:px-16",
              isZoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
            )}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={onDoubleClick}
          >
            <img
              src={currentSrc}
              alt={alt}
              className="max-h-[min(92dvh,92vh)] max-w-[min(96vw,1400px)] select-none object-contain"
              style={{
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
                transformOrigin: "center center",
                transition: isDragging ? "none" : "transform 120ms ease-out",
                imageRendering: "auto",
              }}
              draggable={false}
            />
          </div>

          {hasMany && (
            <div className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm text-white shadow-lg ring-1 ring-white/20">
              <span className="tabular-nums">
                {index + 1} of {list.length}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
