import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  formatIST,
  getStartOfDayIST,
  getEndOfDayIST,
  todayIST,
} from '@/lib/dateUtils';
import { AppLayoutNew } from '@/components/layout/AppLayoutNew';
import { PageContainer } from '@/components/layout/PageContainer';
import {
  PageHeader,
  FilterBar,
  DataTableShell,
  DataTableEmptyState,
  DEFAULT_TABLE_LOADING_LABEL,
  dataTableHeadClassName,
  typography,
} from '@/components/common';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { TicketNumberDisplay } from '@/components/common/TicketNumberDisplay';
import { AuditLog } from '@/lib/types';
import { fetchJson, getAccessToken, crmApiUrl } from '@/lib/backendDataApi';

const PAGE_SIZE = 50;

type AuditDisplay = {
  timestamp: string;
  ticket_number: string | null;
  action: string;
  action_label: string;
  ticket_status: string | null;
  done_by: string;
  actor_role: string | null;
  field_executive_name: string | null;
  organisation_name: string | null;
  summary: string;
};

export type AuditLogGridRow = AuditLog & {
  display: AuditDisplay;
  summary?: string | null;
};

type SortKey = 'created_at' | 'action' | 'entity_type';
type QuickRange = '' | 'today' | '24h' | '7d' | 'month';

function addDaysIST(dateStr: string, days: number): string {
  const d = getStartOfDayIST(dateStr);
  d.setDate(d.getDate() + days);
  return formatIST(d, 'yyyy-MM-dd');
}

function quickRangeToDates(preset: QuickRange): { from: string; to: string } {
  const today = todayIST();
  if (preset === 'today') return { from: today, to: today };
  if (preset === '24h') return { from: addDaysIST(today, -1), to: today };
  if (preset === '7d') return { from: addDaysIST(today, -6), to: today };
  if (preset === 'month') {
    const d = getStartOfDayIST(today);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    return { from: formatIST(first, 'yyyy-MM-dd'), to: today };
  }
  return { from: '', to: '' };
}

