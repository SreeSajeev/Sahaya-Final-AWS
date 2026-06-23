import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ComplaintPoint } from "@/lib/complaintPointsApi";
import type { Organisation } from "@/lib/types";

export type ComplaintPointFormState = {
  name: string;
  description: string;
  building: string;
  floor: string;
  site_name: string;
  asset_reference: string;
  default_client_slug: string;
  default_category: string;
  default_issue_type: string;
  organisation_id: string;
};

export const emptyComplaintPointForm = (organisationId: string): ComplaintPointFormState => ({
  name: "",
  description: "",
  building: "",
  floor: "",
  site_name: "",
  asset_reference: "",
  default_client_slug: "",
  default_category: "",
  default_issue_type: "",
  organisation_id: organisationId,
});

function formFromPoint(point: ComplaintPoint): ComplaintPointFormState {
  return {
    name: point.name,
    description: point.description ?? "",
    building: point.building ?? "",
    floor: point.floor ?? "",
    site_name: point.site_name ?? "",
    asset_reference: point.asset_reference ?? "",
    default_client_slug: point.default_client_slug ?? "",
    default_category: point.default_category ?? "",
    default_issue_type: point.default_issue_type ?? "",
    organisation_id: point.organisation_id,
  };
}

type ComplaintPointDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ComplaintPoint | null;
  isSuperAdmin: boolean;
  organisations: Organisation[];
  defaultOrganisationId: string;
  busy: boolean;
  onSave: (form: ComplaintPointFormState, editing: ComplaintPoint | null) => void;
};

export function ComplaintPointDialog({
  open,
  onOpenChange,
  editing,
  isSuperAdmin,
  organisations,
  defaultOrganisationId,
  busy,
  onSave,
}: ComplaintPointDialogProps) {
  const [form, setForm] = useState<ComplaintPointFormState>(
    emptyComplaintPointForm(defaultOrganisationId)
  );

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm(formFromPoint(editing));
    } else {
      setForm(emptyComplaintPointForm(defaultOrganisationId));
    }
  }, [open, editing, defaultOrganisationId]);

  const handleSubmit = () => {
    onSave(form, editing);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit complaint point" : "Add complaint point"}</DialogTitle>
          <DialogDescription>
            Physical or logical locations where the public can report issues via QR (public flow
            coming in a later release).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {isSuperAdmin && !editing && (
            <div className="space-y-2">
              <Label>Tenant *</Label>
              <Select
                value={form.organisation_id || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, organisation_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {organisations.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Reception, Ward A"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              maxLength={2000}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Location *</Label>
              <Input
                value={form.building}
                onChange={(e) => setForm((f) => ({ ...f, building: e.target.value }))}
                placeholder="e.g. Block A, North Wing"
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Sub Location</Label>
              <Input
                value={form.floor}
                onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))}
                placeholder="e.g. Floor 2, Room 204"
                maxLength={200}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Default Client Short Name</Label>
            <Input
              value={form.default_client_slug}
              onChange={(e) => setForm((f) => ({ ...f, default_client_slug: e.target.value }))}
              className="font-mono text-sm"
              placeholder="Optional — for ticket client short name (`client_slug`)"
              maxLength={120}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Default category</Label>
              <Input
                value={form.default_category}
                onChange={(e) => setForm((f) => ({ ...f, default_category: e.target.value }))}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>Default issue type</Label>
              <Input
                value={form.default_issue_type}
                onChange={(e) => setForm((f) => ({ ...f, default_issue_type: e.target.value }))}
                maxLength={200}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {editing ? "Save changes" : "Create complaint point"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
