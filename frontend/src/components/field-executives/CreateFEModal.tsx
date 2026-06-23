/**
 * CreateFEModal.tsx
 * 
 * Modal component for Service Manager to create new Field Executives.
 * Creates records in the existing field_executives table.
 * 
 * Part of Requirement 4: Service Manager Ability to Create Field Executives
 */

import { useState } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import { useTenantTerminology } from '@/hooks/useTenantTerminology';
import { toast } from '@/hooks/use-toast';
import { Loader2, UserPlus, X } from 'lucide-react';
import { CreateFESchema, formatZodError } from '@/lib/validation';
import { z } from 'zod';
import { fetchJson } from "@/lib/backendDataApi";
import { createAdminUser } from '@/lib/createAdminUser';
import { isProvisionServerSideEnabled } from '@/lib/provisionServerSideFeature';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

type ResourceKind = 'own' | 'outsourced';

function buildSkillsPayload(categories: string[], resourceKind: ResourceKind) {
  if (categories.length === 0) return null;
  return { categories, resource_kind: resourceKind };
}

interface CreateFEModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Predefined skill categories for logistics domain
const SKILL_OPTIONS = [
  'Delivery',
  'Pickup',
  'Installation',
  'Maintenance',
  'Repair',
  'Documentation',
  'Heavy Vehicles',
  'Light Vehicles',
  'Hazmat',
  'Cold Chain',
  'Express',
  'Last Mile',
];

export function CreateFEModal({ open, onOpenChange }: CreateFEModalProps) {
  const queryClient = useQueryClient();
  const { organisationId, signUp } = useAuth();
  const terminology = useTenantTerminology(organisationId);
  const serverProvision = isProvisionServerSideEnabled();

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [baseLocation, setBaseLocation] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [resourceKind, setResourceKind] = useState<ResourceKind>('own');
  const [isActive, setIsActive] = useState(true);

  // Toggle a skill selection
  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill)
        ? prev.filter((s) => s !== skill)
        : [...prev, skill]
    );
  };

  // Mutation to create the FE with validation
  const createFEMutation = useMutation({
    mutationFn: async () => {
      const emailTrimmed = email.trim();
      const validated = CreateFESchema.parse({
        name: name.trim(),
        email: emailTrimmed === '' ? null : emailTrimmed,
        phone: phone.trim() || null,
        base_location: baseLocation.trim() || null,
        skills: buildSkillsPayload(selectedSkills, resourceKind),
        active: isActive,
      });

      if (serverProvision) {
        if (!emailTrimmed || !password) {
          throw new Error('Email and password are required to create a login account.');
        }
        if (!organisationId) {
          throw new Error('Tenant context is required.');
        }
        const { error } = await createAdminUser(signUp, {
          email: emailTrimmed,
          password,
          name: validated.name,
          role: 'FIELD_EXECUTIVE',
          organisationId,
          fieldExecutive: {
            phone: validated.phone,
            base_location: validated.base_location,
            skills: validated.skills as Record<string, unknown> | null,
            active: validated.active,
          },
        });
        if (error) throw error;
        return { name: validated.name };
      }

      return await fetchJson<any>(`/field-executives`, {
        method: "POST",
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
    onSuccess: (data) => {
      // Invalidate queries to refresh FE lists and dashboard stats
      queryClient.invalidateQueries({ queryKey: ['field-executives'] });
      queryClient.invalidateQueries({ queryKey: ['field-executives-with-stats'] });
      if (organisationId) {
        queryClient.invalidateQueries({ queryKey: ['users-org-overview', organisationId] });
      }
      toast({
        title: `${terminology.fieldExecutiveLabel} Created`,
        description: `${data.name} has been added and is now available for ticket assignment.`,
      });
      
      // Reset form and close modal
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      // Handle validation errors specifically
      if (error instanceof z.ZodError) {
        toast({
          title: 'Validation Error',
          description: formatZodError(error),
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: `Failed to Create ${terminology.fieldExecutiveLabel}`,
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setBaseLocation('');
    setSelectedSkills([]);
    setResourceKind('own');
    setIsActive(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: 'Name Required',
        description: `Please enter the ${terminology.fieldExecutiveLabel.toLowerCase()}'s name.`,
        variant: 'destructive',
      });
      return;
    }
    if (serverProvision && (!email.trim() || !password)) {
      toast({
        title: 'Login details required',
        description: 'Email and password are required when server-side provisioning is enabled.',
        variant: 'destructive',
      });
      return;
    }

    createFEMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Add {terminology.fieldExecutiveLabel}
          </DialogTitle>
          <DialogDescription>
            Create a new {terminology.fieldExecutiveLabel} profile. They will be available for 
            ticket assignment immediately after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="feName">Full Name *</Label>
            <Input
              id="feName"
              placeholder="e.g., Rajesh Kumar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="feEmail">Email{serverProvision ? ' *' : ''}</Label>
            <Input
              id="feEmail"
              type="email"
              placeholder="e.g., name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required={serverProvision}
              className="w-full"
            />
          </div>

          {serverProvision && (
            <div className="space-y-2">
              <Label htmlFor="fePassword">Password *</Label>
              <Input
                id="fePassword"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="w-full"
              />
            </div>
          )}

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="fePhone">Phone Number</Label>
            <Input
              id="fePhone"
              placeholder="e.g., +91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              className="w-full"
            />
          </div>

          {/* Resource Type */}
          <div className="space-y-2">
            <Label>Resource Type</Label>
            <RadioGroup
              value={resourceKind}
              onValueChange={(v) => setResourceKind(v as ResourceKind)}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="own" id="fe-resource-own" />
                <Label htmlFor="fe-resource-own" className="font-normal cursor-pointer">
                  Company Employee
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="outsourced" id="fe-resource-outsourced" />
                <Label htmlFor="fe-resource-outsourced" className="font-normal cursor-pointer">
                  Outsourced
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Base Location */}
          <div className="space-y-2">
            <Label htmlFor="feLocation">Base Location</Label>
            <Input
              id="feLocation"
              placeholder="e.g., Mumbai, Andheri"
              value={baseLocation}
              onChange={(e) => setBaseLocation(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Used for location-based ticket assignment recommendations
            </p>
          </div>

          {/* Skills */}
          <div className="space-y-2">
            <Label>Skills & Expertise</Label>
            <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30">
              {SKILL_OPTIONS.map((skill) => (
                <Badge
                  key={skill}
                  variant={selectedSkills.includes(skill) ? 'default' : 'outline'}
                  className="cursor-pointer select-none transition-colors"
                  onClick={() => toggleSkill(skill)}
                >
                  {skill}
                  {selectedSkills.includes(skill) && (
                    <X className="ml-1 h-3 w-3" />
                  )}
                </Badge>
              ))}
            </div>
            {selectedSkills.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedSkills.length} skill(s) selected
              </p>
            )}
          </div>

          {/* Active Status */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="feActive"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked as boolean)}
            />
            <Label htmlFor="feActive" className="text-sm font-normal cursor-pointer">
              Active and available for assignments
            </Label>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createFEMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createFEMutation.isPending}>
              {createFEMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add {terminology.fieldExecutiveLabel}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
