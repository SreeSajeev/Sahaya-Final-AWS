/**
 * CreateTicketModal.tsx
 * 
 * Modal component for Service Manager to manually create tickets.
 * This creates tickets in the same tickets table as email-generated tickets,
 * but with source set to 'MANUAL' to distinguish them.
 * 
 * Part of Requirement 1: Manual Ticket Creation by Service Manager
 */

import { useState, useEffect, useMemo } from 'react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TicketPriorityRadioGroup } from '@/components/tickets/TicketPriorityRadioGroup';
import { StateSelect } from '@/components/tickets/StateSelect';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Ticket } from 'lucide-react';
import { CreateTicketSchema, formatZodError } from '@/lib/validation';
import type { PriorityLevel } from '@/lib/priority';
import { DEFAULT_PRIORITY_LEVEL, booleanFromPriorityLevel } from '@/lib/priority';
import type { User } from '@/lib/types';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { useOrgTicketConfigForCreate } from '@/hooks/useOrgTicketConfigForCreate';
import { fetchJson } from "@/lib/backendDataApi";
import { normalizeOrgSlug } from "@/lib/tenantTicketsSupabase";
import { useOrganisationsTable } from "@/hooks/useOrganisationsTable";
import { useTenantClientsForPicker } from "@/hooks/useTenantClients";
import { useClientNotificationEmails } from '@/hooks/useClientNotificationEmails';
import { isTenantClientsEnabled } from "@/lib/tenantClientsFeature";
import type { Organisation } from '@/lib/types';

export interface ClientTicketContext {
  openedByEmail: string;
  clientSlug: string;
}

interface CreateTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, ticket is created as client-originated: opened_by_email and client_slug are set; priority control is hidden. */
  clientContext?: ClientTicketContext | null;
}

