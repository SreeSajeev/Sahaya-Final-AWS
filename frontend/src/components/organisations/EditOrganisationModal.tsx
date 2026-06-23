import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrganisationEmailArraysEditor } from "@/components/organisations/OrganisationEmailArraysEditor";
import { useUpdateOrganisation } from "@/hooks/useOrganisationsTable";
import { useToast } from "@/hooks/use-toast";

function stringListFromJson(j: unknown): string[] {
  return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : [];
}

function spocText(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

/** Minimal org shape for prefill (rows from list query or `fetchOrganisationById`). */
export type EditOrganisationSource = {
  id: string;
  name: string;
  incoming_emails?: unknown;
  outgoing_emails?: unknown;
  spoc_name?: string | null;
  spoc_email?: string | null;
  spoc_phone?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisation: EditOrganisationSource | null;
};

export function EditOrganisationModal({ open, onOpenChange, organisation }: Props) {
  const { toast } = useToast();
  const updateOrg = useUpdateOrganisation();

  const [name, setName] = useState("");
  const [incomingEmails, setIncomingEmails] = useState<string[]>([""]);
  const [outgoingEmails, setOutgoingEmails] = useState<string[]>([""]);
  const [spocName, setSpocName] = useState("");
  const [spocEmail, setSpocEmail] = useState("");
  const [spocPhone, setSpocPhone] = useState("");

  useEffect(() => {
    if (!open || !organisation) return;
    const inc = stringListFromJson(organisation.incoming_emails);
    const out = stringListFromJson(organisation.outgoing_emails);
    setName(organisation.name);
    setIncomingEmails(inc.length ? inc : [""]);
    setOutgoingEmails(out.length ? out : [""]);
    setSpocName(spocText(organisation.spoc_name));
    setSpocEmail(spocText(organisation.spoc_email));
    setSpocPhone(spocText(organisation.spoc_phone));
  }, [open, organisation]);

  const handleSave = async () => {
    if (!organisation) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    try {
      await updateOrg.mutateAsync({
        id: organisation.id,
        name: trimmedName,
        incoming_emails: incomingEmails,
        outgoing_emails: outgoingEmails,
        spoc_name: spocName.trim() || null,
        spoc_email: spocEmail.trim() || null,
        spoc_phone: spocPhone.trim() || null,
      });
      toast({ title: "Tenant updated", description: trimmedName });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Tenant</DialogTitle>
          <DialogDescription>
            Update tenant mailbox routing and contact details. Short Name is unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-org-name">Name</Label>
            <Input
              id="edit-org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
            />
          </div>
          <OrganisationEmailArraysEditor
            incomingEmails={incomingEmails}
            outgoingEmails={outgoingEmails}
            onIncomingChange={setIncomingEmails}
            onOutgoingChange={setOutgoingEmails}
          />
          <div className="grid gap-2">
            <Label htmlFor="edit-spoc-name">SPOC name</Label>
            <Input
              id="edit-spoc-name"
              value={spocName}
              onChange={(e) => setSpocName(e.target.value)}
              placeholder="Contact name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-spoc-email">SPOC email</Label>
            <Input
              id="edit-spoc-email"
              type="email"
              autoComplete="off"
              value={spocEmail}
              onChange={(e) => setSpocEmail(e.target.value)}
              placeholder="spoc@tenant.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-spoc-phone">SPOC phone</Label>
            <Input
              id="edit-spoc-phone"
              type="tel"
              autoComplete="off"
              value={spocPhone}
              onChange={(e) => setSpocPhone(e.target.value)}
              placeholder="+91 …"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!organisation || !name.trim() || updateOrg.isPending}
            onClick={handleSave}
          >
            {updateOrg.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
