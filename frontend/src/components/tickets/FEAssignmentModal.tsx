/**
 * FEAssignmentModal.tsx
 *
 * Modal for assigning Field Executives to tickets with recommendations.
 * Includes confirmation pop-up before assignment (Requirement 3).
 * Optional Assignment Context: multiple images each with its own remark.
 */

import { useState, useMemo, useEffect, useRef, type ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AssignmentConfirmDialog } from './AssignmentConfirmDialog';
import { StateSelect } from './StateSelect';
import {
  MapPin,
  Star,
  Truck,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Search,
  Briefcase,
  ImagePlus,
  X,
} from 'lucide-react';
import { Ticket, FieldExecutive } from '@/lib/types';
import { useTenantTerminology } from '@/hooks/useTenantTerminology';
import { TicketNumberDisplay } from '@/components/common/TicketNumberDisplay';
import { useFieldExecutivesWithStats } from '@/hooks/useFieldExecutives';
import { useAssignTicket, useReassignTicket, type AssignmentContextImagePayload } from '@/hooks/useTickets';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { compressProofImage } from '@/lib/compressProofImage';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/backendDataApi';
import type { User } from '@/lib/types';

type AssigneeKind = 'FIELD_EXECUTIVE' | 'SERVICE_MANAGER';

type ContextImageDraft = {
  id: string;
  previewUrl: string;
  remark: string;
  payload: AssignmentContextImagePayload;
};

const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_CONTEXT_IMAGES = 10;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

interface FEAssignmentModalProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `reassign` uses POST /tickets/:id/reassign; default is first-time assign. */
  mode?: 'assign' | 'reassign';
  /** Pre-fill optional assignment due (`datetime-local` format). */
  initialAssignmentDueLocal?: string;
}

interface ScoredFE extends FieldExecutive {
  score: number;
  locationMatch: boolean;
  skillMatch: boolean;
  activeTickets: number;
}