export function CreateTicketModal({ open, onOpenChange, clientContext }: CreateTicketModalProps) {
  const queryClient = useQueryClient();
  const { userProfile, session } = useAuth();
  const isClientMode = !!clientContext;
  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';
  /** STAFF / ADMIN / SUPER_ADMIN use the shared client picker (orgs or tenant_clients per flag). */
  const canPickFromAllOrganisations =
    userProfile?.role === 'STAFF' ||
    userProfile?.role === 'ADMIN' ||
    userProfile?.role === 'SUPER_ADMIN';
  const useTenantClientRegistry =
    isTenantClientsEnabled() && canPickFromAllOrganisations;

  // Form state
  /** Staff manual flow: selected client slug (required when not clientContext). */
  const [manualClientSlug, setManualClientSlug] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [category, setCategory] = useState('');
  const [issueType, setIssueType] = useState('');
  const [customIssueType, setCustomIssueType] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [location, setLocation] = useState('');
  const [locationTouched, setLocationTouched] = useState(false);
  const [ticketState, setTicketState] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [complaintId, setComplaintId] = useState('');
  const [priorityLevel, setPriorityLevel] = useState<PriorityLevel>(DEFAULT_PRIORITY_LEVEL);
  const [selectedNotifyEmails, setSelectedNotifyEmails] = useState<Set<string>>(() => new Set());
  const [recipientSearch, setRecipientSearch] = useState('');

  const showRecipientPicker = !isClientMode && canPickFromAllOrganisations;

  // When "Other" is selected, use custom text if provided; otherwise send "Other"
  const effectiveIssueType =
    issueType === 'Other' && customIssueType.trim()
      ? customIssueType.trim()
      : issueType || null;

  /** Category "Other" must store custom text (not the literal "Other"). */
  const effectiveCategory =
    category === 'Other' && customCategory.trim()
      ? customCategory.trim()
      : category || null;

  useEffect(() => {
    if (open && !isClientMode) {
      setManualClientSlug('');
    }
  }, [open, isClientMode]);

  const {
    data: organisationsForPicker = [],
    isLoading: orgsPickerLoading,
    isError: orgsPickerError,
  } = useOrganisationsTable({
    enabled: Boolean(
      open &&
        !isClientMode &&
        userProfile &&
        canPickFromAllOrganisations &&
        !useTenantClientRegistry &&
        session?.access_token
    ),
  });

  const {
    data: tenantClientsForPicker = [],
    isLoading: tenantClientsLoading,
    isError: tenantClientsFetchError,
  } = useTenantClientsForPicker({
    enabled: Boolean(
      open && !isClientMode && userProfile && useTenantClientRegistry && session?.access_token
    ),
  });

  const {
    data: clientUsers = [],
    isLoading: legacyClientsLoading,
    isError: legacyClientsFetchError,
  } = useQuery({
    queryKey: ['ticket-creation-clients', userProfile?.organisation_id ?? null, isSuperAdmin],
    enabled: Boolean(open && !isClientMode && userProfile && !canPickFromAllOrganisations),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '500');
      params.set('offset', '0');
      params.set('role', 'CLIENT');
      if (!isSuperAdmin && userProfile?.organisation_id) {
        params.set('organisationId', userProfile.organisation_id);
      }
      const res = await fetchJson<{ items: User[] }>(`/data/users?${params.toString()}`);
      return res.items ?? [];
    },
  });

  const clientsLoading = canPickFromAllOrganisations
    ? useTenantClientRegistry
      ? tenantClientsLoading
      : orgsPickerLoading
    : legacyClientsLoading;
  const clientsFetchError = canPickFromAllOrganisations
    ? useTenantClientRegistry
      ? tenantClientsFetchError
      : orgsPickerError
    : legacyClientsFetchError;

  const clientOptions = useMemo(() => {
    if (canPickFromAllOrganisations && useTenantClientRegistry) {
      return tenantClientsForPicker
        .map((c) => ({
          client_slug: c.slug,
          label: c.name,
          organisation_id: c.organisation_id,
        }))
        .filter((row) => row.client_slug.trim() !== '')
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    if (canPickFromAllOrganisations) {
      return (organisationsForPicker as Organisation[])
        .map((o) => ({
          client_slug: o.slug,
          label: o.name,
        }))
        .filter((row) => row.client_slug.trim() !== '')
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    const bySlug = new Map<string, { client_slug: string; label: string }>();
    for (const u of clientUsers) {
      const slug = u.client_slug?.trim();
      if (!slug) continue;
      if (bySlug.has(slug)) continue;
      const name = u.name?.trim();
      bySlug.set(slug, { client_slug: slug, label: name || slug });
    }
    return Array.from(bySlug.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [
    canPickFromAllOrganisations,
    useTenantClientRegistry,
    tenantClientsForPicker,
    organisationsForPicker,
    clientUsers,
  ]);

  const organisationIdForCreate = useMemo(() => {
    if (isClientMode) return userProfile?.organisation_id ?? null;
    if (canPickFromAllOrganisations && manualClientSlug.trim()) {
      const key = normalizeOrgSlug(manualClientSlug);
      if (useTenantClientRegistry) {
        const client = tenantClientsForPicker.find((c) => normalizeOrgSlug(c.slug) === key);
        if (client?.organisation_id) return client.organisation_id;
      } else {
        const org = (organisationsForPicker as Organisation[]).find(
          (o) => normalizeOrgSlug(o.slug) === key
        );
        if (org?.id) return org.id;
      }
    }
    return userProfile?.organisation_id ?? null;
  }, [
    isClientMode,
    canPickFromAllOrganisations,
    useTenantClientRegistry,
    manualClientSlug,
    tenantClientsForPicker,
    organisationsForPicker,
    userProfile?.organisation_id,
  ]);

  const {
    data: clientNotificationEmails = [],
    isLoading: notifyEmailsLoading,
    isError: notifyEmailsError,
  } = useClientNotificationEmails({
    clientSlug: manualClientSlug,
    organisationId: organisationIdForCreate,
    enabled: Boolean(open && showRecipientPicker && manualClientSlug.trim()),
  });

  useEffect(() => {
    if (!showRecipientPicker || !manualClientSlug.trim()) {
      setSelectedNotifyEmails(new Set());
      setRecipientSearch('');
      return;
    }
    if (clientNotificationEmails.length > 0) {
      setSelectedNotifyEmails(new Set(clientNotificationEmails.map((row) => row.email)));
    } else {
      setSelectedNotifyEmails(new Set());
    }
  }, [manualClientSlug, clientNotificationEmails, showRecipientPicker]);

  const filteredNotifyEmails = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return clientNotificationEmails;
    return clientNotificationEmails.filter((row) => row.email.toLowerCase().includes(q));
  }, [clientNotificationEmails, recipientSearch]);

  const { categoryOptions, issueTypeOptions } = useOrgTicketConfigForCreate({
    organisationId: organisationIdForCreate,
    enabled: Boolean(open && organisationIdForCreate && session?.access_token),
  });

  // Mutation to create the ticket with validation
  const createTicketMutation = useMutation({
    mutationFn: async () => {
      if (!clientContext && !manualClientSlug.trim()) {
        throw new Error('Please select a client.');
      }

      const persistedClientSlug = clientContext
        ? normalizeOrgSlug(clientContext.clientSlug)
        : normalizeOrgSlug(manualClientSlug);
      if (!persistedClientSlug) {
        throw new Error('Client short name is required to create a ticket.');
      }

      const validatedTicket = CreateTicketSchema.parse({
        vehicle_number: vehicleNumber.trim() || null,
        category: effectiveCategory,
        issue_type: effectiveIssueType,
        location: location.trim(),
        state: ticketState,
        complaint_id: complaintId.trim() || null,
        source: 'MANUAL',
        needs_review: false,
        confidence_score: 100,
        priority: priorityLevel,
      });

      type TicketInsert = Record<string, unknown> & {
        client_slug?: string;
        organisation_id?: string;
      };
      const insertPayload: TicketInsert = {
        vehicle_number: validatedTicket.vehicle_number,
        category: validatedTicket.category,
        issue_type: validatedTicket.issue_type,
        location: validatedTicket.location,
        state: validatedTicket.state,
        complaint_id: validatedTicket.complaint_id,
        source: validatedTicket.source,
        needs_review: validatedTicket.needs_review,
        confidence_score: validatedTicket.confidence_score,
        priority: booleanFromPriorityLevel(validatedTicket.priority),
        priority_level: validatedTicket.priority,
        status: 'OPEN',
        opened_at: new Date().toISOString(),
        ...(clientContext
          ? {
              opened_by_email: clientContext.openedByEmail,
              client_slug: persistedClientSlug,
            }
          : { client_slug: persistedClientSlug }),
        ...(organisationIdForCreate ? { organisation_id: organisationIdForCreate } : {}),
      };

      const created = await fetchJson<{ ticket_number?: string }>(`/tickets`, {
        method: "POST",
        body: {
          ...insertPayload,
          description: description.trim() || null,
          ...(showRecipientPicker && selectedNotifyEmails.size > 0
            ? { notify_emails: Array.from(selectedNotifyEmails) }
            : {}),
        },
      });
      return created;
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh ticket list
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['organisations-stats'] });
      
      toast({
        title: 'Ticket Created Successfully',
        description: `Ticket ${data.ticket_number} has been created and is now open.`,
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
        title: 'Failed to Create Ticket',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setManualClientSlug('');
    setVehicleNumber('');
    setCategory('');
    setIssueType('');
    setCustomIssueType('');
    setCustomCategory('');
    setLocation('');
    setLocationTouched(false);
    setTicketState(null);
    setDescription('');
    setComplaintId('');
    setPriorityLevel(DEFAULT_PRIORITY_LEVEL);
    setSelectedNotifyEmails(new Set());
    setRecipientSearch('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation: at least category or issue type should be provided (unchanged)
    if (!category && !issueType) {
      toast({
        title: 'Missing Information',
        description: 'Please select at least a category or issue type.',
        variant: 'destructive',
      });
      return;
    }

    if (!isClientMode && !manualClientSlug.trim()) {
      toast({
        title: 'Client required',
        description: 'Please select a client before creating this ticket.',
        variant: 'destructive',
      });
      return;
    }

    if (category === 'Other' && !customCategory.trim()) {
      toast({
        title: 'Category required',
        description: 'Please describe the category when "Other" is selected.',
        variant: 'destructive',
      });
      return;
    }
    
    createTicketMutation.mutate();
  };

  const staffClientSelectDisabled =
    !isClientMode && (clientsLoading || clientOptions.length === 0 || clientsFetchError);
  const locationMissing = !location.trim();

  const staffSubmitBlocked =
    !isClientMode &&
    (clientsLoading || clientsFetchError || clientOptions.length === 0 || !manualClientSlug.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            {isClientMode ? 'Submit support request' : 'Create New Ticket'}
          </DialogTitle>
          <DialogDescription>
            {isClientMode
              ? 'Describe your issue below. Our team will review and assign a technician as needed.'
              : 'Manually create a service ticket. This ticket will be treated the same as email-generated tickets and can be assigned to Field Executives.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isClientMode && (
            <div className="space-y-2">
              <Label htmlFor="clientSlug">Client *</Label>
              <Select
                value={manualClientSlug || undefined}
                onValueChange={setManualClientSlug}
                disabled={staffClientSelectDisabled}
              >
                <SelectTrigger id="clientSlug" className="w-full">
                  <SelectValue
                    placeholder={
                      clientsLoading
                        ? 'Loading clients…'
                        : clientsFetchError
                          ? 'Could not load clients'
                          : clientOptions.length === 0
                            ? 'No clients available'
                            : 'Select client'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.client_slug} value={c.client_slug}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!clientsLoading && clientsFetchError && (
                <p className="text-sm text-destructive">Failed to load clients. Try again or check your connection.</p>
              )}
              {!clientsLoading && !clientsFetchError && clientOptions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {canPickFromAllOrganisations
                    ? useTenantClientRegistry
                      ? 'No active clients available. Add clients from the Clients page.'
                      : 'No tenants available.'
                    : 'No clients with a client short name are available. Add or configure client users first.'}
                </p>
              )}
            </div>
          )}

          {showRecipientPicker && manualClientSlug.trim() ? (
            <div className="space-y-2">
              <Label>Recipient Emails</Label>
              <p className="text-xs text-muted-foreground">
                Select who receives the ticket creation email.
              </p>
              {notifyEmailsLoading ? (
                <p className="text-sm text-muted-foreground">Loading email addresses…</p>
              ) : notifyEmailsError ? (
                <p className="text-sm text-destructive">Could not load client email addresses.</p>
              ) : clientNotificationEmails.length === 0 ? (
                <p className="text-sm text-muted-foreground">No client email addresses configured.</p>
              ) : (
                <>
                  {clientNotificationEmails.length > 5 ? (
                    <Input
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      placeholder="Search emails…"
                      className="w-full"
                      aria-label="Search recipient emails"
                    />
                  ) : null}
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border/60 p-3">
                    {filteredNotifyEmails.map((row) => {
                      const checked = selectedNotifyEmails.has(row.email);
                      const isPrimary = clientNotificationEmails[0]?.email === row.email;
                      return (
                        <label
                          key={row.email}
                          className="flex cursor-pointer items-start gap-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setSelectedNotifyEmails((prev) => {
                                const next = new Set(prev);
                                if (value === true) next.add(row.email);
                                else next.delete(row.email);
                                return next;
                              });
                            }}
                            aria-label={`Notify ${row.email}`}
                          />
                          <span className="min-w-0 flex-1 break-all">
                            <span className="font-medium">{row.email}</span>
                            {isPrimary ? (
                              <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                                Primary
                              </Badge>
                            ) : null}
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {row.source.replace(/_/g, ' ')}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {filteredNotifyEmails.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No emails match your search.</p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* Optional: Complaint/Reference ID */}
          <div className="space-y-2">
            <Label htmlFor="complaintId">Reference ID (Optional)</Label>
            <Input
              id="complaintId"
              placeholder="e.g., COMP-12345"
              value={complaintId}
              onChange={(e) => setComplaintId(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Vehicle Number */}
          <div className="space-y-2">
            <Label htmlFor="vehicleNumber">Vehicle Number (Optional)</Label>
            <Input
              id="vehicleNumber"
              placeholder="e.g., MH-12-AB-1234"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
              className="w-full font-mono"
            />
          </div>

          {/* Category — tenant Ticket Settings lists when configured, else constants */}
          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category === 'Other' && (
              <Input
                id="customCategory"
                placeholder="Specify category *"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="mt-1.5 w-full"
              />
            )}
          </div>

          {/* Issue Type — dropdown with custom entry when "Other" selected */}
          <div className="space-y-2">
            <Label htmlFor="issueType">Issue Type *</Label>
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger id="issueType" className="w-full">
                <SelectValue placeholder="Select issue type" />
              </SelectTrigger>
              <SelectContent>
                {issueTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {issueType === 'Other' && (
              <Input
                id="customIssueType"
                placeholder="Specify issue type (optional)"
                value={customIssueType}
                onChange={(e) => setCustomIssueType(e.target.value)}
                className="mt-1.5 w-full"
              />
            )}
          </div>

          {/* State */}
          <div className="space-y-2">
            <Label htmlFor="ticket-state">State</Label>
            <StateSelect
              id="ticket-state"
              value={ticketState}
              onValueChange={setTicketState}
              placeholder="Select state"
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">
              Location <span className="text-destructive">*</span>
            </Label>
            <Input
              id="location"
              placeholder="e.g., Mumbai, Andheri East"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onBlur={() => setLocationTouched(true)}
              aria-required="true"
              aria-invalid={locationTouched && locationMissing}
              className={
                locationTouched && locationMissing ? 'w-full border-destructive' : 'w-full'
              }
            />
            {locationTouched && locationMissing && (
              <p className="text-xs text-destructive">Location is required.</p>
            )}
          </div>

          {!isClientMode && (
            <div className="space-y-2">
              <Label>Priority</Label>
              <TicketPriorityRadioGroup
                value={priorityLevel}
                onValueChange={setPriorityLevel}
                idPrefix="create-priority"
              />
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Provide additional details about the issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createTicketMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createTicketMutation.isPending || staffSubmitBlocked || locationMissing}
              onClick={() => setLocationTouched(true)}
            >
              {createTicketMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isClientMode ? 'Submitting...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {isClientMode ? 'Submit request' : 'Create Ticket'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
