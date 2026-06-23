import { useMemo, useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, MapPin, Building2, Tag, Truck } from 'lucide-react';
import { Ticket } from '@/lib/types';
import { useFieldExecutivesWithStats } from '@/hooks/useFieldExecutives';
import { useBulkAssignTickets, type BulkAssignResponse } from '@/hooks/useTickets';
import { toast } from '@/hooks/use-toast';
import { useTenantTerminology } from '@/hooks/useTenantTerminology';
import { TicketNumberDisplay } from '@/components/common/TicketNumberDisplay';

function normKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function computeGroupingHints(tickets: Ticket[]) {
  const hints: { label: string; count: number; icon: typeof MapPin }[] = [];
  if (tickets.length === 0) return hints;

  const byLocation = new Map<string, number>();
  const byClient = new Map<string, number>();
  const byIssue = new Map<string, number>();

  for (const t of tickets) {
    const loc = normKey(t.location);
    if (loc) byLocation.set(loc, (byLocation.get(loc) ?? 0) + 1);
    const client = normKey(t.client_slug);
    if (client) byClient.set(client, (byClient.get(client) ?? 0) + 1);
    const issue = normKey(t.issue_type || t.category);
    if (issue) byIssue.set(issue, (byIssue.get(issue) ?? 0) + 1);
  }

  const best = (map: Map<string, number>) => {
    let max = 0;
    let key = '';
    for (const [k, c] of map) {
      if (c > max) {
        max = c;
        key = k;
      }
    }
    return { key, count: max };
  };

  const loc = best(byLocation);
  if (loc.count >= 2) {
    hints.push({ label: `${loc.count} tickets share the same location`, count: loc.count, icon: MapPin });
  }
  const client = best(byClient);
  if (client.count >= 2) {
    hints.push({ label: `${client.count} tickets share client "${client.key}"`, count: client.count, icon: Building2 });
  }
  const issue = best(byIssue);
  if (issue.count >= 2) {
    hints.push({ label: `${issue.count} tickets share issue category`, count: issue.count, icon: Tag });
  }

  return hints;
}

