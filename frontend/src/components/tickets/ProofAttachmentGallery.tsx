import { ProofImageThumbnail } from "@/components/tickets/ProofImageThumbnail";
import { cn } from "@/lib/utils";

export type ProofAttachmentGalleryProps = {
  sources: string[];
  imgClassName?: string;
  onOpenAtIndex: (index: number) => void;
  proofGpsLine?: string | null;
  className?: string;
};

/**
 * Renders all non-video proof images in upload order.
 * Single-image tickets render one thumbnail (same as before, without "+N more" only).
 */
export function ProofAttachmentGallery({
  sources,
  imgClassName,
  onOpenAtIndex,
  proofGpsLine,
  className,
}: ProofAttachmentGalleryProps) {
  if (!sources.length) return null;

  const thumbClass =
    imgClassName ??
    "max-h-32 max-w-full rounded border object-contain sm:max-h-40";

  return (
    <div className={cn("space-y-1", className)}>
      <div className="mt-3 flex flex-wrap gap-2">
        {sources.map((src, index) => (
          <ProofImageThumbnail
            key={`proof-${index}`}
            src={src}
            imgClassName={thumbClass}
            onOpen={() => onOpenAtIndex(index)}
          />
        ))}
      </div>
      {sources.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {sources.length} proof image{sources.length !== 1 ? "s" : ""}
        </p>
      )}
      {proofGpsLine && (
        <p className="text-xs text-muted-foreground">{proofGpsLine}</p>
      )}
    </div>
  );
}