function buildAuditParams(input: {
  page: number;
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  entityFilter: string;
  actionFilter: string;
  ticketNumber: string;
  actorUserId: string;
  actorFeId: string;
  organisationId: string;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  forExport?: boolean;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('limit', input.forExport ? '5000' : String(PAGE_SIZE));
  params.set('offset', input.forExport ? '0' : String(Math.max(0, (input.page - 1) * PAGE_SIZE)));
  params.set('sortBy', input.sortBy);
  params.set('sortDir', input.sortDir);

  if (input.dateFrom.trim()) {
    const base = getStartOfDayIST(input.dateFrom.trim());
    if (input.timeFrom.trim()) {
      const [h, m] = input.timeFrom.split(':').map(Number);
      base.setHours(h || 0, m || 0, 0, 0);
    }
    params.set('dateFrom', base.toISOString());
  }
  if (input.dateTo.trim()) {
    const base = getEndOfDayIST(input.dateTo.trim());
    if (input.timeTo.trim()) {
      const [h, m] = input.timeTo.split(':').map(Number);
      base.setHours(h ?? 23, m ?? 59, 59, 999);
    }
    params.set('dateTo', base.toISOString());
  }
  if (input.entityFilter && input.entityFilter !== 'all') params.set('entityType', input.entityFilter);
  if (input.actionFilter && input.actionFilter !== 'all') params.set('action', input.actionFilter);
  if (input.ticketNumber.trim()) params.set('ticketNumber', input.ticketNumber.trim());
  if (input.actorUserId && input.actorUserId !== 'all') params.set('actorUserId', input.actorUserId);
  if (input.actorFeId && input.actorFeId !== 'all') params.set('actorFeId', input.actorFeId);
  if (input.organisationId && input.organisationId !== 'all') {
    params.set('organisationId', input.organisationId);
  }
  return params;
}

function statusBadgeClass(status: string | null): string {
  if (!status) return 'bg-muted text-muted-foreground';
  const s = status.toUpperCase();
  if (s === 'RESOLVED' || s === 'CLOSED') return 'bg-emerald-100 text-emerald-800';
  if (s === 'ASSIGNED' || s === 'ON_SITE') return 'bg-blue-100 text-blue-800';
  if (s === 'REJECTED' || s === 'FE_ATTEMPT_FAILED') return 'bg-rose-100 text-rose-800';
  return 'bg-slate-100 text-slate-700';
}

export default function AuditLogs() {
  const { userProfile } = useAuth();
  const auditOrgId = userProfile?.organisation_id ?? null;
  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';

  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [quickRange, setQuickRange] = useState<QuickRange>('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [ticketNumber, setTicketNumber] = useState('');
  const [ticketNumberApplied, setTicketNumberApplied] = useState('');
  const [actorUserId, setActorUserId] = useState('all');
  const [actorFeId, setActorFeId] = useState('all');
  const [organisationId, setOrganisationId] = useState('all');
  const [sortBy, setSortBy] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [detailRow, setDetailRow] = useState<AuditLogGridRow | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
    entityFilter,
    actionFilter,
    ticketNumberApplied,
    actorUserId,
    actorFeId,
    organisationId,
    sortBy,
    sortDir,
  ]);

  const applyQuickRange = (preset: QuickRange) => {
    setQuickRange(preset);
    if (!preset) return;
    const { from, to } = quickRangeToDates(preset);
    setDateFrom(from);
    setDateTo(to);
    setTimeFrom('');
    setTimeTo('');
  };

  const { data: logs, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      'audit-logs-grid',
      page,
      dateFrom,
      dateTo,
      timeFrom,
      timeTo,
      entityFilter,
      actionFilter,
      ticketNumberApplied,
      actorUserId,
      actorFeId,
      organisationId,
      sortBy,
      sortDir,
      isSuperAdmin,
    ],
    queryFn: async (): Promise<AuditLogGridRow[]> => {
      const params = buildAuditParams({
        page,
        dateFrom,
        dateTo,
        timeFrom,
        timeTo,
        entityFilter,
        actionFilter,
        ticketNumber: ticketNumberApplied,
        actorUserId,
        actorFeId,
        organisationId: isSuperAdmin ? organisationId : 'all',
        sortBy,
        sortDir,
      });
      const res = await fetchJson<{ items: AuditLogGridRow[] }>(
        `/data/audit-logs?${params.toString()}`
      );
      return res.items ?? [];
    },
  });

  const { data: filterMeta } = useQuery({
    queryKey: ['audit-logs-filter-meta', isSuperAdmin],
    queryFn: async () => {
      const [usersRes, feRes, orgRes] = await Promise.all([
        fetchJson<{ items: { id: string; name: string; email: string }[] }>(
          '/data/users?limit=500&offset=0'
        ).catch(() => ({ items: [] })),
        fetchJson<{ items: { id: string; name: string }[] }>(
          '/data/field-executives?limit=500&offset=0'
        ).catch(() => ({ items: [] })),
        isSuperAdmin
          ? fetchJson<{ items: { id: string; name: string }[] }>(
              '/data/organisations?limit=200&offset=0'
            ).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ]);
      return {
        users: usersRes.items ?? [],
        fes: feRes.items ?? [],
        organisations: orgRes.items ?? [],
      };
    },
    staleTime: 60_000,
  });

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    (logs ?? []).forEach((l) => {
      if (l.action) set.add(l.action);
    });
    return [...set].sort();
  }, [logs]);

  const entityOptions = useMemo(() => {
    const set = new Set<string>();
    (logs ?? []).forEach((l) => {
      if (l.entity_type) set.add(l.entity_type);
    });
    return [...set].sort();
  }, [logs]);

  const hasNextPage = (logs?.length ?? 0) >= PAGE_SIZE;
  const hasPrevPage = page > 1;

  const toggleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'created_at' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortBy !== col) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
    );
  };

  const handleExportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const params = buildAuditParams({
        page: 1,
        dateFrom,
        dateTo,
        timeFrom,
        timeTo,
        entityFilter,
        actionFilter,
        ticketNumber: ticketNumberApplied,
        actorUserId,
        actorFeId,
        organisationId: isSuperAdmin ? organisationId : 'all',
        sortBy,
        sortDir,
        forExport: true,
      });
      params.set('format', 'csv');
      const token = await getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(crmApiUrl(`/data/audit-logs?${params.toString()}`), { headers });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${todayIST()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — export is best-effort
    } finally {
      setExporting(false);
    }
  }, [
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
    entityFilter,
    actionFilter,
    ticketNumberApplied,
    actorUserId,
    actorFeId,
    organisationId,
    sortBy,
    sortDir,
    isSuperAdmin,
  ]);

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setTimeFrom('');
    setTimeTo('');
    setQuickRange('');
    setEntityFilter('all');
    setActionFilter('all');
    setTicketNumber('');
    setTicketNumberApplied('');
    setActorUserId('all');
    setActorFeId('all');
    setOrganisationId('all');
    setPage(1);
  };

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="flex min-h-0 flex-col gap-4 pb-8">
          <PageHeader
            title="Operational audit log"
            description="Tenant-scoped activity grid • Ticket status reflects current state"
            icon={FileText}
            actions={
              <>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
                  Refresh
                </Button>
                <Button variant="default" size="sm" onClick={handleExportCsv} disabled={exporting}>
                  <Download className="mr-2 h-4 w-4" />
                  {exporting ? 'Exporting…' : 'Export CSV'}
                </Button>
              </>
            }
          />

          {isError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <p className="font-medium">Could not load audit logs</p>
              <p className="mt-1 text-destructive/90">
                {error instanceof Error ? error.message : 'Request failed'}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          <FilterBar aria-label="Audit log filters" sticky className="space-y-3">
            <div className="flex w-full flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['today', 'Today'],
                    ['24h', 'Last 24h'],
                    ['7d', 'Last 7 days'],
                    ['month', 'This month'],
                  ] as const
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={quickRange === key ? 'default' : 'outline'}
                    className="h-8"
                    onClick={() => applyQuickRange(key)}
                  >
                    {label}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={clearFilters}>
                  Clear all
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                <div className="space-y-1">
                  <Label className="text-xs">From date</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setQuickRange(''); }} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">From time</Label>
                  <Input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To date</Label>
                  <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setQuickRange(''); }} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To time</Label>
                  <Input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1 lg:col-span-2">
                  <Label className="text-xs">Ticket number</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search ticket #…"
                      value={ticketNumber}
                      onChange={(e) => setTicketNumber(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && setTicketNumberApplied(ticketNumber.trim())}
                      className="h-9"
                    />
                    <Button type="button" size="sm" variant="secondary" className="h-9 shrink-0" onClick={() => setTicketNumberApplied(ticketNumber.trim())}>
                      Apply
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                <div className="space-y-1">
                  <Label className="text-xs">Action</Label>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All actions</SelectItem>
                      {actionOptions.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Entity type</Label>
                  <Select value={entityFilter} onValueChange={setEntityFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All entities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All entities</SelectItem>
                      {entityOptions.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Done by (user)</Label>
                  <Select value={actorUserId} onValueChange={setActorUserId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Any user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any user</SelectItem>
                      {(filterMeta?.users ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Field executive</Label>
                  <Select value={actorFeId} onValueChange={setActorFeId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Any FE" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any FE</SelectItem>
                      {(filterMeta?.fes ?? []).map((fe) => (
                        <SelectItem key={fe.id} value={fe.id}>
                          {fe.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isSuperAdmin && (
                  <div className="space-y-1">
                    <Label className="text-xs">Tenant</Label>
                    <Select value={organisationId} onValueChange={setOrganisationId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="All tenants" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All tenants</SelectItem>
                        {(filterMeta?.organisations ?? []).map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </FilterBar>

          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              Page {page} • {logs?.length ?? 0} rows
              {isFetching && !isLoading ? ' (updating…)' : ''}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!hasPrevPage || isLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={!hasNextPage || isLoading} onClick={() => setPage((p) => p + 1)}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>

          <DataTableShell
            aria-label="Audit logs table"
            loading={isLoading}
            loadingLabel={DEFAULT_TABLE_LOADING_LABEL}
            emptyState={
              isError ? (
                <DataTableEmptyState
                  title="Unable to load logs"
                  description="See error above — the API request did not succeed."
                />
              ) : (logs?.length ?? 0) === 0 ? (
                <DataTableEmptyState
                  title="No audit activity"
                  description="No audit activity matches your current filters."
                />
              ) : undefined
            }
          >
            <div className="max-h-[calc(100vh-20rem)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={cn(dataTableHeadClassName, 'whitespace-nowrap')}>
                      <button type="button" className="inline-flex items-center font-semibold" onClick={() => toggleSort('created_at')}>
                        Timestamp
                        <SortIcon col="created_at" />
                      </button>
                    </TableHead>
                    <TableHead className={cn(dataTableHeadClassName, 'whitespace-nowrap')}>Ticket #</TableHead>
                    <TableHead className={dataTableHeadClassName}>
                      <button type="button" className="inline-flex items-center font-semibold" onClick={() => toggleSort('action')}>
                        Action
                        <SortIcon col="action" />
                      </button>
                    </TableHead>
                    <TableHead className={cn(dataTableHeadClassName, 'whitespace-nowrap')}>Ticket status</TableHead>
                    <TableHead className={cn(dataTableHeadClassName, 'whitespace-nowrap')}>Done by</TableHead>
                    <TableHead className={cn(dataTableHeadClassName, 'whitespace-nowrap')}>Role</TableHead>
                    <TableHead className={cn(dataTableHeadClassName, 'whitespace-nowrap')}>Field executive</TableHead>
                    {isSuperAdmin && <TableHead className={cn(dataTableHeadClassName, 'whitespace-nowrap')}>Tenant</TableHead>}
                    <TableHead className={cn(dataTableHeadClassName, 'min-w-[12rem]')}>Summary</TableHead>
                    <TableHead className={cn(dataTableHeadClassName, 'w-20 text-right')}>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && isError ? (
                    <TableRow>
                      <TableCell colSpan={isSuperAdmin ? 10 : 9} className="h-32 text-center text-muted-foreground">
                        See error above — the API request did not succeed.
                      </TableCell>
                    </TableRow>
                  ) : !isLoading && (logs?.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isSuperAdmin ? 10 : 9} className="h-32 text-center text-muted-foreground">
                        No audit activity matches your filters.
                      </TableCell>
                    </TableRow>
                  ) : !isLoading ? (
                    (logs ?? []).map((row) => {
                      const d = row.display;
                      return (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer text-sm"
                          onClick={() => setDetailRow(row)}
                        >
                          <TableCell className="whitespace-nowrap font-mono text-xs">
                            {d?.timestamp ? formatIST(d.timestamp, 'PPp') : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-medium">
                            {d?.ticket_number ? (
                              <Badge variant="secondary" className="text-xs font-normal">
                                <TicketNumberDisplay
                                  ticketNumber={d.ticket_number}
                                  organisationId={auditOrgId}
                                  variant="compact"
                                />
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[10rem] truncate" title={d?.action_label}>
                            {d?.action_label ?? '—'}
                          </TableCell>
                          <TableCell>
                            {d?.ticket_status ? (
                              <Badge variant="outline" className={cn('text-xs', statusBadgeClass(d.ticket_status))}>
                                {d.ticket_status.replace(/_/g, ' ')}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="max-w-[8rem] truncate font-medium">{d?.done_by ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d?.actor_role ?? '—'}</TableCell>
                          <TableCell className="max-w-[8rem] truncate">{d?.field_executive_name ?? '—'}</TableCell>
                          {isSuperAdmin && (
                            <TableCell className="max-w-[8rem] truncate">{d?.organisation_name ?? '—'}</TableCell>
                          )}
                          <TableCell className="max-w-[14rem] truncate text-muted-foreground" title={d?.summary}>
                            {d?.summary ?? '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); setDetailRow(row); }}>
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </DataTableShell>
        </div>

        <Sheet open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Audit event details</SheetTitle>
              <SheetDescription>
                {detailRow?.display?.action_label ?? detailRow?.action}
              </SheetDescription>
            </SheetHeader>
            {detailRow && (
              <div className="mt-6 space-y-4 text-sm">
                <dl className="grid grid-cols-[7rem_1fr] gap-2">
                  <dt className="text-muted-foreground">When</dt>
                  <dd>{detailRow.display?.timestamp ? formatIST(detailRow.display.timestamp, 'PPpp') : '—'}</dd>
                  <dt className="text-muted-foreground">Ticket</dt>
                  <dd>{detailRow.display?.ticket_number ?? '—'}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{detailRow.display?.ticket_status ?? '—'}</dd>
                  <dt className="text-muted-foreground">Done by</dt>
                  <dd>{detailRow.display?.done_by ?? '—'}</dd>
                  <dt className="text-muted-foreground">Role</dt>
                  <dd>{detailRow.display?.actor_role ?? '—'}</dd>
                  <dt className="text-muted-foreground">FE</dt>
                  <dd>{detailRow.display?.field_executive_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Tenant</dt>
                  <dd>{detailRow.display?.organisation_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Entity</dt>
                  <dd>{detailRow.entity_type}</dd>
                </dl>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metadata</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">
                    {JSON.stringify(detailRow.metadata ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </PageContainer>
    </AppLayoutNew>
  );
}
