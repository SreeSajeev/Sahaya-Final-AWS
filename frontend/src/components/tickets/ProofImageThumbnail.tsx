import { cn } from "@/lib/utils";

export type ProofImageThumbnailProps = {
  src: string;
  alt?: string;
  imgClassName?: string;
  onOpen: (src: string) => void;
};

/**
 * Presentation-only thumbnail wrapper.
 * Renders the existing image as-is and adds click-to-zoom behavior.
 */
export function ProofImageThumbnail({ src, alt = "", imgClassName, onOpen }: ProofImageThumbnailProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(src)}
      className="mt-0 bg-transparent border-0 p-0 text-left"
      aria-label="View proof image"
    >
      <img
        src={src}
        alt={alt}
        className={cn(imgClassName, "cursor-zoom-in")}
        loading="lazy"
        draggable={false}
      />
    </button>
  );
}