interface BulkGroupAssignModalProps {
  tickets: Ticket[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Remove successfully assigned tickets from list selection when some fail. */
  onPartialSuccess?: (succeededTicketIds: string[]) => void;
}

export function BulkGroupAssignModal({
  tickets,
  open,
  onOpenChange,
  onSuccess,
  onPartialSuccess,
}: BulkGroupAssignModalProps) {
  const bulkAssign = useBulkAssignTickets();
  const terminology = useTenantTerminology(tickets[0]?.organisation_id);
  const { data: fieldExecutives, isLoading: feLoading } = useFieldExecutivesWithStats(undefined, {
    enabled: open,
  });

  const [feId, setFeId] = useState('');
  const [groupLabel, setGroupLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [assignmentDueLocal, setAssignmentDueLocal] = useState('');
  const [lastOutcome, setLastOutcome] = useState<BulkAssignResponse | null>(null);

  useEffect(() => {
    if (!open) {
      setFeId('');
      setGroupLabel('');
      setNotes('');
      setAssignmentDueLocal('');
      setLastOutcome(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && tickets.length === 0) {
      onOpenChange(false);
    }
  }, [open, tickets.length, onOpenChange]);

  const activeFes = useMemo(
    () => (fieldExecutives ?? []).filter((fe) => fe.active),
    [fieldExecutives]
  );

  const groupingHints = useMemo(() => computeGroupingHints(tickets), [tickets]);

  const failedResults = useMemo(
    () => (lastOutcome?.results ?? []).filter((r) => !r.success),
    [lastOutcome]
  );

  const handleSubmit = async () => {
    if (tickets.length === 0) {
      toast({ variant: 'destructive', title: 'No tickets to assign' });
      return;
    }
    if (!feId) {
      toast({
        variant: 'destructive',
        title: `Select a ${terminology.fieldExecutiveLabel.toLowerCase()}`,
      });
      return;
    }

    const dueIso =
      assignmentDueLocal.trim() !== ''
        ? (() => {
            const d = new Date(assignmentDueLocal);
            return Number.isNaN(d.getTime()) ? null : d.toISOString();
          })()
        : null;

    try {
      setLastOutcome(null);
      const data = await bulkAssign.mutateAsync({
        ticketIds: tickets.map((t) => t.id),
        feId,
        assignmentDueAt: dueIso,
        groupLabel: groupLabel.trim() || null,
        notes: notes.trim() || null,
      });
      setLastOutcome(data);

      const succeededIds = (data.results ?? []).filter((r) => r.success).map((r) => r.ticket_id);
      const failedCount = data.summary?.failed ?? 0;

      if (failedCount === 0) {
        onOpenChange(false);
        onSuccess?.();
        return;
      }

      if (succeededIds.length > 0) {
        onPartialSuccess?.(succeededIds);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bulk assignment failed';
      toast({ variant: 'destructive', title: 'Bulk assignment failed', description: message });
    }
  };

  const selectedFeName = activeFes.find((f) => f.id === feId)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto md:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Group &amp; Assign
          </DialogTitle>
          <DialogDescription>
            Assign {tickets.length} ticket{tickets.length === 1 ? '' : 's'} to one{' '}
            {terminology.fieldExecutiveLabel.toLowerCase()} in a single
            action. Each ticket keeps its own lifecycle and notifications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">{tickets.length} tickets selected</p>
            <ScrollArea className="mt-2 max-h-24">
              <ul className="space-y-1 text-xs text-muted-foreground">
                {tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-1">
                    <TicketNumberDisplay
                      ticketNumber={t.ticket_number}
                      organisationId={t.organisation_id}
                      variant="compact"
                    />
                    {t.location ? ` · ${t.location.slice(0, 40)}${t.location.length > 40 ? '…' : ''}` : ''}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>

          {groupingHints.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {groupingHints.map((h) => {
                const Icon = h.icon;
                return (
                  <Badge key={h.label} variant="secondary" className="gap-1 font-normal">
                    <Icon className="h-3 w-3" />
                    {h.label}
                  </Badge>
                );
              })}
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="bulk-fe">{terminology.fieldExecutiveLabel}</Label>
            {feLoading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading {terminology.fieldExecutivesLabel.toLowerCase()}…
              </div>
            ) : (
              <Select value={feId} onValueChange={setFeId}>
                <SelectTrigger id="bulk-fe">
                  <SelectValue placeholder={`Select ${terminology.fieldExecutiveLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {activeFes.map((fe) => (
                    <SelectItem key={fe.id} value={fe.id}>
                      {fe.name}
                      {fe.base_location ? ` · ${fe.base_location}` : ''}
                      {typeof fe.active_tickets === 'number' ? ` (${fe.active_tickets} active)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bulk-group-label">Group label (optional)</Label>
            <Input
              id="bulk-group-label"
              placeholder="e.g. Building A – AC outage"
              value={groupLabel}
              onChange={(e) => setGroupLabel(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bulk-notes">Notes (optional)</Label>
            <Textarea
              id="bulk-notes"
              placeholder="Operational notes for this batch"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bulk-due">Assignment deadline (optional)</Label>
            <Input
              id="bulk-due"
              type="datetime-local"
              value={assignmentDueLocal}
              onChange={(e) => setAssignmentDueLocal(e.target.value)}
            />
          </div>

          {selectedFeName && !lastOutcome && (
            <Alert>
              <AlertDescription className="text-sm">
                <span className="font-medium">Summary:</span> Assign {tickets.length} ticket
                {tickets.length === 1 ? '' : 's'} to <span className="font-medium">{selectedFeName}</span>.
                Email and SMS will be sent per ticket (existing notification behavior).
              </AlertDescription>
            </Alert>
          )}

          {lastOutcome && failedResults.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription className="text-sm space-y-2">
                <p>
                  <span className="font-medium">Partial result:</span> {lastOutcome.summary.succeeded} assigned,{' '}
                  {lastOutcome.summary.failed} failed. Successful tickets were removed from your selection.
                </p>
                <ul className="list-disc pl-4 text-xs max-h-28 overflow-y-auto">
                  {failedResults.map((r) => {
                    const orgId = tickets.find((t) => t.id === r.ticket_id)?.organisation_id;
                    return (
                      <li key={r.ticket_id} className="flex flex-wrap items-center gap-1">
                        <TicketNumberDisplay
                          ticketNumber={r.ticket_number ?? r.ticket_id}
                          organisationId={orgId}
                          variant="compact"
                        />
                        {r.error ? <span>— {r.error}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={bulkAssign.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={bulkAssign.isPending || !feId || tickets.length === 0}
          >
            {bulkAssign.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Assigning…
              </>
            ) : (
              `Assign ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
