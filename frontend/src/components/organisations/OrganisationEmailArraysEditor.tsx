import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

type Props = {
  incomingEmails: string[];
  outgoingEmails: string[];
  onIncomingChange: (next: string[]) => void;
  onOutgoingChange: (next: string[]) => void;
};

/**
 * Inbound mailbox addresses → match Postmark recipient (organisation routing).
 * Outbound → stored for Reply-To on automated ticket emails (backend).
 */
export function OrganisationEmailArraysEditor({
  incomingEmails,
  outgoingEmails,
  onIncomingChange,
  onOutgoingChange,
}: Props) {
  const bumpIncoming = (i: number, val: string) => {
    const next = [...incomingEmails];
    next[i] = val;
    onIncomingChange(next);
  };
  const addIncoming = () => onIncomingChange([...incomingEmails, ""]);
  const removeIncoming = (i: number) => {
    if (incomingEmails.length <= 1) {
      onIncomingChange([""]);
      return;
    }
    onIncomingChange(incomingEmails.filter((_, j) => j !== i));
  };

  const bumpOutgoing = (i: number, val: string) => {
    const next = [...outgoingEmails];
    next[i] = val;
    onOutgoingChange(next);
  };
  const addOutgoing = () => onOutgoingChange([...outgoingEmails, ""]);
  const removeOutgoing = (i: number) => {
    if (outgoingEmails.length <= 1) {
      onOutgoingChange([""]);
      return;
    }
    onOutgoingChange(outgoingEmails.filter((_, j) => j !== i));
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Incoming mailboxes</Label>
        <p className="text-xs text-muted-foreground">
          Addresses that receive complaints for this tenant (match Postmark &quot;To&quot;).
        </p>
        {(incomingEmails.length ? incomingEmails : [""]).map((row, i) => (
          <div key={`in-${i}`} className="flex gap-2">
            <Input
              type="email"
              autoComplete="off"
              placeholder="support@tenant.com"
              value={row}
              onChange={(e) => bumpIncoming(i, e.target.value)}
              className="flex-1"
            />
            <Button type="button" variant="outline" size="icon" aria-label="Remove" onClick={() => removeIncoming(i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={addIncoming}>
          <Plus className="h-4 w-4 mr-1" /> Add incoming address
        </Button>
      </div>

      <div className="grid gap-2">
        <Label>Outgoing addresses</Label>
        <p className="text-xs text-muted-foreground">
          Reply-To for ticket confirmations (first address used when emails are sent from the backend).
        </p>
        {(outgoingEmails.length ? outgoingEmails : [""]).map((row, i) => (
          <div key={`out-${i}`} className="flex gap-2">
            <Input
              type="email"
              autoComplete="off"
              placeholder="noreply@tenant.com"
              value={row}
              onChange={(e) => bumpOutgoing(i, e.target.value)}
              className="flex-1"
            />
            <Button type="button" variant="outline" size="icon" aria-label="Remove" onClick={() => removeOutgoing(i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={addOutgoing}>
          <Plus className="h-4 w-4 mr-1" /> Add outgoing address
        </Button>
      </div>
    </div>
  );
}
