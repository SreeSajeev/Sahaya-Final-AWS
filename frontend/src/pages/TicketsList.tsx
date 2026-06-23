import { useState, useMemo, useEffect, useCallback } from 'react';
import { AppLayoutNew } from '@/components/layout/AppLayoutNew';
import { PageContainer } from '@/components/layout/PageContainer';
import { DataTableShell, PageHeader } from '@/components/common';
import {
  TicketsTable,
  TicketsTableEmptyState,
  TICKETS_TABLE_LOADING_LABEL,
} from '@/components/tickets/TicketsTable';
import { TicketFiltersBar } from '@/components/tickets/TicketFiltersBar';
import { CreateTicketModal } from '@/components/tickets/CreateTicketModal';
import { TicketCreationChooserModal } from '@/components/tickets/TicketCreationChooserModal';
import { BulkTicketImportModal } from '@/components/tickets/BulkTicketImportModal';
import { BulkAssignToolbar } from '@/components/tickets/BulkAssignToolbar';
import { BulkGroupAssignModal } from '@/components/tickets/BulkGroupAssignModal';
import { useTickets, isTicketBulkAssignable } from '@/hooks/useTickets';
import { useAuth } from '@/hooks/useAuth';
import { canRoleBulkAssign, isBulkAssignFeatureEnabled } from '@/lib/bulkAssignFeature';
import {
  canRoleBulkTicketImport,
  isBulkTicketImportEnabled,
} from '@/lib/bulkTicketImportFeature';
import { toast } from '@/hooks/use-toast';
import { useTicketListSupplement } from '@/hooks/useTicketListSupplement';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useOrganisationsTable } from '@/hooks/useOrganisationsTable';
import { useTenantClients } from '@/hooks/useTenantClients';
import {
  buildTicketClientSearchLookup,
  resolveTicketSearchHints,
} from '@/lib/ticketSearch';
import {
  distinctClientSlugsFromTickets,
  normalizeOrgSlug,
} from '@/lib/tenantTicketsSupabase';
import { TicketFilters, type Ticket } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Plus, ChevronLeft, ChevronRight, Ticket as TicketIcon } from 'lucide-react';
import { sortTicketList, type TicketSortKey, type TicketSortDir } from '@/lib/ticketListSort';

const PAGE_SIZE = 25;
/** Request enough rows from PostgREST so search runs on the org’s dataset (still capped by project max_rows). */
const ALL_TICKETS_MAX_ROWS = 10_000;

function createdDayUtc(iso: string): string {
  return String(iso).slice(0, 10);
}

function inCreatedDateRange(iso: string, fromYmd: string, toYmd: string): boolean {
  if (!fromYmd && !toYmd) return true;
  const day = createdDayUtc(iso);
  if (fromYmd && day < fromYmd) return false;
  if (toYmd && day > toYmd) return false;
  return true;
}

function ticketMatchesClientSlugFilter(
  ticket: Ticket,
  clientSlugFilter: string | null | undefined
): boolean {
  if (!clientSlugFilter || !String(clientSlugFilter).trim()) return true;
  const target = normalizeOrgSlug(clientSlugFilter);
  if (!target) return true;
  return normalizeOrgSlug(ticket.client_slug) === target;
}

/**
 * TicketsList page with manual ticket creation capability.
 * Service Manager can create tickets directly via the "Create Ticket" button.
 */
