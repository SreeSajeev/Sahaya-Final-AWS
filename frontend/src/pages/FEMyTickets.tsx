import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { TicketComment, TicketStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DataTableShell,
  DataTableEmptyState,
} from '@/components/common';
import { FETicketFiltersBar } from '@/components/fe/FETicketFiltersBar';
import { FETicketsTable } from '@/components/fe/FETicketsTable';
import {
  collectFETicketFacetOptions,
  filterAndSortFETickets,
  filterFETicketsByDateRange,
  validateFEDateRange,
  type FETicketRow,
  type FETicketSortKey,
  type FEWorkTypeFilter,
} from '@/lib/feTicketList';
import {
  downloadFieldVisitCsv,
  openFieldVisitPrintWindow,
  type FERemarkLine,
} from '@/lib/feFieldVisitExport';
import {
  Truck,
  AlertTriangle,
  LogOut,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  Printer,
  Download,
} from 'lucide-react';
import { fetchJson } from '@/lib/backendDataApi';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 25;

export default function FEMyTickets() {
  const { user, userProfile, signOut, isFieldExecutive, isClient, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [workTypeFilter, setWorkTypeFilter] = useState<FEWorkTypeFilter>('all');
  const [sortKey, setSortKey] = useState<FETicketSortKey>('newest');
  const [stateFilter, setStateFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [visitFrom, setVisitFrom] = useState('');
  const [visitTo, setVisitTo] = useState('');
  const [visitBusy, setVisitBusy] = useState(false);
  const [visitSheetTickets, setVisitSheetTickets] = useState<FETicketRow[] | null>(null);
  const [visitRemarks, setVisitRemarks] = useState<Record<string, FERemarkLine[]>>({});
  const [visitError, setVisitError] = useState<string | null>(null);

  useEffect(() => {
    if (!userProfile || isFieldExecutive) return;
    navigate(isClient ? '/app/client' : '/app', { replace: true });
  }, [userProfile, isFieldExecutive, isClient, navigate]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    statusFilter,
    workTypeFilter,
    sortKey,
    stateFilter,
    locationFilter,
    customerFilter,
  ]);

  const {
    data: tickets,
    isLoading: ticketsLoading,
    isError: ticketsError,
    error: ticketsErrorObj,
  } = useQuery({
    queryKey: ['fe-my-tickets', user?.email],
    queryFn: async () => {
      const res = await fetchJson<{ items: FETicketRow[] }>(`/fe/me/tickets`);
      return (res.items ?? []) as FETicketRow[];
    },
    enabled: Boolean(userProfile?.id && isFieldExecutive && session?.access_token),
  });

  const facetOptions = useMemo(
    () => collectFETicketFacetOptions(tickets ?? []),
    [tickets],
  );

  const displayedTickets = useMemo(
    () =>
      filterAndSortFETickets(tickets ?? [], {
        search: debouncedSearch,
        status: statusFilter,
        workType: workTypeFilter,
        sortKey,
        state: stateFilter,
        location: locationFilter,
        customer: customerFilter,
      }),
    [
      tickets,
      debouncedSearch,
      statusFilter,
      workTypeFilter,
      sortKey,
      stateFilter,
      locationFilter,
      customerFilter,
    ],
  );

  const total = displayedTickets.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageTickets = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return displayedTickets.slice(start, start + PAGE_SIZE);
  }, [displayedTickets, safePage]);

  const hasActiveFilters =
    statusFilter !== 'all' ||
    workTypeFilter !== 'all' ||
    stateFilter !== 'all' ||
    locationFilter !== 'all' ||
    customerFilter !== 'all' ||
    debouncedSearch.trim().length > 0;

  const clearFilters = () => {
    setSearchInput('');
    setStatusFilter('all');
    setWorkTypeFilter('all');
    setStateFilter('all');
    setLocationFilter('all');
    setCustomerFilter('all');
    setSortKey('newest');
    setPage(1);
  };

  const loadRemarksForTickets = async (rows: FETicketRow[]) => {
    const map: Record<string, FERemarkLine[]> = {};
    await Promise.all(
      rows.map(async (t) => {
        try {
          const res = await fetchJson<{ items: TicketComment[] }>(
            `/data/tickets/${encodeURIComponent(t.id)}/comments?limit=200&offset=0`,
          );
          map[t.id] = (res.items ?? []).map((c) => ({
            at: c.created_at,
            source: c.source,
            author: c.author_id,
            body: c.body ?? '',
          }));
        } catch {
          map[t.id] = [];
        }
      }),
    );
    return map;
  };

  const generateFieldVisitSheet = async () => {
    setVisitError(null);
    setVisitSheetTickets(null);
    const check = validateFEDateRange(visitFrom, visitTo);
    if (!check.ok) {
      setVisitError(check.error);
      return;
    }
    const assigned = tickets ?? [];
    const matched = filterFETicketsByDateRange(assigned, visitFrom, visitTo);
    if (matched.length === 0) {
      setVisitSheetTickets([]);
      setVisitRemarks({});
      setVisitError('No assigned tickets found for this date range.');
      return;
    }
    setVisitBusy(true);
    try {
      const remarks = await loadRemarksForTickets(matched);
      setVisitRemarks(remarks);
      setVisitSheetTickets(matched);
    } finally {
      setVisitBusy(false);
    }
  };

  const printVisitSheet = () => {
    if (!visitSheetTickets?.length) return;
    openFieldVisitPrintWindow(visitSheetTickets, visitFrom, visitTo, {
      feName: userProfile?.name || user?.email,
      remarksByTicketId: visitRemarks,
    });
  };

  const downloadVisitCsv = () => {
    if (!visitSheetTickets?.length) return;
    downloadFieldVisitCsv(visitSheetTickets, visitFrom, visitTo, visitRemarks);
    toast({ title: 'CSV downloaded', description: 'Field visit sheet exported.' });
  };

  if (!isFieldExecutive && userProfile) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: 'hsl(285 45% 12%)' }}>
      <header
        className="border-b px-4 md:px-6 py-4 safe-px print:hidden"
        style={{ borderColor: 'hsl(285 35% 20%)', background: 'hsl(285 45% 16%)' }}
      >
        <div className="w-full max-w-7xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <img
                  src="/sahaya-logo.png"
                  alt="Sahaya"
                  className="h-9 w-auto object-contain shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div
                  className="hidden h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, hsl(32 95% 48%), hsl(32 95% 55%))' }}
                >
                  S
                </div>
                <div className="leading-none min-w-0">
                  <h1 className="text-base font-extrabold text-white">Sahaya</h1>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">
                    By Pariskq
                  </p>
                </div>
              </div>
              <p className="mt-1 text-xs text-white/60">Field Executive Portal</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
            <div className="text-left sm:text-right min-w-0">
              <p className="text-sm font-medium text-white truncate max-w-[12rem] sm:max-w-[14rem]">
                {userProfile?.name || user?.email}
              </p>
              <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                <Truck className="mr-1 h-3 w-3" />
                Field Executive
              </Badge>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="h-11 w-11 text-white/70 hover:text-white hover:bg-white/10"
              >
                <Link to="/change-password" title="Change password">
                  <KeyRound className="h-5 w-5" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={signOut}
                className="h-11 w-11 text-white/70 hover:text-white hover:bg-white/10"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 safe-px safe-pb">
        <div className="mb-6 md:mb-8">
          <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Ticket Management</h2>
          <p className="text-sm md:text-base text-white/60">
            Search, filter, and open a ticket for details. Use On-Site and Resolution from the ticket
            page (or your assignment email) to upload proof.
          </p>
        </div>

        <Alert className="mb-6 border-primary/30 bg-primary/10 print:hidden">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <AlertDescription className="text-white/80">
            <strong>Workflow:</strong> Open a ticket, then use the <strong>On-Site</strong> and{' '}
            <strong>Resolution</strong> actions to upload proof. Resolution stays locked until on-site
            proof is completed. If links are missing, contact your supervisor.
          </AlertDescription>
        </Alert>

        {ticketsError ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Could not load assigned tickets.{' '}
              {ticketsErrorObj instanceof Error ? ticketsErrorObj.message : 'Request failed.'} If
              this persists, open Network → find <span className="font-mono">fe/me/tickets</span> and
              check status (401 = missing session token; wrong host = update VITE_CRM_API_URL / CSP).
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
            <FETicketFiltersBar
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              status={statusFilter}
              onStatusChange={setStatusFilter}
              workType={workTypeFilter}
              onWorkTypeChange={setWorkTypeFilter}
              sortKey={sortKey}
              onSortKeyChange={setSortKey}
              state={stateFilter}
              onStateChange={setStateFilter}
              location={locationFilter}
              onLocationChange={setLocationFilter}
              customer={customerFilter}
              onCustomerChange={setCustomerFilter}
              stateOptions={facetOptions.states}
              locationOptions={facetOptions.locations}
              customerOptions={facetOptions.customers}
              showClearFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />

            {!ticketsLoading && tickets && tickets.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <p>
                  Showing {total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, total)} of {total}
                  {hasActiveFilters ? ' (filtered)' : ''}
                  {tickets.length !== total ? ` · ${tickets.length} total assigned` : ''}
                </p>
              </div>
            ) : null}

            <DataTableShell
              aria-label="Assigned tickets"
              dense
              scrollable
              loading={ticketsLoading}
              loadingLabel="Loading tickets…"
              emptyState={
                ticketsLoading
                  ? undefined
                  : !tickets?.length
                    ? (
                        <DataTableEmptyState
                          title="No assigned tickets"
                          description="You don't have any tickets assigned to you yet. Check back later or contact your supervisor."
                        />
                      )
                    : total === 0
                      ? (
                          <DataTableEmptyState
                            filterEmpty
                            filteredTitle="No matching tickets"
                            filteredDescription="Try a different search, state, location, or customer filter."
                          />
                        )
                      : undefined
              }
            >
              {pageTickets.length > 0 ? <FETicketsTable tickets={pageTickets} /> : null}
            </DataTableShell>

            {!ticketsLoading && total > PAGE_SIZE ? (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  Page {safePage} / {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="gap-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {!ticketsError ? (
          <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm md:p-5 print:hidden">
            <div>
              <h3 className="text-base font-semibold">Field Visit Sheet / Print Tickets</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Date range uses assignment date when available (otherwise created date). Only your
                assigned tickets are included.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fe-visit-from">From</Label>
                <Input
                  id="fe-visit-from"
                  type="date"
                  value={visitFrom}
                  onChange={(e) => setVisitFrom(e.target.value)}
                  className="w-[11rem]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fe-visit-to">To</Label>
                <Input
                  id="fe-visit-to"
                  type="date"
                  value={visitTo}
                  onChange={(e) => setVisitTo(e.target.value)}
                  className="w-[11rem]"
                />
              </div>
              <Button
                type="button"
                onClick={() => void generateFieldVisitSheet()}
                disabled={visitBusy || ticketsLoading}
              >
                {visitBusy ? 'Generating…' : 'Generate Field Visit Sheet'}
              </Button>
            </div>
            {visitError ? (
              <p className="text-sm text-destructive" role="status">
                {visitError}
              </p>
            ) : null}
            {visitSheetTickets && visitSheetTickets.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted-foreground mr-2">
                  {visitSheetTickets.length} ticket{visitSheetTickets.length === 1 ? '' : 's'} ready
                </p>
                <Button type="button" variant="outline" className="gap-1" onClick={printVisitSheet}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button type="button" variant="outline" className="gap-1" onClick={downloadVisitCsv}>
                  <Download className="h-4 w-4" />
                  Download CSV
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
