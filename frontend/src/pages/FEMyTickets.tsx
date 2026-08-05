import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { TicketStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DataTableShell,
  DataTableEmptyState,
} from '@/components/common';
import { FETicketFiltersBar } from '@/components/fe/FETicketFiltersBar';
import { FETicketsTable } from '@/components/fe/FETicketsTable';
import {
  filterAndSortFETickets,
  type FETicketRow,
  type FETicketSortKey,
  type FEWorkTypeFilter,
} from '@/lib/feTicketList';
import {
  Truck,
  AlertTriangle,
  LogOut,
  KeyRound,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { fetchJson } from '@/lib/backendDataApi';

const PAGE_SIZE = 25;

export default function FEMyTickets() {
  const { user, userProfile, signOut, isFieldExecutive, isClient, session } = useAuth();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [workTypeFilter, setWorkTypeFilter] = useState<FEWorkTypeFilter>('all');
  const [sortKey, setSortKey] = useState<FETicketSortKey>('newest');
  const [page, setPage] = useState(1);

  // Redirect non-FE users once profile is available.
  useEffect(() => {
    if (!userProfile || isFieldExecutive) return;
    navigate(isClient ? '/app/client' : '/app', { replace: true });
  }, [userProfile, isFieldExecutive, isClient, navigate]);

  // Reset to first page when filters change.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, workTypeFilter, sortKey]);

  // Fetch FE's assigned tickets using email match to field_executives
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
    // Wait for profile, role, and access token so we do not call CRM with no Authorization (401 → UI looked like "no tickets").
    enabled: Boolean(userProfile?.id && isFieldExecutive && session?.access_token),
  });

  const displayedTickets = useMemo(
    () =>
      filterAndSortFETickets(tickets ?? [], {
        search: debouncedSearch,
        status: statusFilter,
        workType: workTypeFilter,
        sortKey,
      }),
    [tickets, debouncedSearch, statusFilter, workTypeFilter, sortKey],
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
    debouncedSearch.trim().length > 0;

  const clearFilters = () => {
    setSearchInput('');
    setStatusFilter('all');
    setWorkTypeFilter('all');
    setSortKey('newest');
    setPage(1);
  };

  if (!isFieldExecutive && userProfile) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: 'hsl(285 45% 12%)' }}>
      <header
        className="border-b px-4 md:px-6 py-4 safe-px"
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

        <Alert className="mb-6 border-primary/30 bg-primary/10">
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
            />

            {!ticketsLoading && tickets && tickets.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <p>
                  Showing {total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, total)} of {total}
                  {hasActiveFilters ? ' (filtered)' : ''}
                  {tickets.length !== total ? ` · ${tickets.length} total assigned` : ''}
                </p>
                {hasActiveFilters ? (
                  <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
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
                            filteredDescription="Try a different search, status, or work type filter."
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
      </main>
    </div>
  );
}