export default function TicketsList() {
  const { userProfile } = useAuth();
  const canBulkAssign =
    isBulkAssignFeatureEnabled() && canRoleBulkAssign(userProfile?.role);
  const showTicketCreationChooser =
    isBulkTicketImportEnabled() && canRoleBulkTicketImport(userProfile?.role);

  const [filterState, setFilterState] = useState<TicketFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(1);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creationChooserOpen, setCreationChooserOpen] = useState(false);
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const [sortBy, setSortBy] = useState<TicketSortKey>('created_at');
  const [sortDir, setSortDir] = useState<TicketSortDir>('desc');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');

  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';
  const { data: organisations = [] } = useOrganisationsTable();
  const { data: tenantClients = [] } = useTenantClients({
    organisationId: isSuperAdmin ? null : (userProfile?.organisation_id ?? null),
  });

  const searchClientLookup = useMemo(
    () => buildTicketClientSearchLookup(organisations, tenantClients),
    [organisations, tenantClients]
  );

  const searchHints = useMemo(
    () => resolveTicketSearchHints(debouncedSearch, organisations, tenantClients),
    [debouncedSearch, organisations, tenantClients]
  );

  const queryFilters = useMemo((): TicketFilters => {
    const trimmed = debouncedSearch.trim();
    const { clientSlug: _omitClientSlug, ...listFilters } = filterState;
    return {
      ...listFilters,
      search: trimmed.length > 0 ? trimmed : undefined,
      searchMatchingClientSlugs: searchHints.extraClientSlugs,
      searchMatchingOrganisationIds: searchHints.extraOrganisationIds,
      searchClientLookup: trimmed.length > 0 ? searchClientLookup : undefined,
    };
  }, [filterState, debouncedSearch, searchHints, searchClientLookup]);

  const { data: ticketsRaw, isLoading } = useTickets(queryFilters, {
    maxRows: ALL_TICKETS_MAX_ROWS,
  });

  const clientFilterOptions = useMemo(() => {
    const slugs = distinctClientSlugsFromTickets(ticketsRaw ?? []);
    return slugs.map((slug) => {
      const lookupKey = slug.trim().toLowerCase().replace(/\s+/g, '-');
      const label = searchClientLookup.clientNameBySlug[lookupKey]?.trim() || slug;
      return { value: slug, label };
    });
  }, [ticketsRaw, searchClientLookup]);

  const processedTickets = useMemo((): Ticket[] => {
    const list = [...(ticketsRaw ?? [])]
      .filter((t) => ticketMatchesClientSlugFilter(t, filterState.clientSlug))
      .filter((t) =>
        inCreatedDateRange(t.created_at ?? t.opened_at, createdFrom, createdTo)
      );
    return sortTicketList(list, sortBy, sortDir);
  }, [ticketsRaw, filterState.clientSlug, createdFrom, createdTo, sortBy, sortDir]);

  const total = processedTickets.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [
    queryFilters.search,
    queryFilters.status,
    queryFilters.confidenceRange,
    queryFilters.priorityLevel,
    queryFilters.state,
    filterState.clientSlug,
    queryFilters.organisationId,
    queryFilters.scopeAllOrganisations,
    createdFrom,
    createdTo,
    sortBy,
    sortDir,
  ]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedTickets = useMemo(() => {
    if (!processedTickets.length) return [];
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return processedTickets.slice(start, start + PAGE_SIZE);
  }, [processedTickets, page, totalPages]);

  const supplementIds = useMemo(
    () => paginatedTickets.map((t) => t.id),
    [paginatedTickets]
  );
  const { data: rowExtra = {} } = useTicketListSupplement(supplementIds);

  const hasActiveFilters = Boolean(
    debouncedSearch.trim() ||
      (queryFilters.status && queryFilters.status !== 'all') ||
      (filterState.clientSlug && String(filterState.clientSlug).trim()) ||
      (queryFilters.confidenceRange && queryFilters.confidenceRange !== 'all') ||
      (queryFilters.priorityLevel && queryFilters.priorityLevel !== 'all') ||
      (queryFilters.state && String(queryFilters.state).trim()) ||
      createdFrom ||
      createdTo
  );

  const selectedTickets = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return processedTickets.filter((t) => selectedIds.has(t.id));
  }, [processedTickets, selectedIds]);

  const assignableSelectedTickets = useMemo(
    () => selectedTickets.filter((t) => isTicketBulkAssignable(t.status)),
    [selectedTickets]
  );

  const handleToggleTicket = useCallback((ticketId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(ticketId);
      else next.delete(ticketId);
      return next;
    });
  }, []);

  const handleTogglePage = useCallback((ticketIds: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ticketIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(processedTickets.map((t) => t.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [processedTickets]);

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="All Tickets"
            description="Manage and track all service tickets"
            icon={TicketIcon}
            actions={
              <Button
                onClick={() =>
                  showTicketCreationChooser
                    ? setCreationChooserOpen(true)
                    : setCreateModalOpen(true)
                }
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Ticket
              </Button>
            }
          />

          <TicketFiltersBar
            filters={filterState}
            onFiltersChange={setFilterState}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            clientOptions={clientFilterOptions}
            secondary={
              <>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Created from</Label>
                  <Input
                    type="date"
                    value={createdFrom}
                    onChange={(e) => setCreatedFrom(e.target.value)}
                    className="h-9 w-[150px]"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Created to</Label>
                  <Input
                    type="date"
                    value={createdTo}
                    onChange={(e) => setCreatedTo(e.target.value)}
                    className="h-9 w-[150px]"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Sort by</Label>
                  <Select
                    value={sortBy}
                    onValueChange={(v) => setSortBy(v as TicketSortKey)}
                  >
                    <SelectTrigger className="h-9 w-[140px]">
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
                  <Select
                    value={sortDir}
                    onValueChange={(v) => setSortDir(v as 'asc' | 'desc')}
                  >
                    <SelectTrigger className="h-9 w-[120px]">
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
            aria-label="All tickets"
            loading={isLoading}
            loadingLabel={TICKETS_TABLE_LOADING_LABEL}
            emptyState={
              !isLoading && total === 0 ? (
                <TicketsTableEmptyState filterEmpty={hasActiveFilters} />
              ) : undefined
            }
          >
            {!isLoading && total > 0 ? (
              <TicketsTable
                layout="allTickets"
                tickets={paginatedTickets}
                rowExtra={rowExtra}
                selectable={canBulkAssign}
                selectedIds={selectedIds}
                onToggleTicket={handleToggleTicket}
                onTogglePage={handleTogglePage}
              />
            ) : null}
          </DataTableShell>

          {canBulkAssign && (
            <>
              <BulkAssignToolbar
                selectedCount={selectedIds.size}
                assignableCount={assignableSelectedTickets.length}
                onGroupAssign={() => {
                  if (assignableSelectedTickets.length === 0) {
                    toast({
                      variant: 'destructive',
                      title: 'No assignable tickets',
                      description:
                        'Only OPEN or FE_ATTEMPT_FAILED tickets can be bulk-assigned. Change your selection or status filters.',
                    });
                    return;
                  }
                  setBulkModalOpen(true);
                }}
                onClearSelection={clearSelection}
              />
              <BulkGroupAssignModal
                tickets={assignableSelectedTickets}
                open={bulkModalOpen}
                onOpenChange={setBulkModalOpen}
                onSuccess={clearSelection}
                onPartialSuccess={(succeededIds) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of succeededIds) next.delete(id);
                    return next;
                  });
                }}
              />
            </>
          )}

          {!isLoading && total > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Showing {(Math.min(page, totalPages) - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="tabular-nums px-2">
                  Page {Math.min(page, totalPages)} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {showTicketCreationChooser && (
          <TicketCreationChooserModal
            open={creationChooserOpen}
            onOpenChange={setCreationChooserOpen}
            onContinue={(mode) => {
              if (mode === 'single') setCreateModalOpen(true);
              else setBulkImportModalOpen(true);
            }}
          />
        )}
        <CreateTicketModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
        {showTicketCreationChooser && (
          <BulkTicketImportModal
            open={bulkImportModalOpen}
            onOpenChange={setBulkImportModalOpen}
          />
        )}
      </PageContainer>
    </AppLayoutNew>
  );
}
