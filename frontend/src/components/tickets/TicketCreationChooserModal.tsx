import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Ticket, Upload } from "lucide-react";

export type TicketCreationMode = "single" | "bulk";

interface TicketCreationChooserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: (mode: TicketCreationMode) => void;
}

export function TicketCreationChooserModal({
  open,
  onOpenChange,
  onContinue,
}: TicketCreationChooserModalProps) {
  const [mode, setMode] = useState<TicketCreationMode>("single");

  const handleContinue = () => {
    onContinue(mode);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Ticket</DialogTitle>
          <DialogDescription>
            Choose how you want to create tickets.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as TicketCreationMode)}
          className="gap-4 py-2"
        >
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <RadioGroupItem value="single" id="create-single" className="mt-1" />
            <Label htmlFor="create-single" className="flex cursor-pointer flex-col gap-1">
              <span className="flex items-center gap-2 font-medium">
                <Ticket className="h-4 w-4" />
                Single Ticket
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                Create one ticket using the standard form.
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <RadioGroupItem value="bulk" id="create-bulk" className="mt-1" />
            <Label htmlFor="create-bulk" className="flex cursor-pointer flex-col gap-1">
              <span className="flex items-center gap-2 font-medium">
                <Upload className="h-4 w-4" />
                Bulk Ticket Upload
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                Import up to 100 tickets from a CSV file.
              </span>
            </Label>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleContinue}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
