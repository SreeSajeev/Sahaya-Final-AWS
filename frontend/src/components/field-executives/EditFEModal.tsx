/**
 * EditFEModal.tsx
 * Edit Field Executive details. Respects organisation scoping:
 * SuperAdmin can edit any FE; Admin/Service Manager only FEs in their org.
 */

import { useState, useEffect } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { fetchJson } from '@/lib/backendDataApi';
import { useAuth } from '@/hooks/useAuth';
import { useTenantTerminology } from '@/hooks/useTenantTerminology';
import { toast } from '@/hooks/use-toast';
import { Loader2, Pencil } from 'lucide-react';
import { CreateFESchema, formatZodError } from '@/lib/validation';
import { z } from 'zod';
import { FieldExecutive } from '@/lib/types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

type ResourceKind = 'own' | 'outsourced';

function buildSkillsPayload(categories: string[], resourceKind: ResourceKind) {
  if (categories.length === 0) return null;
  return { categories, resource_kind: resourceKind };
}

function readResourceKind(skills: unknown): ResourceKind {
  const k = String((skills as { resource_kind?: string } | null)?.resource_kind ?? '')
    .toLowerCase()
    .trim();
  return k === 'outsourced' ? 'outsourced' : 'own';
}

const SKILL_OPTIONS = [
  'Delivery', 'Pickup', 'Installation', 'Maintenance', 'Repair', 'Documentation',
  'Heavy Vehicles', 'Light Vehicles', 'Hazmat', 'Cold Chain', 'Express', 'Last Mile',
];

interface EditFEModalProps {
  executive: FieldExecutive | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditFEModal({ executive, open, onOpenChange, onSuccess }: EditFEModalProps) {
  const queryClient = useQueryClient();
  const { userProfile, organisationId } = useAuth();
  const terminology = useTenantTerminology(executive?.organisation_id ?? organisationId);
  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [baseLocation, setBaseLocation] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [resourceKind, setResourceKind] = useState<ResourceKind>('own');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (executive && open) {
      setName(executive.name ?? '');
      setEmail(executive.email ?? '');
      setPhone(executive.phone ?? '');
      setBaseLocation(executive.base_location ?? '');
      const skills = executive.skills as { categories?: string[] } | null;
      setSelectedSkills(skills?.categories ?? []);
      setResourceKind(readResourceKind(executive.skills));
      setIsActive(executive.active ?? true);
    }
  }, [executive, open]);

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const updateFEMutation = useMutation({
    mutationFn: async () => {
      if (!executive) throw new Error('No executive selected');
      if (!isSuperAdmin && organisationId) {
        const feOrgId = executive.organisation_id ?? null;
        if (feOrgId !== organisationId) {
          throw new Error('You can only edit field executives in your tenant.');
        }
      }
      const emailTrimmed = email.trim();
      const validated = CreateFESchema.parse({
        name: name.trim(),
        email: emailTrimmed === '' ? null : emailTrimmed,
        phone: phone.trim() || null,
        base_location: baseLocation.trim() || null,
        skills: buildSkillsPayload(selectedSkills, resourceKind),
        active: isActive,
      });
      await fetchJson(`/field-executives/${encodeURIComponent(executive.id)}`, {
        method: 'PATCH',
        body: {
          name: validated.name,
          email: validated.email ?? null,
          phone: validated.phone,
          base_location: validated.base_location,
          skills: validated.skills,
          active: validated.active,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field-executives'] });
      queryClient.invalidateQueries({ queryKey: ['field-executives-with-stats'] });
      toast({ title: `${terminology.fieldExecutiveLabel} updated` });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err: Error) => {
      if (err instanceof z.ZodError) {
        toast({ title: 'Validation failed', description: formatZodError(err), variant: 'destructive' });
      } else {
        toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
      }
    },
  });

  const canEdit = executive && (
    isSuperAdmin ||
    (organisationId && (executive.organisation_id ?? null) === organisationId)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Edit {terminology.fieldExecutiveLabel}
          </DialogTitle>
          <DialogDescription>
            Update name, contact, location, skills, and status. Changes are saved to this tenant only.
          </DialogDescription>
        </DialogHeader>
        {executive && !canEdit && (
          <div className="rounded-md bg-destructive/10 text-destructive text-sm p-3">
            You can only edit {terminology.fieldExecutivesLabel.toLowerCase()} in your tenant.
          </div>
        )}
        {executive && canEdit && (
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-fe-name">Name</Label>
              <Input
                id="edit-fe-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="w-full"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-fe-email">Email</Label>
              <Input
                id="edit-fe-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full"
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-fe-phone">Phone</Label>
              <Input
                id="edit-fe-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                className="w-full"
              />
            </div>
            <div className="grid gap-2">
              <Label>Resource Type</Label>
              <RadioGroup
                value={resourceKind}
                onValueChange={(v) => setResourceKind(v as ResourceKind)}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="own" id="edit-fe-resource-own" />
                  <Label htmlFor="edit-fe-resource-own" className="font-normal cursor-pointer">
                    Company Employee
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="outsourced" id="edit-fe-resource-outsourced" />
                  <Label htmlFor="edit-fe-resource-outsourced" className="font-normal cursor-pointer">
                    Outsourced
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-fe-location">Base Location</Label>
              <Input
                id="edit-fe-location"
                value={baseLocation}
                onChange={(e) => setBaseLocation(e.target.value)}
                placeholder="Base location"
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="edit-fe-active" checked={isActive} onCheckedChange={(c) => setIsActive(!!c)} />
              <Label htmlFor="edit-fe-active">Active</Label>
            </div>
            <div className="grid gap-2">
              <Label>Skills</Label>
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.map((skill) => (
                  <Badge
                    key={skill}
                    variant={selectedSkills.includes(skill) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleSkill(skill)}
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {canEdit && (
            <Button
              disabled={updateFEMutation.isPending || !name.trim()}
              onClick={() => updateFEMutation.mutate()}
            >
              {updateFEMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