export function FEAssignmentModal({
  ticket,
  open,
  onOpenChange,
  mode = 'assign',
  initialAssignmentDueLocal = '',
}: FEAssignmentModalProps) {
  const isReassign = mode === 'reassign';
  const terminology = useTenantTerminology(ticket.organisation_id);
  const { data: fieldExecutives, isLoading } = useFieldExecutivesWithStats(
    ticket.organisation_id ?? undefined,
    { enabled: open }
  );
  const assignTicket = useAssignTicket();
  const reassignTicket = useReassignTicket();
  const submitMutation = isReassign ? reassignTicket : assignTicket;
  const [assigneeKind, setAssigneeKind] = useState<AssigneeKind>('FIELD_EXECUTIVE');
  const [selectedFE, setSelectedFE] = useState<string | null>(null);
  const [selectedSmUserId, setSelectedSmUserId] = useState<string | null>(null);
  const [assignmentRemarks, setAssignmentRemarks] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  /** Optional deadline for assignment (`datetime-local` value → ISO when confirming). */
  const [assignmentDueLocal, setAssignmentDueLocal] = useState('');
  const [ticketState, setTicketState] = useState<string | null>(ticket.state ?? null);
  const [contextImages, setContextImages] = useState<ContextImageDraft[]>([]);
  const [contextUploadError, setContextUploadError] = useState<string | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: serviceManagers = [], isLoading: smLoading } = useQuery({
    queryKey: ['assignable-service-managers', ticket.organisation_id],
    enabled: open && assigneeKind === 'SERVICE_MANAGER',
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200', offset: '0', role: 'STAFF' });
      if (ticket.organisation_id) params.set('organisationId', ticket.organisation_id);
      const res = await fetchJson<{ items?: User[] } | User[]>(`/data/users?${params}`);
      const items = Array.isArray(res) ? res : res.items ?? [];
      const ticketOrg = ticket.organisation_id ? String(ticket.organisation_id) : null;
      return items.filter((u) => {
        if (!(u.role === 'STAFF' || u.role === 'ADMIN')) return false;
        if (u.active === false || (u as { is_active?: boolean }).is_active === false) return false;
        if (ticketOrg && u.organisation_id != null && String(u.organisation_id) !== ticketOrg) {
          return false;
        }
        return true;
      });
    },
  });

  useEffect(() => {
    if (open) {
      setTicketState(ticket.state ?? null);
      setAssignmentDueLocal(initialAssignmentDueLocal);
    }
  }, [open, ticket.state, initialAssignmentDueLocal]);

  useEffect(() => {
    if (!open) {
      setAssigneeKind('FIELD_EXECUTIVE');
      setSelectedFE(null);
      setSelectedSmUserId(null);
      setAssignmentRemarks('');
      setSearchQuery('');
      setConfirmDialogOpen(false);
      setAssignmentDueLocal('');
      setTicketState(null);
      setContextImages((prev) => {
        for (const img of prev) URL.revokeObjectURL(img.previewUrl);
        return [];
      });
      setContextUploadError(null);
      setContextBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  // Calculate recommendations based on location and skill matching
  const scoredExecutives = useMemo(() => {
    if (!fieldExecutives) return [];

    const ticketOrg = ticket.organisation_id ? String(ticket.organisation_id) : null;
    const ticketLocation = ticket.location?.toLowerCase() || '';
    const ticketIssueType = ticket.issue_type?.toLowerCase() || '';
    const ticketCategory = ticket.category?.toLowerCase() || '';

    return fieldExecutives
      .filter((fe) => {
        if (!fe.active) return false;
        // Never recommend / assign an FE from another organisation.
        if (ticketOrg && fe.organisation_id != null && String(fe.organisation_id) !== ticketOrg) {
          return false;
        }
        return true;
      })
      .map(fe => {
        let score = 0;
        let locationMatch = false;
        let skillMatch = false;

        // Location matching (40 points max)
        const feLocation = fe.base_location?.toLowerCase() || '';
        if (ticketLocation && feLocation) {
          if (ticketLocation.includes(feLocation) || feLocation.includes(ticketLocation)) {
            score += 40;
            locationMatch = true;
          } else {
            // Partial match for city names
            const ticketWords = ticketLocation.split(/[\s,]+/);
            const feWords = feLocation.split(/[\s,]+/);
            const hasCommonWord = ticketWords.some(tw => 
              feWords.some(fw => tw.length > 3 && fw.length > 3 && (tw.includes(fw) || fw.includes(tw)))
            );
            if (hasCommonWord) {
              score += 20;
              locationMatch = true;
            }
          }
        }

        // Skill matching (40 points max)
        const skills = fe.skills as { categories?: string[] } | null;
        const feSkills = skills?.categories || [];
        if (feSkills.length > 0) {
          const skillsLower = feSkills.map(s => s.toLowerCase());
          if (ticketIssueType && skillsLower.some(s => s.includes(ticketIssueType) || ticketIssueType.includes(s))) {
            score += 40;
            skillMatch = true;
          } else if (ticketCategory && skillsLower.some(s => s.includes(ticketCategory) || ticketCategory.includes(s))) {
            score += 20;
            skillMatch = true;
          }
        }

        // Workload penalty (up to -20 points)
        const activeTickets = fe.active_tickets || 0;
        if (activeTickets > 5) {
          score -= 20;
        } else if (activeTickets > 3) {
          score -= 10;
        } else if (activeTickets > 0) {
          score -= 5;
        }

        return {
          ...fe,
          score,
          locationMatch,
          skillMatch,
          activeTickets
        } as ScoredFE;
      })
      .sort((a, b) => b.score - a.score);
  }, [fieldExecutives, ticket]);

  // Get top 2 recommendations
  const recommendations = scoredExecutives.slice(0, 2);
  const isRecommended = (feId: string) => recommendations.some(r => r.id === feId);

  // Filter by search
  const filteredExecutives = scoredExecutives.filter(fe => 
    fe.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fe.base_location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get the selected FE object for confirmation dialog
  const selectedFEObject = useMemo(() => {
    if (!selectedFE) return null;
    return filteredExecutives.find(fe => fe.id === selectedFE) || null;
  }, [selectedFE, filteredExecutives]);

  const onContextFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0) return;

    setContextBusy(true);
    setContextUploadError(null);
    try {
      const remaining = MAX_CONTEXT_IMAGES - contextImages.length;
      if (remaining <= 0) {
        setContextUploadError(`At most ${MAX_CONTEXT_IMAGES} images are allowed.`);
        return;
      }
      const toProcess = files.slice(0, remaining);
      const next: ContextImageDraft[] = [];
      for (const file of toProcess) {
        if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
          setContextUploadError('Images must be JPEG, PNG, or WebP.');
          continue;
        }
        const { file: compressed } = await compressProofImage(file);
        if (compressed.size > MAX_UPLOAD_BYTES) {
          setContextUploadError(
            `Each image must be under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`
          );
          continue;
        }
        const dataBase64 = await fileToBase64(compressed);
        const previewUrl = URL.createObjectURL(compressed);
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          previewUrl,
          remark: '',
          payload: {
            contentType: compressed.type || 'image/jpeg',
            filename: compressed.name || 'assignment-context.jpg',
            dataBase64,
            remark: '',
          },
        });
      }
      if (next.length > 0) {
        setContextImages((prev) => [...prev, ...next].slice(0, MAX_CONTEXT_IMAGES));
      }
    } catch (err) {
      setContextUploadError(err instanceof Error ? err.message : 'Failed to read image');
    } finally {
      setContextBusy(false);
    }
  };

  const removeContextImage = (id: string) => {
    setContextImages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const updateContextRemark = (id: string, remark: string) => {
    setContextImages((prev) =>
      prev.map((img) =>
        img.id === id
          ? { ...img, remark, payload: { ...img.payload, remark } }
          : img
      )
    );
  };

  // Handle clicking the assign button - shows confirmation dialog
  const handleAssignClick = () => {
    if (assigneeKind === 'SERVICE_MANAGER') {
      if (!selectedSmUserId) return;
    } else if (!selectedFE) {
      return;
    }
    setConfirmDialogOpen(true);
  };

  // Handle actual assignment after confirmation
  const handleConfirmAssign = async () => {
    if (assigneeKind === 'SERVICE_MANAGER' ? !selectedSmUserId : !selectedFE) return;

    try {
      const dueIso =
        assignmentDueLocal.trim() !== ''
          ? (() => {
              const d = new Date(assignmentDueLocal);
              return Number.isNaN(d.getTime()) ? null : d.toISOString();
            })()
          : null;

      await submitMutation.mutateAsync({
        ticketId: ticket.id,
        assignmentType: assigneeKind,
        feId: assigneeKind === 'FIELD_EXECUTIVE' ? selectedFE : null,
        assignedUserId: assigneeKind === 'SERVICE_MANAGER' ? selectedSmUserId : null,
        assignmentRemarks: assignmentRemarks.trim() || null,
        assignmentDueAt: dueIso,
        state: ticketState,
        contextImages:
          contextImages.length > 0
            ? contextImages.map((img) => ({
                ...img.payload,
                remark: img.remark,
              }))
            : undefined,
      });

      setConfirmDialogOpen(false);
      onOpenChange(false);
      setSelectedFE(null);
      setSelectedSmUserId(null);
    } catch (error) {
      setConfirmDialogOpen(false);
      const message = error instanceof Error ? error.message : isReassign ? "Reassignment failed" : "Assignment failed";
      toast({
        variant: "destructive",
        title: isReassign ? "Reassignment failed" : "Assignment failed",
        description: message,
      });
    }
  };

  const feLabel = terminology.fieldExecutiveLabel;
  const modalTitle = isReassign
    ? `Reassign ticket`
    : `Assign ticket`;
  const modalDescription = isReassign
    ? `Choose a Field Executive or Service Manager for ticket`
    : `Assign to a Field Executive or Service Manager for ticket`;

  const selectedIsRecommended = selectedFE ? isRecommended(selectedFE) : true;
  const canSubmit =
    assigneeKind === 'SERVICE_MANAGER' ? Boolean(selectedSmUserId) : Boolean(selectedFE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg md:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {modalTitle}
          </DialogTitle>
          <DialogDescription>
            {modalDescription}{' '}
            <TicketNumberDisplay
              ticketNumber={ticket.ticket_number}
              organisationId={ticket.organisation_id}
              variant="default"
            />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Ticket Context */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Location:</span>
                <span className="font-medium">{ticket.location || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Issue:</span>
                <span className="font-medium">{ticket.issue_type || ticket.category || 'Not specified'}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assign To</Label>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="assignee-kind"
                  checked={assigneeKind === 'FIELD_EXECUTIVE'}
                  onChange={() => {
                    setAssigneeKind('FIELD_EXECUTIVE');
                    setSelectedSmUserId(null);
                  }}
                />
                Field Executive
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="assignee-kind"
                  checked={assigneeKind === 'SERVICE_MANAGER'}
                  onChange={() => {
                    setAssigneeKind('SERVICE_MANAGER');
                    setSelectedFE(null);
                  }}
                />
                Service Manager
              </label>
            </div>
            {assigneeKind === 'SERVICE_MANAGER' ? (
              <p className="text-xs text-muted-foreground">
                Internal resolution — no onsite or resolution tokens. Service Manager uploads proof and submits for verification.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-ticket-state">State</Label>
            <StateSelect
              id="assign-ticket-state"
              value={ticketState}
              onValueChange={setTicketState}
              placeholder="Select state"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-remarks">Assignment Remarks</Label>
            <Textarea
              id="assign-remarks"
              value={assignmentRemarks}
              onChange={(e) => setAssignmentRemarks(e.target.value)}
              placeholder="Optional remarks for the assignee"
              className="min-h-[72px]"
            />
          </div>

          {assigneeKind === 'FIELD_EXECUTIVE' ? (
          <>
          {/* Recommendations Banner */}
          {recommendations.length > 0 && (
            <Alert className="border-primary/50 bg-primary/5">
              <Star className="h-4 w-4 text-primary" />
              <AlertDescription>
                <span className="font-semibold">AI Recommendations:</span> Based on location and skill matching, 
                we recommend <span className="font-medium">{recommendations.map(r => r.name).join(' or ')}</span>.
              </AlertDescription>
            </Alert>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${terminology.fieldExecutivesLabel.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* FE List */}
          <ScrollArea className="h-[280px] rounded-lg border">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredExecutives.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                No {terminology.fieldExecutivesLabel.toLowerCase()} found
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {filteredExecutives.map((fe) => {
                  const recommended = isRecommended(fe.id);
                  const isSelected = selectedFE === fe.id;
                  
                  return (
                    <div
                      key={fe.id}
                      onClick={() => setSelectedFE(fe.id)}
                      className={cn(
                        'relative flex items-center gap-4 rounded-lg border p-3 cursor-pointer transition-all',
                        isSelected 
                          ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                          : 'hover:bg-muted/50',
                        recommended && 'border-primary/50'
                      )}
                    >
                      {/* Recommended Badge */}
                      {recommended && (
                        <Badge className="absolute -top-2 right-2 bg-primary text-primary-foreground">
                          <Star className="mr-1 h-3 w-3" />
                          Recommended
                        </Badge>
                      )}

                      {/* Selection Indicator */}
                      <div className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                        isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                      )}>
                        {isSelected && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                      </div>

                      {/* FE Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{fe.name}</span>
                          {fe.locationMatch && (
                            <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                              <MapPin className="mr-1 h-3 w-3" />
                              Location Match
                            </Badge>
                          )}
                          {fe.skillMatch && (
                            <Badge variant="outline" className="text-xs border-blue-500 text-blue-600">
                              <Briefcase className="mr-1 h-3 w-3" />
                              Skill Match
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {fe.base_location || 'No location'}
                          </span>
                          <span>•</span>
                          <span>{fe.activeTickets} active tickets</span>
                        </div>
                      </div>

                      {/* Score */}
                      <div className="text-right">
                        <div className="text-sm font-semibold">{fe.score}</div>
                        <div className="text-xs text-muted-foreground">score</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          </>
          ) : (
          <ScrollArea className="h-[280px] rounded-lg border">
            {smLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : serviceManagers.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                No Service Managers found for this organisation
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {serviceManagers
                  .filter((u) =>
                    !searchQuery.trim()
                      ? true
                      : `${u.name} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((user) => {
                    const isSelected = selectedSmUserId === user.id;
                    return (
                      <div
                        key={user.id}
                        onClick={() => setSelectedSmUserId(user.id)}
                        className={cn(
                          'relative flex items-center gap-4 rounded-lg border p-3 cursor-pointer transition-all',
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                            isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                          )}
                        >
                          {isSelected && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                        </div>
                        <Badge variant="outline">{user.role === 'ADMIN' ? 'Admin' : 'Service Manager'}</Badge>
                      </div>
                    );
                  })}
              </div>
            )}
          </ScrollArea>
          )}

          {assigneeKind === 'FIELD_EXECUTIVE' ? (
          <div className="space-y-2">
            <Label htmlFor="assignment-due">Assignment deadline (optional)</Label>
            <Input
              id="assignment-due"
              type="datetime-local"
              value={assignmentDueLocal}
              onChange={(e) => setAssignmentDueLocal(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              If set, sent as <code className="text-xs">assignment_due_at</code> when the server supports it.
            </p>
          </div>
          ) : null}

          {/* Assignment Context */}
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm font-semibold">Assignment Context</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Optional photos with remarks the assignee can review
                  {assigneeKind === 'FIELD_EXECUTIVE' ? ' before visiting the site' : ''}.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  contextBusy ||
                  submitMutation.isPending ||
                  contextImages.length >= MAX_CONTEXT_IMAGES
                }
                onClick={() => fileInputRef.current?.click()}
              >
                {contextBusy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="mr-1 h-4 w-4" />
                )}
                Add image
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={onContextFiles}
              />
            </div>
            {contextUploadError && (
              <p className="text-xs text-destructive">{contextUploadError}</p>
            )}
            {contextImages.length > 0 && (
              <ul className="space-y-3">
                {contextImages.map((img, idx) => (
                  <li key={img.id} className="rounded-md border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-start gap-3">
                      <img
                        src={img.previewUrl}
                        alt={`Assignment context ${idx + 1}`}
                        className="h-20 w-20 rounded border object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">Image {idx + 1}</p>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => removeContextImage(img.id)}
                            disabled={submitMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <Label htmlFor={`assign-ctx-remark-${img.id}`} className="text-xs">
                          Remark
                        </Label>
                        <Textarea
                          id={`assign-ctx-remark-${img.id}`}
                          placeholder="e.g. The damaged meter is behind the transformer."
                          value={img.remark}
                          onChange={(e) => updateContextRemark(img.id, e.target.value)}
                          className="min-h-[72px] whitespace-pre-wrap text-sm"
                          maxLength={4000}
                          disabled={submitMutation.isPending}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Override Reason (only if selecting non-recommended) */}
          {assigneeKind === 'FIELD_EXECUTIVE' && selectedFE && !selectedIsRecommended && (
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                This field executive is not in the top recommendations, but you can still assign freely.
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignClick}
              disabled={!canSubmit || submitMutation.isPending || contextBusy}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isReassign ? 'Reassigning...' : 'Assigning...'}
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {isReassign ? 'Reassign' : 'Assign'}
                  {assigneeKind === 'SERVICE_MANAGER'
                    ? ` to ${serviceManagers.find((u) => u.id === selectedSmUserId)?.name || 'Service Manager'}`
                    : ` to ${selectedFEObject?.name || 'Selected FE'}`}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Confirmation Dialog - Requirement 3 */}
      {assigneeKind === 'FIELD_EXECUTIVE' && selectedFEObject && (
        <AssignmentConfirmDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          ticket={ticket}
          fieldExecutive={{
            ...selectedFEObject,
            locationMatch: selectedFEObject.locationMatch,
            skillMatch: selectedFEObject.skillMatch,
          }}
          isRecommended={isRecommended(selectedFE!)}
          onConfirm={handleConfirmAssign}
          isPending={submitMutation.isPending}
        />
      )}
      {assigneeKind === 'SERVICE_MANAGER' && selectedSmUserId && confirmDialogOpen && (
        <AssignmentConfirmDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          ticket={ticket}
          fieldExecutive={{
            id: selectedSmUserId,
            name: serviceManagers.find((u) => u.id === selectedSmUserId)?.name || 'Service Manager',
            email: serviceManagers.find((u) => u.id === selectedSmUserId)?.email || null,
            phone: null,
            base_location: null,
            skills: null,
            active: true,
            organisation_id: ticket.organisation_id ?? null,
            created_at: '',
          }}
          isRecommended={true}
          onConfirm={handleConfirmAssign}
          isPending={submitMutation.isPending}
        />
      )}
    </Dialog>
  );
}
