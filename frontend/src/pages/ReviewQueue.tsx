import { useMemo, useState } from 'react';
import { AppLayoutNew } from '@/components/layout/AppLayoutNew';
import { PageContainer } from '@/components/layout/PageContainer';
import { FilterBar, PageHeader, DataTableShell } from '@/components/common';
import {
  TicketsTable,
  TicketsTableEmptyState,
  TICKETS_TABLE_LOADING_LABEL,
} from '@/components/tickets/TicketsTable';
import { useTickets } from '@/hooks/useTickets';
import { sortTicketList, type TicketSortDir, type TicketSortKey } from '@/lib/ticketListSort';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';

export default function ReviewQueue() {
  const [sortBy, setSortBy] = useState<TicketSortKey>('created_at');
  const [sortDir, setSortDir] = useState<TicketSortDir>('desc');
  const { data: tickets, isLoading } = useTickets({ reviewQueue: true, scopeAllOrganisations: true });

  const sortedTickets = useMemo(
    () => sortTicketList(tickets ?? [], sortBy, sortDir),
    [tickets, sortBy, sortDir]
  );

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="Review Queue"
            description="Tickets awaiting additional details or Service Manager approval"
            icon={AlertTriangle}
          />

          <FilterBar
            aria-label="Review queue sort"
            secondary={
              <>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Sort by</Label>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as TicketSortKey)}>
                    <SelectTrigger className="h-9 w-[140px]" aria-label="Sort review queue by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="created_at">Created</SelectItem>
                      <SelectItem value="opened_at">Opened</SelectItem>
                      <SelectItem value="client_slug">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Direction</Label>
                  <Select value={sortDir} onValueChange={(v) => setSortDir(v as TicketSortDir)}>
                    <SelectTrigger className="h-9 w-[120px]" aria-label="Sort direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Newest first</SelectItem>
                      <SelectItem value="asc">Oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            }
          />

          <DataTableShell
            aria-label="Review queue tickets"
            loading={isLoading}
            loadingLabel={TICKETS_TABLE_LOADING_LABEL}
            emptyState={
              !isLoading && sortedTickets.length === 0 ? (
                <TicketsTableEmptyState />
              ) : undefined
            }
          >
            {!isLoading && sortedTickets.length > 0 ? (
              <TicketsTable tickets={sortedTickets} />
            ) : null}
          </DataTableShell>
        </div>
      </PageContainer>
    </AppLayoutNew>
  );
}
