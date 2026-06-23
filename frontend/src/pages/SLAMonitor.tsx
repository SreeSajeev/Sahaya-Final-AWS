import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TicketNumberDisplay } from '@/components/common/TicketNumberDisplay';
import {
  PageHeader,
  MetricCard,
  StatGrid,
  FilterBar,
  DataTableShell,
  typography,
  dataTableHeadClassName,
  FILTER_SELECT_WIDTH,
  FILTER_SELECT_WIDTH_WIDE,
} from '@/components/common';
import { CountdownTimer } from '@/components/sla/CountdownTimer';
import { differenceInMinutes, differenceInHours, isPast, subDays } from 'date-fns';
import { formatIST, getStartOfDayIST, getEndOfDayIST, todayIST } from '@/lib/dateUtils';
import { AppLayoutNew } from '@/components/layout/AppLayoutNew';
import { PageContainer } from '@/components/layout/PageContainer';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
} from '@/components/ui/tooltip';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Timer,
  Pause,
  ExternalLink,
  Info,
  Download,
  Users,
  Tag,
  Star,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SLATracking, Ticket } from '@/lib/types';
import { resolveTicketPriorityLevel, priorityDisplayLabel } from '@/lib/priority';
import { fetchJson } from "@/lib/backendDataApi";
import { rowsToCsv } from "@/lib/csvExport";
import {
  TICKET_EXPORT_APPENDED_HEADERS,
  buildTicketExportEnrichmentMaps,
  getAppendedTicketExportValues,
  buildSlaMapsFromClientRows,
} from "@/lib/ticketExportEnrichment";

interface SLAWithTicket extends SLATracking {
  ticket: Ticket;
  feName?: string;
  feId?: string;
}

type SLAStatus = 'on-track' | 'at-risk' | 'breached' | 'paused';

const PAGE_SIZE = 50;
const BREACH_TREND_DAYS = 7;

