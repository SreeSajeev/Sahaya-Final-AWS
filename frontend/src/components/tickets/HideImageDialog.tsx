/**
 * Confirm dialog before soft-hiding proof / assignment images from Sahaya UI.
 * Does not delete S3 objects.
 */

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string | null) => void | Promise<void>;
  isPending?: boolean;
};

export function HideImageDialog({ open, onOpenChange, onConfirm, isPending }: Props) {
  const [reason, setReason] = useState("");

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hide Image</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                This hides the image from Sahaya UI for Field Executives and managers. The file
                remains in private storage and audit history is preserved.
              </p>
              <div className="space-y-2">
                <Label htmlFor="hide-image-reason">Reason (optional)</Label>
                <Textarea
                  id="hide-image-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this image being hidden?"
                  className="min-h-[80px]"
                  maxLength={2000}
                  disabled={isPending}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            className="bg-amber-700 hover:bg-amber-800"
            onClick={(e) => {
              e.preventDefault();
              void onConfirm(reason.trim() !== "" ? reason.trim() : null);
            }}
          >
            {isPending ? "Hiding…" : "Hide Image"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
