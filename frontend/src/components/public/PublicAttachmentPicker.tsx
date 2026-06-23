import { useRef } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const MAX_IMAGES = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

export type AttachmentMeta = { name: string; size: number; type: string };

type PublicAttachmentPickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

export function PublicAttachmentPicker({ files, onChange, disabled }: PublicAttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const next = [...files];
    const rejected: string[] = [];

    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_IMAGES) {
        rejected.push(`Maximum ${MAX_IMAGES} photos allowed.`);
        break;
      }
      if (!file.type.startsWith("image/")) {
        rejected.push(`${file.name}: only JPEG, PNG, or WebP images are allowed.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name}: must be 4 MB or smaller.`);
        continue;
      }
      next.push(file);
    }

    if (rejected.length > 0) {
      toast({
        title: "Some photos were not added",
        description: rejected.slice(0, 3).join(" "),
        variant: "destructive",
      });
    }

    if (next.length !== files.length) {
      onChange(next);
    }
  };

  const removeAt = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <Label>Photos (optional)</Label>
      <p className="text-xs text-muted-foreground">
        Up to {MAX_IMAGES} images (max 4 MB each). Photos will be uploaded when your complaint is
        submitted (next step). File contents are not saved if you refresh this page.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || files.length >= MAX_IMAGES}
        onClick={() => inputRef.current?.click()}
      >
        Add photos
      </Button>
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm"
            >
              <span className="truncate pr-2">
                {f.name} ({Math.round(f.size / 1024)} KB)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={disabled}
                onClick={() => removeAt(i)}
                aria-label="Remove photo"
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function filesToAttachmentMeta(files: File[]): AttachmentMeta[] {
  return files.map((f) => ({ name: f.name, size: f.size, type: f.type }));
}