function parseSlaDeadline(deadline: string | null | undefined): Date | null {
  if (deadline == null || String(deadline).trim() === '') return null;
  const parsed = new Date(deadline);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSLAStatus(deadline: string | null, breached: boolean, ticketStatus: string): { status: SLAStatus; timeRemaining: string } {
  if (ticketStatus === 'NEEDS_REVIEW' || ticketStatus === 'RESOLVED_PENDING_VERIFICATION') {
    return { status: 'paused', timeRemaining: 'Paused' };
  }
  if (breached) return { status: 'breached', timeRemaining: 'Breached' };
  const deadlineDate = parseSlaDeadline(deadline);
  if (!deadlineDate) return { status: 'on-track', timeRemaining: 'N/A' };
  const now = new Date();
  if (isPast(deadlineDate)) return { status: 'breached', timeRemaining: 'Breached' };
  const minutesRemaining = differenceInMinutes(deadlineDate, now);
  const hoursRemaining = differenceInHours(deadlineDate, now);
  if (minutesRemaining < 120) {
    if (minutesRemaining < 60) return { status: 'at-risk', timeRemaining: `${minutesRemaining}m left` };
    return { status: 'at-risk', timeRemaining: `${hoursRemaining}h ${minutesRemaining % 60}m left` };
  }
  if (hoursRemaining < 24) return { status: 'on-track', timeRemaining: `${hoursRemaining}h ${minutesRemaining % 60}m left` };
  const daysRemaining = Math.floor(hoursRemaining / 24);
  return { status: 'on-track', timeRemaining: `${daysRemaining}d ${hoursRemaining % 24}h left` };
}

function isRowBreached(sla: SLAWithTicket): boolean {
  return !!(sla.assignment_breached || sla.onsite_breached || sla.resolution_breached);
}

function matchesBreachType(sla: SLAWithTicket, breachType: string): boolean {
  if (breachType === 'all') return true;
  if (breachType === 'assignment') return !!sla.assignment_breached;
  if (breachType === 'onsite') return !!sla.onsite_breached;
  if (breachType === 'resolution') return !!sla.resolution_breached;
  return true;
}

function getWorstStatus(sla: SLAWithTicket): SLAStatus {
  const ticketStatus = sla.ticket?.status ?? 'OPEN';
  const a = getSLAStatus(sla.assignment_deadline, !!sla.assignment_breached, ticketStatus).status;
  const b = getSLAStatus(sla.onsite_deadline, !!sla.onsite_breached, ticketStatus).status;
  const c = getSLAStatus(sla.resolution_deadline, !!sla.resolution_breached, ticketStatus).status;
  if (a === 'breached' || b === 'breached' || c === 'breached') return 'breached';
  if (a === 'at-risk' || b === 'at-risk' || c === 'at-risk') return 'at-risk';
  if (a === 'paused' || b === 'paused' || c === 'paused') return 'paused';
  return 'on-track';
}

interface FilterState {
  status: string;
  breachType: string;
  feId: string;
  startDate: string;
  endDate: string;
}

interface DerivedStats {
  filteredRows: SLAWithTicket[];
  total: number;
  onTrack: number;
  atRisk: number;
  breached: number;
  paused: number;
  overdueCount: number;
  breachTrendLast7: { date: string; dayLabel: string; count: number }[];
  byFE: { feName: string; count: number }[];
  byCategory: { name: string; count: number }[];
  byPriority: { name: string; count: number }[];
}

function inDateRange(rowDate: string | null | undefined, startDate: string, endDate: string): boolean {
  if (!rowDate) return true;
  const row = new Date(rowDate);
  if (isNaN(row.getTime())) return true;
  if (startDate && startDate.trim()) {
    const start = getStartOfDayIST(startDate.trim());
    if (row < start) return false;
  }
  if (endDate && endDate.trim()) {
    const end = getEndOfDayIST(endDate.trim());
    if (row > end) return false;
  }
  return true;
}

export default function SLAMonitor() {
  const { userProfile } = useAuth();
  const defaultOrgId = userProfile?.organisation_id ?? null;
  const [filter, setFilter] = useState<'all' | 'at-risk' | 'breached'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [breachTypeFilter, setBreachTypeFilter] = useState<string>('all');
  const [feFilter, setFeFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const { data: slaData, isLoading, refetch } = useQuery({
    queryKey: ['sla-tracking-with-tickets', statusFilter, breachTypeFilter, feFilter, startDate, endDate],
    queryFn: async (): Promise<SLAWithTicket[]> => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (breachTypeFilter && breachTypeFilter !== "all") params.set("breachType", breachTypeFilter);
      if (feFilter && feFilter !== "all") params.set("feId", feFilter);
      if (startDate && startDate.trim()) params.set("startDate", startDate.trim());
      if (endDate && endDate.trim()) params.set("endDate", endDate.trim());
      const res = await fetchJson<{ items: SLAWithTicket[] }>(`/data/sla/monitor?${params.toString()}`);
      return (res.items ?? []).filter((row) => row?.ticket != null) as SLAWithTicket[];
    },
    refetchInterval: 60000,
  });

  const filterState: FilterState = useMemo(
    () => ({ status: statusFilter, breachType: breachTypeFilter, feId: feFilter, startDate, endDate }),
    [statusFilter, breachTypeFilter, feFilter, startDate, endDate]
  );

  const derived = useMemo((): DerivedStats => {
    const raw = slaData ?? [];
    const stats = {
      onTrack: 0,
      atRisk: 0,
      breached: 0,
      paused: 0,
      overdueCount: 0,
      breachByDay: new Map<string, number>(),
      byFEMap: new Map<string, number>(),
      byCategoryMap: new Map<string, number>(),
      byPriorityMap: new Map<string, number>(),
    };
    const filtered: SLAWithTicket[] = [];

    for (let i = 0; i < raw.length; i++) {
      const sla = raw[i];
      const ticket = sla.ticket;
      if (!ticket) continue;

      if (filterState.status !== 'all' && ticket.status !== filterState.status) continue;
      if (!matchesBreachType(sla, filterState.breachType)) continue;
      if (filterState.feId && filterState.feId !== 'all' && sla.feId !== filterState.feId) continue;
      const rowCreatedAt = (sla as SLATracking).created_at;
      if (!inDateRange(rowCreatedAt, filterState.startDate, filterState.endDate)) continue;

      const worst = getWorstStatus(sla);
      const passesDisplayFilter = filter === 'all' || (filter === 'breached' && worst === 'breached') || (filter === 'at-risk' && (worst === 'at-risk' || worst === 'breached'));

      if (isRowBreached(sla)) {
        stats.overdueCount++;
        if (rowCreatedAt) {
          const dayStr = formatIST(new Date(rowCreatedAt), 'yyyy-MM-dd');
          stats.breachByDay.set(dayStr, (stats.breachByDay.get(dayStr) ?? 0) + 1);
        }
        if (sla.feName !== undefined) {
          const name = sla.feName || '—';
          stats.byFEMap.set(name, (stats.byFEMap.get(name) ?? 0) + 1);
        }
        if (ticket && 'category' in ticket) {
          const cat = ticket.category ?? 'Uncategorized';
          stats.byCategoryMap.set(cat, (stats.byCategoryMap.get(cat) ?? 0) + 1);
        }
        if (ticket && ('priority' in ticket || 'priority_level' in ticket)) {
          const pri = priorityDisplayLabel(resolveTicketPriorityLevel(ticket as Ticket));
          stats.byPriorityMap.set(pri, (stats.byPriorityMap.get(pri) ?? 0) + 1);
        }
      }

      if (passesDisplayFilter) {
        filtered.push(sla);
        stats.onTrack += worst === 'on-track' ? 1 : 0;
        stats.atRisk += worst === 'at-risk' ? 1 : 0;
        stats.breached += worst === 'breached' ? 1 : 0;
        stats.paused += worst === 'paused' ? 1 : 0;
      }
    }

    const total = filtered.length;
    const now = new Date();
    const trend: { date: string; dayLabel: string; count: number }[] = [];
    for (let d = BREACH_TREND_DAYS - 1; d >= 0; d--) {
      const day = subDays(now, d);
      const dayStr = formatIST(day, 'yyyy-MM-dd');
      trend.push({ date: dayStr, dayLabel: formatIST(day, 'EEE MM/dd'), count: stats.breachByDay.get(dayStr) ?? 0 });
    }

    return {
      filteredRows: filtered,
      total,
      onTrack: stats.onTrack,
      atRisk: stats.atRisk,
      breached: stats.breached,
      paused: stats.paused,
      overdueCount: stats.overdueCount,
      breachTrendLast7: trend,
      byFE: [...stats.byFEMap.entries()].map(([feName, count]) => ({ feName, count })).sort((a, b) => b.count - a.count),
      byCategory: [...stats.byCategoryMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      byPriority: [...stats.byPriorityMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  }, [slaData, filterState, filter]);

  const { filteredRows, total, onTrack, atRisk, breached, paused, overdueCount, breachTrendLast7, byFE, byCategory, byPriority } = derived;

  const paginatedRows = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(from, from + PAGE_SIZE);
  }, [filteredRows, page]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const uniqueFEOptions = useMemo(() => {
    const m = new Map<string, string>();
    slaData?.forEach((row) => {
      if (row.feId && row.feName != null) m.set(row.feId, row.feName);
    });
    return [...m.entries()].map(([feId, feName]) => ({ feId, feName })).sort((a, b) => (a.feName ?? '').localeCompare(b.feName ?? ''));
  }, [slaData]);

  const handleExport = useCallback(() => {
    const baseHeaders = ['ticket_number', 'status', 'category', 'assignment_breached', 'onsite_breached', 'resolution_breached', 'fe_name', 'created_at'];
    const headers = [...baseHeaders, ...TICKET_EXPORT_APPENDED_HEADERS];

    const emptyMaps = buildTicketExportEnrichmentMaps([], [], []);
    const slaByTicketId = buildSlaMapsFromClientRows(
      filteredRows.map((sla) => ({
        ticket_id: sla.ticket_id,
        assignment_breached: sla.assignment_breached,
        onsite_breached: sla.onsite_breached,
        resolution_breached: sla.resolution_breached,
        assignment_deadline: sla.assignment_deadline,
        onsite_deadline: sla.onsite_deadline,
        resolution_deadline: sla.resolution_deadline,
      }))
    );
    emptyMaps.slaByTicketId = slaByTicketId;

    const rows = filteredRows.map((sla) => {
      const t = sla.ticket;
      if (!t) return null;
      const ticketRow = { ...t, id: t.id } as Record<string, unknown>;
      const base = [
        t.ticket_number ?? '',
        t.status ?? '',
        t.category ?? '',
        String(!!sla.assignment_breached),
        String(!!sla.onsite_breached),
        String(!!sla.resolution_breached),
        sla.feName ?? '',
        (sla as SLATracking).created_at ?? '',
      ];
      return [
        ...base,
        ...getAppendedTicketExportValues(ticketRow, emptyMaps, { feNameOverride: sla.feName ?? '' }),
      ];
    }).filter((row): row is string[] => row != null);
    const csv = rowsToCsv([headers, ...rows]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sla-monitor-export-${todayIST()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRows]);

  useEffect(() => setPage(1), [statusFilter, breachTypeFilter, feFilter, startDate, endDate, filter]);

  return (
    <AppLayoutNew>
      <PageContainer>
      <div className="min-w-0 space-y-6">
        <PageHeader
          title="SLA Monitor"
          description="Real-time SLA tracking with countdown timers"
          icon={Clock}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredRows.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </>
          }
        />

        <StatGrid className="xl:grid-cols-4 2xl:grid-cols-6">
          <MetricCard label="Overdue SLA" value={overdueCount} icon={XCircle} variant="danger" layout="horizontal" />
          <MetricCard
            label="Breaches (last 7 days)"
            value={breachTrendLast7.reduce((s, d) => s + d.count, 0)}
            icon={TrendingUp}
            variant="warning"
            layout="horizontal"
          />
          {byFE.length > 0 && (
            <MetricCard
              label="Top FE by breaches"
              value={byFE[0].feName}
              description={`${byFE[0].count} breaches`}
              icon={Users}
              layout="horizontal"
            />
          )}
          {byCategory.length > 0 && (
            <MetricCard
              label="Top category"
              value={byCategory[0].name}
              description={`${byCategory[0].count} breaches`}
              icon={Tag}
              layout="horizontal"
            />
          )}
          {byPriority.length > 0 && (
            <MetricCard
              label="Top priority"
              value={byPriority[0].name}
              description={`${byPriority[0].count} breaches`}
              icon={Star}
              layout="horizontal"
            />
          )}
          <MetricCard label="Filtered total" value={filteredRows.length} icon={Timer} layout="horizontal" />
        </StatGrid>

        <StatGrid columns={4}>
          <MetricCard label="Total Active" value={total} icon={Timer} />
          <MetricCard label="On Track" value={onTrack} icon={CheckCircle} variant="success" />
          <MetricCard label="Paused" value={paused} icon={Pause} />
          <MetricCard label="At Risk" value={atRisk} icon={AlertTriangle} variant="warning" />
          <MetricCard label="Breached" value={breached} icon={XCircle} variant="danger" />
        </StatGrid>

        {breachTrendLast7.some((d) => d.count > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className={cn(typography.sectionTitle, 'text-base')}>Breach trend (last 7 days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={breachTrendLast7}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="dayLabel" fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <FilterBar
          aria-label="SLA filters"
          secondary={
            <>
              <div className="flex items-center gap-2">
                <Label htmlFor="sla-start" className={cn(typography.meta, 'whitespace-nowrap')}>
                  From
                </Label>
                <Input
                  id="sla-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-36"
                  aria-label="Filter from date"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="sla-end" className={cn(typography.meta, 'whitespace-nowrap')}>
                  To
                </Label>
                <Input
                  id="sla-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-36"
                  aria-label="Filter to date"
                />
              </div>
            </>
          }
        >
          <Select value={filter} onValueChange={(v) => setFilter(v as 'all' | 'at-risk' | 'breached')}>
            <SelectTrigger className={FILTER_SELECT_WIDTH_WIDE} aria-label="Filter by SLA status">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SLAs</SelectItem>
              <SelectItem value="at-risk">At Risk & Breached</SelectItem>
              <SelectItem value="breached">Breached Only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" aria-label="Filter by ticket status">
              <SelectValue placeholder="Ticket status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="OPEN">OPEN</SelectItem>
              <SelectItem value="RESOLVED">RESOLVED</SelectItem>
              <SelectItem value="ASSIGNED">ASSIGNED</SelectItem>
              <SelectItem value="ON_SITE">ON_SITE</SelectItem>
              <SelectItem value="RESOLVED_PENDING_VERIFICATION">PENDING_VERIFICATION</SelectItem>
              <SelectItem value="NEEDS_REVIEW">NEEDS_REVIEW</SelectItem>
            </SelectContent>
          </Select>
          <Select value={breachTypeFilter} onValueChange={setBreachTypeFilter}>
            <SelectTrigger className={FILTER_SELECT_WIDTH} aria-label="Filter by breach type">
              <SelectValue placeholder="Breach type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All breach types</SelectItem>
              <SelectItem value="assignment">Assignment</SelectItem>
              <SelectItem value="onsite">Onsite</SelectItem>
              <SelectItem value="resolution">Resolution</SelectItem>
            </SelectContent>
          </Select>
          {uniqueFEOptions.length > 0 && (
            <Select value={feFilter || 'all'} onValueChange={setFeFilter}>
              <SelectTrigger className={FILTER_SELECT_WIDTH} aria-label="Filter by field executive">
                <SelectValue placeholder="FE" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All FEs</SelectItem>
                {uniqueFEOptions.map((opt) => (
                  <SelectItem key={opt.feId} value={opt.feId}>
                    {opt.feName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className={cn(typography.body, 'text-muted-foreground')}>
            Showing {paginatedRows.length} of {filteredRows.length} (page {page}/{totalPages})
          </span>
        </FilterBar>

        <DataTableShell
          aria-label="SLA tracking table"
          loading={isLoading}
          loadingLabel="Loading SLA data..."
          emptyState={
            !isLoading && filteredRows.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center p-8 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Clock className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className={typography.sectionTitle}>No SLA records found</h3>
                <p className={cn(typography.body, 'mt-1 text-muted-foreground')}>
                  SLA tracking will appear here when tickets are created.
                </p>
              </div>
            ) : undefined
          }
        >
          {filteredRows.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className={dataTableHeadClassName}>Ticket</TableHead>
                      <TableHead className={dataTableHeadClassName}>Status</TableHead>
                      <TableHead className={dataTableHeadClassName}>Assignment SLA</TableHead>
                      <TableHead className={dataTableHeadClassName}>On-Site SLA</TableHead>
                      <TableHead className={dataTableHeadClassName}>Resolution SLA</TableHead>
                      <TableHead className={cn(dataTableHeadClassName, 'w-[50px]')} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((sla, idx) => {
                      const ticket = sla.ticket;
                      if (!ticket) return null;
                      const ticketStatus = ticket.status ?? 'OPEN';
                      return (
                      <TableRow key={sla.id ?? sla.ticket_id ?? `sla-row-${idx}`} className={cn('data-table-row', idx % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                        <TableCell className="min-w-0">
                          <div className="min-w-0">
                            <Link to={`/app/tickets/${sla.ticket_id}`} className="text-primary hover:underline">
                              <TicketNumberDisplay
                                ticketNumber={ticket.ticket_number}
                                organisationId={ticket.organisation_id ?? defaultOrgId}
                                variant="default"
                              />
                            </Link>
                            <p className={cn(typography.meta, 'mt-0.5 line-clamp-2 break-words')}>
                              {ticket.issue_type || ticket.category || 'Unclassified'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={typography.meta}>
                            {ticketStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-[11rem]">
                          <CountdownTimer deadline={sla.assignment_deadline ?? null} breached={!!sla.assignment_breached} ticketStatus={ticketStatus} />
                        </TableCell>
                        <TableCell className="min-w-[11rem]">
                          <CountdownTimer deadline={sla.onsite_deadline ?? null} breached={!!sla.onsite_breached} ticketStatus={ticketStatus} />
                        </TableCell>
                        <TableCell className="min-w-[11rem]">
                          <CountdownTimer deadline={sla.resolution_deadline ?? null} breached={!!sla.resolution_breached} ticketStatus={ticketStatus} />
                        </TableCell>
                        <TableCell>
                          <Link to={`/app/tickets/${sla.ticket_id}`} className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border p-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <span className={cn(typography.body, 'text-muted-foreground')}>
                    Page {page} of {totalPages}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </DataTableShell>
      </div>
    </PageContainer>
    </AppLayoutNew>
  );
}
