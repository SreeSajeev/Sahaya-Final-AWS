import { useState, useCallback, useMemo } from 'react';
import { resolveTicketPriorityLevel } from '@/lib/priority';
import { subDays } from 'date-fns';
import { AppLayoutNew } from '@/components/layout/AppLayoutNew';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader, MetricCard, StatGrid, typography } from '@/components/common';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart3,
  RefreshCw,
  TrendingUp,
  Ticket,
  Clock,
  Users,
  CheckCircle,
  AlertTriangle,
  MapPin,
  PieChart,
  Activity,
  Download,
  Target,
  XCircle,
  Star,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { formatIST, getStartOfDayIST, getEndOfDayIST, todayIST } from '@/lib/dateUtils';
import { fetchJson } from "@/lib/backendDataApi";
import { rowsToCsv } from "@/lib/csvExport";
import {
  TICKET_EXPORT_APPENDED_HEADERS,
  buildTicketExportEnrichmentMaps,
  getAppendedTicketExportValues,
} from "@/lib/ticketExportEnrichment";
import { formatResolutionCategoryDisplay } from "@/lib/resolutionDisplay";
import {
  computeFeScorecards,
  computeServiceManagerScorecards,
  computeOperationalHealth,
  computeTeamOperationsSummary,
  computeExecutiveSummary,
  computeFeLeaderboards,
  computeManagementHighlights,
  feScorecardsToCsvRows,
  smScorecardsToCsvRows,
  type AnalyticsStaffUser,
} from "@/lib/analyticsMetrics";
import {
  downloadOperationsReport,
  downloadFePerformanceReport,
  downloadSlaReport,
  downloadResolutionReport,
  downloadVerificationReport,
} from "@/lib/operationsReportExport";
import {
  downloadCompleteOperationsReportExcel,
  downloadOperationsWorkbookExcel,
  downloadExecutivePerformanceExcel,
  downloadSlaReportExcel,
  downloadResolutionReportExcel,
  downloadVerificationReportExcel,
} from "@/lib/operationsExcelExport";
import { AnalyticsOpsSections } from "@/components/analytics/AnalyticsOpsSections";
import { AnalyticsManagementPolish } from "@/components/analytics/AnalyticsManagementPolish";
import { cn } from '@/lib/utils';
import { INDIAN_STATES } from '@/lib/indianStates';
import { useTenantClients } from '@/hooks/useTenantClients';
import { isTenantClientsEnabled } from '@/lib/tenantClientsFeature';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const COLORS = ['#6B21A8', '#F97316', '#0EA5E9', '#22C55E', '#EAB308', '#EF4444'];

const MS_PER_HOUR = 1000 * 60 * 60;
const HOURS_PER_DAY = 24;

function getResolutionHours(ticket: { opened_at?: string | null; updated_at?: string | null; resolved_at?: string | null; status?: string }): number | null {
  if (ticket.status !== 'RESOLVED') return null;
  const opened = ticket.opened_at ? new Date(ticket.opened_at).getTime() : null;
  const resolved = (ticket.resolved_at ? new Date(ticket.resolved_at) : ticket.updated_at ? new Date(ticket.updated_at) : null)?.getTime();
  if (opened == null || resolved == null || resolved < opened) return null;
  return (resolved - opened) / MS_PER_HOUR;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface AnalyticsProps {
  /** When true, render only the analytics content (no staff layout); for embedding in Client Dashboard Reports. */
  clientReportsMode?: boolean;
}

export default function Analytics({ clientReportsMode = false }: AnalyticsProps) {
  const { userProfile } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedClientSlug, setSelectedClientSlug] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('');

  const effectiveState = selectedState.trim() || null;

  const isClientRole = userProfile?.role === 'CLIENT';
  const showClientSelector =
    userProfile?.role === 'STAFF' ||
    userProfile?.role === 'ADMIN' ||
    userProfile?.role === 'SUPER_ADMIN';

  const effectiveClientSlug = useMemo(() => {
    if (isClientRole && userProfile?.client_slug) return userProfile.client_slug;
    return selectedClientSlug || null;
  }, [isClientRole, userProfile?.client_slug, selectedClientSlug]);

  const organisationIdForList = userProfile?.organisation_id ?? null;
  const isSuperAdminForList = userProfile?.role === 'SUPER_ADMIN';

  const { data: clientListData } = useQuery({
    queryKey: ['analytics-client-list', organisationIdForList, isSuperAdminForList],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (isSuperAdminForList && organisationIdForList) {
        params.set('organisationId', organisationIdForList);
      }
      const res = await fetchJson<{ clientSlugs: string[] }>(
        `/data/analytics/client-slugs${params.toString() ? `?${params}` : ''}`
      );
      return res.clientSlugs ?? [];
    },
    enabled: showClientSelector,
  });

  const clientOptions = clientListData ?? [];

  const organisationId = userProfile?.organisation_id ?? null;
  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';

  const { data: tenantClients = [] } = useTenantClients({
    organisationId: isSuperAdmin ? null : organisationId,
    enabled: Boolean(userProfile && isTenantClientsEnabled()),
  });

  const companyShortNameBySlug = useMemo(() => {
    const map: Record<string, string> = {};
    for (const client of tenantClients) {
      const short = String(client.company_short_name ?? "").trim();
      if (!short) continue;
      const raw = String(client.slug ?? "").trim();
      if (!raw) continue;
      map[raw] = short;
      map[raw.toLowerCase().replace(/\s+/g, "-")] = short;
    }
    return map;
  }, [tenantClients]);

  const { data: analyticsData, isLoading, refetch } = useQuery({
    queryKey: ['analytics-data', startDate || null, endDate || null, effectiveClientSlug, effectiveState, organisationId, isSuperAdmin],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveClientSlug) params.set("clientSlug", effectiveClientSlug);
      if (effectiveState) params.set("state", effectiveState);
      if (startDate && startDate.trim()) {
        params.set("startDate", getStartOfDayIST(startDate.trim()).toISOString());
      }
      if (endDate && endDate.trim()) {
        params.set("endDate", getEndOfDayIST(endDate.trim()).toISOString());
      }
      const raw = await fetchJson<{
        tickets: Record<string, unknown>[];
        sla: Record<string, unknown>[];
        field_executives: Record<string, unknown>[];
        ticket_assignments: Record<string, unknown>[];
        staff_users?: AnalyticsStaffUser[];
      }>(`/data/analytics/summary?${params.toString()}`);

      const ticketList = raw.tickets || [];
      const slaList = raw.sla || [];
      const feList = raw.field_executives || [];
      const assignmentList = raw.ticket_assignments || [];
      const staffUsers = raw.staff_users || [];

      const statusByTicketId = new Map<string, string>(
        ticketList.map((t: Record<string, unknown>) => [String(t.id), String(t.status ?? '')])
      );
      const slaListMetrics = slaList.filter(
        (s: Record<string, unknown>) => statusByTicketId.get(String(s.ticket_id)) !== 'REJECTED'
      );

      const statusCounts: Record<string, number> = {};
      const categoryCounts: Record<string, number> = {};
      const resolutionCategoryCounts: Record<string, number> = {};
      const locationCounts: Record<string, number> = {};
      const stateCounts: Record<string, number> = {};
      const confidenceDistribution = { high: 0, medium: 0, low: 0 };
      let totalConfidence = 0;
      let confidenceCount = 0;

      ticketList.forEach((ticket: Record<string, unknown>) => {
        const status = ticket.status as string;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        const category = (ticket.category as string) || 'Uncategorized';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        const resolutionCategory = (ticket.resolution_category as string) || '';
        if (resolutionCategory.trim()) {
          const displayCat = formatResolutionCategoryDisplay(
            resolutionCategory,
            ticket.verification_remarks as string | null | undefined
          );
          resolutionCategoryCounts[displayCat] =
            (resolutionCategoryCounts[displayCat] || 0) + 1;
        }
        const location = (ticket.location as string) || 'Unknown';
        locationCounts[location] = (locationCounts[location] || 0) + 1;
        const stateLabel = (ticket.state as string)?.trim() || 'Not specified';
        stateCounts[stateLabel] = (stateCounts[stateLabel] || 0) + 1;
        const score = ticket.confidence_score as number | null;
        if (score != null) {
          totalConfidence += score;
          confidenceCount++;
          if (score >= 95) confidenceDistribution.high++;
          else if (score >= 80) confidenceDistribution.medium++;
          else confidenceDistribution.low++;
        }
      });

      const totalSLA = slaListMetrics.length;
      const assignmentBreached = slaListMetrics.filter((s: Record<string, unknown>) => s.assignment_breached === true).length;
      const onsiteBreached = slaListMetrics.filter((s: Record<string, unknown>) => s.onsite_breached === true).length;
      const resolutionBreached = slaListMetrics.filter((s: Record<string, unknown>) => s.resolution_breached === true).length;
      const assignmentCompliance = totalSLA > 0 ? Math.round(((totalSLA - assignmentBreached) / totalSLA) * 100) : 100;
      const onsiteCompliance = totalSLA > 0 ? Math.round(((totalSLA - onsiteBreached) / totalSLA) * 100) : 100;
      const resolutionCompliance = totalSLA > 0 ? Math.round(((totalSLA - resolutionBreached) / totalSLA) * 100) : 100;
      const breachedSLA = slaListMetrics.filter(
        (s: Record<string, unknown>) => s.assignment_breached || s.onsite_breached || s.resolution_breached
      ).length;
      const breachedTicketIds = new Set(
        slaListMetrics
          .filter((s: Record<string, unknown>) => s.assignment_breached || s.onsite_breached || s.resolution_breached)
          .map((s: Record<string, unknown>) => s.ticket_id as string)
      );
      const totalBreachedTickets = breachedTicketIds.size;

      const assignmentById = new Map(assignmentList.map((a: Record<string, unknown>) => [a.id as string, a]));
      const ticketIdToFeId = new Map<string, string>();
      ticketList.forEach((t: Record<string, unknown>) => {
        const aid = t.current_assignment_id as string | null;
        if (aid) {
          const a = assignmentById.get(aid);
          if (a?.fe_id) ticketIdToFeId.set(t.id as string, a.fe_id as string);
        }
        if (!ticketIdToFeId.has(t.id as string)) {
          const ticketAssignments = assignmentList.filter((a: Record<string, unknown>) => a.ticket_id === t.id);
          const latest = ticketAssignments.sort(
            (a, b) => new Date((b.assigned_at as string) || 0).getTime() - new Date((a.assigned_at as string) || 0).getTime()
          )[0];
          if (latest?.fe_id) ticketIdToFeId.set(t.id as string, latest.fe_id as string);
        }
      });
      const breachCountByFeId: Record<string, number> = {};
      slaListMetrics.forEach((s: Record<string, unknown>) => {
        if (!s.assignment_breached && !s.onsite_breached && !s.resolution_breached) return;
        const feId = ticketIdToFeId.get(s.ticket_id as string);
        if (feId) breachCountByFeId[feId] = (breachCountByFeId[feId] || 0) + 1;
      });
      const feWithMostBreaches = feList.length > 0 && Object.keys(breachCountByFeId).length > 0
        ? feList.reduce((best: Record<string, unknown>, fe: Record<string, unknown>) => {
            const count = breachCountByFeId[String(fe.id)] || 0;
            return count > (breachCountByFeId[String(best.id)] || 0) ? fe : best;
          }, feList[0] as Record<string, unknown>)
        : null;
      const feMostBreachesName = feWithMostBreaches ? (feWithMostBreaches as Record<string, unknown>).name as string : '—';
      const feMostBreachesCount = feWithMostBreaches ? breachCountByFeId[(feWithMostBreaches as Record<string, unknown>).id as string] || 0 : 0;

      const resolutionHoursList = ticketList
        .map((t: Record<string, unknown>) => getResolutionHours(t as Parameters<typeof getResolutionHours>[0]))
        .filter((h): h is number => h != null);
      const avgResolutionHours = resolutionHoursList.length > 0
        ? resolutionHoursList.reduce((s, h) => s + h, 0) / resolutionHoursList.length
        : 0;
      const medianResolutionHours = median(resolutionHoursList);
      const fastestResolutionHours = resolutionHoursList.length > 0 ? Math.min(...resolutionHoursList) : 0;
      const slowestResolutionHours = resolutionHoursList.length > 0 ? Math.max(...resolutionHoursList) : 0;
      const resolvedWithin24h = resolutionHoursList.filter((h) => h <= HOURS_PER_DAY).length;
      const resolvedWithin24hPct = resolutionHoursList.length > 0
        ? Math.round((resolvedWithin24h / resolutionHoursList.length) * 100)
        : 0;

      const priorityTickets = ticketList.filter((t: Record<string, unknown>) => t.priority === true);
      const priorityPct = ticketList.length > 0 ? Math.round((priorityTickets.length / ticketList.length) * 100) : 0;

      const priorityLevelCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
      ticketList.forEach((t: Record<string, unknown>) => {
        const level = resolveTicketPriorityLevel({
          priority_level: t.priority_level as string | null | undefined,
          priority: t.priority === true,
        });
        priorityLevelCounts[level] += 1;
      });

      /* Multi-attempt FE resolution metrics */
      const totalAttempts = assignmentList.length;
      const failedOutcomes = (assignmentList as Record<string, unknown>[]).filter((a) => a.outcome === 'FAILED').length;
      const successOutcomes = (assignmentList as Record<string, unknown>[]).filter((a) => a.outcome === 'SUCCESS').length;
      const attemptsPerTicket = new Map<string, number>();
      (assignmentList as Record<string, unknown>[]).forEach((a) => {
        const tid = a.ticket_id as string;
        attemptsPerTicket.set(tid, (attemptsPerTicket.get(tid) || 0) + 1);
      });
      const resolvedTicketIds = new Set(
        ticketList
          .filter((t: Record<string, unknown>) => t.status === 'RESOLVED')
          .map((t: Record<string, unknown>) => t.id as string)
      );
      const resolvedAttemptCounts: number[] = [...resolvedTicketIds]
        .map((id: string) => attemptsPerTicket.get(id) || 0)
        .filter((n): n is number => n > 0);
      const avgAttemptsBeforeResolution =
        resolvedAttemptCounts.length > 0
          ? resolvedAttemptCounts.reduce((s: number, n: number) => s + n, 0) / resolvedAttemptCounts.length
          : null;
      const failureRatePct =
        totalAttempts > 0 ? Math.round((failedOutcomes / totalAttempts) * 100) : 0;
      const priorityResolvedHours = priorityTickets
        .map((t: Record<string, unknown>) => getResolutionHours(t as Parameters<typeof getResolutionHours>[0]))
        .filter((h): h is number => h != null);
      const normalResolvedHours = ticketList
        .filter((t: Record<string, unknown>) => t.priority !== true)
        .map((t: Record<string, unknown>) => getResolutionHours(t as Parameters<typeof getResolutionHours>[0]))
        .filter((h): h is number => h != null);
      const avgResolutionPriority = priorityResolvedHours.length > 0
        ? priorityResolvedHours.reduce((s, h) => s + h, 0) / priorityResolvedHours.length
        : 0;
      const avgResolutionNormal = normalResolvedHours.length > 0
        ? normalResolvedHours.reduce((s, h) => s + h, 0) / normalResolvedHours.length
        : 0;
      const priorityTicketIds = new Set(priorityTickets.map((t: Record<string, unknown>) => t.id as string));
      let prioritySlaTotal = 0;
      let prioritySlaBreached = 0;
      let normalSlaTotal = 0;
      let normalSlaBreached = 0;
      slaListMetrics.forEach((s: Record<string, unknown>) => {
        const breached = !!(s.assignment_breached || s.onsite_breached || s.resolution_breached);
        if (priorityTicketIds.has(s.ticket_id as string)) {
          prioritySlaTotal++;
          if (breached) prioritySlaBreached++;
        } else {
          normalSlaTotal++;
          if (breached) normalSlaBreached++;
        }
      });
      const slaCompliancePriority = prioritySlaTotal > 0 ? Math.round(((prioritySlaTotal - prioritySlaBreached) / prioritySlaTotal) * 100) : 100;
      const slaComplianceNormal = normalSlaTotal > 0 ? Math.round(((normalSlaTotal - normalSlaBreached) / normalSlaTotal) * 100) : 100;

      const slaCompliance = totalSLA > 0 ? Math.round(((totalSLA - breachedSLA) / totalSLA) * 100) : 100;
      const activeFEs = feList.filter((fe: Record<string, unknown>) => fe.active).length;
      const inactiveFEs = feList.filter((fe: Record<string, unknown>) => !fe.active).length;

      const feWorkload = feList.map((fe: Record<string, unknown>) => {
        const feAssignments = assignmentList.filter((a: Record<string, unknown>) => a.fe_id === fe.id);
        const activeAssignments = feAssignments.filter((a: Record<string, unknown>) => {
          const t = ticketList.find((ticket: Record<string, unknown>) => ticket.id === a.ticket_id);
          const st = t ? (t.status as string) : "";
          const currentId = t?.current_assignment_id as string | null | undefined;
          if (!t || !currentId || String(currentId) !== String(a.id)) return false;
          return st !== "RESOLVED" && st !== "REJECTED";
        });
        return {
          name: (fe.name as string).split(' ')[0],
          active: activeAssignments.length,
          total: feAssignments.length,
        };
      }).filter((fe: { total: number }) => fe.total > 0);

      const now = new Date();
      const todayStr = formatIST(now, 'yyyy-MM-dd');
      const volumeByDay: { date: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const dayStartIST = getStartOfDayIST(todayStr);
        const dayStartMs = dayStartIST.getTime() - i * 24 * 60 * 60 * 1000;
        const dayStartDate = new Date(dayStartMs);
        const dateStr = formatIST(dayStartDate, 'yyyy-MM-dd');
        const dayEndDate = getEndOfDayIST(dateStr);
        const dayTickets = ticketList.filter((t: Record<string, unknown>) => {
          const created = (t.created_at as string) || '';
          if (!created) return false;
          const createdTime = new Date(created).getTime();
          return createdTime >= dayStartDate.getTime() && createdTime <= dayEndDate.getTime();
        });
        volumeByDay.push({
          date: formatIST(dayStartDate, 'EEE MM/dd'),
          count: dayTickets.length,
        });
      }

      return {
        tickets: ticketList,
        totalTickets: ticketList.length,
        openTickets: statusCounts['OPEN'] || 0,
        resolvedTickets: statusCounts['RESOLVED'] || 0,
        avgConfidence: confidenceCount > 0 ? Math.round(totalConfidence / confidenceCount) : 0,
        slaCompliance,
        activeFEs,
        inactiveFEs,
        statusData: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
        categoryData: Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([name, value]) => ({ name, value })),
        resolutionCategoryData: Object.entries(resolutionCategoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, value]) => ({ name, value })),
        locationData: Object.entries(locationCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, value]) => ({ name, value })),
        stateData: Object.entries(stateCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, value]) => ({ name, value })),
        confidenceData: [
          { name: 'High (≥95%)', value: confidenceDistribution.high, color: '#22C55E' },
          { name: 'Medium (80-94%)', value: confidenceDistribution.medium, color: '#F97316' },
          { name: 'Low (<80%)', value: confidenceDistribution.low, color: '#EF4444' },
        ],
        feWorkload,
        volumeByDay,
        needsReview: ticketList.filter((t: Record<string, unknown>) => t.needs_review).length,
        assignmentSlaCompliance: assignmentCompliance,
        onsiteSlaCompliance: onsiteCompliance,
        resolutionSlaCompliance: resolutionCompliance,
        totalBreachedTickets,
        feWithMostBreachesName: feMostBreachesName,
        feMostBreachesCount,
        avgResolutionHours,
        medianResolutionHours,
        fastestResolutionHours,
        slowestResolutionHours,
        resolvedWithin24hPct,
        avgResolutionHoursOverall: resolutionHoursList.length > 0 ? avgResolutionHours : null,
        priorityPct,
        priorityLevelCounts,
        avgResolutionPriority,
        avgResolutionNormal,
        slaCompliancePriority: slaCompliancePriority,
        slaComplianceNormal: slaComplianceNormal,
        totalAttempts,
        failedAttempts: failedOutcomes,
        successAttempts: successOutcomes,
        avgAttemptsBeforeResolution: avgAttemptsBeforeResolution != null ? Math.round(avgAttemptsBeforeResolution * 100) / 100 : null,
        failureRatePct,
        exportContext: {
          sla: slaList as Record<string, unknown>[],
          ticket_assignments: assignmentList as Record<string, unknown>[],
          field_executives: feList as Record<string, unknown>[],
          staff_users: staffUsers,
        },
      };
    },
    refetchInterval: 60000,
  });

  const feScorecards = useMemo(() => {
    const tickets = (analyticsData?.tickets ?? []) as Record<string, unknown>[];
    const ctx = analyticsData?.exportContext;
    if (!tickets.length || !ctx) return [];
    return computeFeScorecards(
      tickets,
      (ctx.ticket_assignments ?? []) as Record<string, unknown>[],
      (ctx.sla ?? []) as Record<string, unknown>[],
      (ctx.field_executives ?? []) as Record<string, unknown>[]
    );
  }, [analyticsData?.tickets, analyticsData?.exportContext]);

  const smScorecards = useMemo(() => {
    const tickets = (analyticsData?.tickets ?? []) as Record<string, unknown>[];
    const ctx = analyticsData?.exportContext;
    if (!tickets.length || !ctx) return [];
    return computeServiceManagerScorecards(
      tickets,
      (ctx.ticket_assignments ?? []) as Record<string, unknown>[],
      (ctx.sla ?? []) as Record<string, unknown>[],
      (ctx.staff_users ?? []) as AnalyticsStaffUser[]
    );
  }, [analyticsData?.tickets, analyticsData?.exportContext]);

  const opsHealth = useMemo(() => {
    const tickets = (analyticsData?.tickets ?? []) as Record<string, unknown>[];
    const ctx = analyticsData?.exportContext;
    if (!ctx) return null;
    return computeOperationalHealth(
      tickets,
      (ctx.ticket_assignments ?? []) as Record<string, unknown>[],
      (ctx.sla ?? []) as Record<string, unknown>[],
      (ctx.field_executives ?? []) as Record<string, unknown>[]
    );
  }, [analyticsData?.tickets, analyticsData?.exportContext]);

  const teamOps = useMemo(() => {
    const tickets = (analyticsData?.tickets ?? []) as Record<string, unknown>[];
    const ctx = analyticsData?.exportContext;
    if (!ctx) return null;
    return computeTeamOperationsSummary(
      tickets,
      (ctx.ticket_assignments ?? []) as Record<string, unknown>[],
      (ctx.sla ?? []) as Record<string, unknown>[]
    );
  }, [analyticsData?.tickets, analyticsData?.exportContext]);

  const executiveSummary = useMemo(() => {
    const tickets = (analyticsData?.tickets ?? []) as Record<string, unknown>[];
    const ctx = analyticsData?.exportContext;
    if (!ctx) return null;
    return computeExecutiveSummary(
      tickets,
      (ctx.ticket_assignments ?? []) as Record<string, unknown>[],
      (ctx.sla ?? []) as Record<string, unknown>[],
      (ctx.field_executives ?? []) as Record<string, unknown>[]
    );
  }, [analyticsData?.tickets, analyticsData?.exportContext]);

  const leaderboards = useMemo(() => {
    if (!feScorecards.length) return null;
    return computeFeLeaderboards(feScorecards, 5);
  }, [feScorecards]);

  const managementHighlights = useMemo(() => {
    if (!opsHealth) return null;
    return computeManagementHighlights(
      feScorecards,
      opsHealth,
      (analyticsData?.tickets ?? []) as Record<string, unknown>[]
    );
  }, [feScorecards, opsHealth, analyticsData?.tickets]);

  const handleExportTickets = useCallback(() => {
    const tickets = analyticsData?.tickets as Record<string, unknown>[] | undefined;
    if (!tickets || tickets.length === 0) return;
    const baseHeaders = ['ticket_number', 'status', 'complaint_id', 'vehicle_number', 'vehicle_name', 'vehicle_type', 'category', 'issue_type', 'state', 'location', 'opened_at', 'created_at', 'priority', 'priority_level', 'confidence_score', 'needs_review', 'client_slug', 'resolution_category'];
    const headerDisplay = [
      ...baseHeaders.map((h) => (h === 'client_slug' ? 'Client' : h)),
      ...TICKET_EXPORT_APPENDED_HEADERS,
    ];

    const ctx = analyticsData?.exportContext;
    const maps = buildTicketExportEnrichmentMaps(
      (ctx?.sla ?? []) as Parameters<typeof buildTicketExportEnrichmentMaps>[0],
      (ctx?.ticket_assignments ?? []) as Parameters<typeof buildTicketExportEnrichmentMaps>[1],
      (ctx?.field_executives ?? []) as Parameters<typeof buildTicketExportEnrichmentMaps>[2]
    );

    const rows = tickets.map((t) => {
      const baseValues = baseHeaders.map((h) => {
        if (h === 'resolution_category') {
          return formatResolutionCategoryDisplay(
            t.resolution_category as string | null | undefined,
            t.verification_remarks as string | null | undefined
          );
        }
        return t[h] != null ? String(t[h]) : '';
      });
      return [...baseValues, ...getAppendedTicketExportValues(t, maps)];
    });
    const csv = rowsToCsv([headerDisplay, ...rows]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-tickets-${todayIST()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analyticsData?.tickets, analyticsData?.exportContext]);

  const setDateRange = useCallback((days: number | null) => {
    if (days === null) {
      setStartDate('');
      setEndDate('');
      return;
    }
    const today = getStartOfDayIST(todayIST());
    const start = subDays(today, days - 1);
    setStartDate(formatIST(start, 'yyyy-MM-dd'));
    setEndDate(formatIST(today, 'yyyy-MM-dd'));
  }, []);

  const handleExportMetrics = useCallback(() => {
    const d = analyticsData;
    if (!d) return;
    const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${String(v).replace(/"/g, '""')}"` : v);
    const sections: string[] = [];

    // 1) Summary metrics (existing)
    const summaryRows = [
      ['Metric', 'Value'],
      ['Total Tickets', String(d.totalTickets)],
      ['Resolved Tickets', String(d.resolvedTickets)],
      ['Needs Review', String(d.needsReview)],
      ['SLA Compliance %', `${d.slaCompliance}%`],
      ['Assignment SLA Compliance %', `${d.assignmentSlaCompliance}%`],
      ['Onsite SLA Compliance %', `${d.onsiteSlaCompliance}%`],
      ['Resolution SLA Compliance %', `${d.resolutionSlaCompliance}%`],
      ['Total Breached Tickets', String(d.totalBreachedTickets)],
      ['FE With Most Breaches', `${d.feWithMostBreachesName} (${d.feMostBreachesCount})`],
      ['Avg Resolution (hours)', String(d.avgResolutionHours?.toFixed(2) ?? '—')],
      ['Median Resolution (hours)', String(d.medianResolutionHours?.toFixed(2) ?? '—')],
      ['Fastest Resolution (hours)', String(d.fastestResolutionHours?.toFixed(2) ?? '—')],
      ['Slowest Resolution (hours)', String(d.slowestResolutionHours?.toFixed(2) ?? '—')],
      ['Resolved Within 24h %', `${d.resolvedWithin24hPct}%`],
      ['Priority Tickets % (legacy high)', `${d.priorityPct}%`],
      ['Low Priority Tickets', String(d.priorityLevelCounts?.LOW ?? 0)],
      ['Medium Priority Tickets', String(d.priorityLevelCounts?.MEDIUM ?? 0)],
      ['High Priority Tickets', String(d.priorityLevelCounts?.HIGH ?? 0)],
      ['Avg Resolution Priority (hours)', String(d.avgResolutionPriority?.toFixed(2) ?? '—')],
      ['Avg Resolution Normal (hours)', String(d.avgResolutionNormal?.toFixed(2) ?? '—')],
      ['SLA Compliance (Priority)', `${d.slaCompliancePriority}%`],
      ['SLA Compliance (Normal)', `${d.slaComplianceNormal}%`],
      ['Total FE Attempts', String(d.totalAttempts ?? '—')],
      ['Failed Attempts', String(d.failedAttempts ?? '—')],
      ['Success Attempts', String(d.successAttempts ?? '—')],
      ['Avg Attempts Before Resolution', String(d.avgAttemptsBeforeResolution != null ? d.avgAttemptsBeforeResolution : '—')],
      ['Failure Rate %', `${d.failureRatePct ?? 0}%`],
    ];
    sections.push(summaryRows.map((r) => r.map(escape).join(',')).join('\n'));

    // 2) Chart data: Status Distribution
    const statusData = (d.statusData as { name: string; value: number }[]) ?? [];
    if (statusData.length > 0) {
      sections.push('\nStatus Distribution\nStatus,Count\n' + statusData.map((r) => `${escape(r.name)},${r.value}`).join('\n'));
    }

    // 3) Chart data: Category (Top 6)
    const categoryData = (d.categoryData as { name: string; value: number }[]) ?? [];
    if (categoryData.length > 0) {
      sections.push('\nCategory (Top 6)\nCategory,Count\n' + categoryData.map((r) => `${escape(r.name)},${r.value}`).join('\n'));
    }

    const resolutionCategoryData = (d.resolutionCategoryData as { name: string; value: number }[]) ?? [];
    if (resolutionCategoryData.length > 0) {
      sections.push(
        '\nResolution Category (Top 8)\nResolution Category,Count\n' +
          resolutionCategoryData.map((r) => `${escape(r.name)},${r.value}`).join('\n')
      );
    }

    // 4) Chart data: Location (Top 8)
    const locationData = (d.locationData as { name: string; value: number }[]) ?? [];
    if (locationData.length > 0) {
      sections.push('\nLocation (Top 8)\nLocation,Count\n' + locationData.map((r) => `${escape(r.name)},${r.value}`).join('\n'));
    }
    const stateData = (d.stateData as { name: string; value: number }[]) ?? [];
    if (stateData.length > 0) {
      sections.push('\nTickets by State\nState,Count\n' + stateData.map((r) => `${escape(r.name)},${r.value}`).join('\n'));
    }

    // 5) Chart data: Volume by Day (Last 7 Days)
    const volumeByDay = (d.volumeByDay as { date: string; count: number }[]) ?? [];
    if (volumeByDay.length > 0) {
      sections.push('\nVolume by Day (Last 7 Days)\nDate,Count\n' + volumeByDay.map((r) => `${escape(r.date)},${r.count}`).join('\n'));
    }

    // 6) Chart data: Confidence Distribution
    const confidenceData = (d.confidenceData as { name: string; value: number }[]) ?? [];
    if (confidenceData.length > 0) {
      sections.push('\nConfidence Distribution\nLevel,Count\n' + confidenceData.map((r) => `${escape(r.name)},${r.value}`).join('\n'));
    }

    // 7) Chart data: FE Workload
    const feWorkload = (d.feWorkload as { name: string; active: number; total: number }[]) ?? [];
    if (feWorkload.length > 0) {
      sections.push('\nField Executive Workload\nFE Name,Active,Total\n' + feWorkload.map((r) => `${escape(r.name)},${r.active},${r.total}`).join('\n'));
    }

    // 8) Field Executive scorecards
    if (feScorecards.length > 0) {
      const feRows = feScorecardsToCsvRows(feScorecards);
      sections.push(
        '\nField Executive Performance\n' +
          feRows.map((r) => r.map(escape).join(',')).join('\n')
      );
    }

    // 9) Service Manager scorecards
    if (smScorecards.length > 0) {
      const smRows = smScorecardsToCsvRows(smScorecards);
      sections.push(
        '\nService Manager Performance\n' +
          smRows.map((r) => r.map(escape).join(',')).join('\n')
      );
    }

    // 10) Operational health summary
    if (opsHealth) {
      sections.push(
        '\nOperational Health\nMetric,Value\n' +
          [
            ['Pending Assignment', opsHealth.pendingAssignment],
            ['Awaiting Approval', opsHealth.awaitingApproval],
            ['Pending Verification', opsHealth.pendingVerification],
            ['On Site', opsHealth.onSite],
            ['En Route', opsHealth.enRoute],
            ['Reopened', opsHealth.reopened],
            ['Attempt Failed', opsHealth.attemptFailed],
            ['SLA Breach Tickets', opsHealth.slaBreachTickets],
            ['Team Utilization %', opsHealth.teamUtilizationPct],
            ['Org SLA Compliance %', opsHealth.orgSlaCompliancePct],
            ['Operational Health Score', opsHealth.operationalHealthScore],
            ['Avg Assignment Hours', opsHealth.avgAssignmentHours ?? ''],
            ['Avg Verification Wait Hours', opsHealth.avgVerificationWaitHours ?? ''],
          ]
            .map(([k, v]) => `${escape(String(k))},${v}`)
            .join('\n')
      );
    }

    if (teamOps) {
      sections.push(
        '\nTeam Operations (org-level)\nMetric,Value\n' +
          [
            ['Team Productivity %', teamOps.teamProductivityPct],
            ['Pending Approvals', teamOps.pendingApproval],
            ['Verification Queue', teamOps.pendingVerification],
            ['Team Workload', teamOps.teamWorkload],
            ['Avg Assignment Hours', teamOps.avgAssignmentHours ?? ''],
            ['Avg Closure Hours', teamOps.avgClosureHours ?? ''],
            ['Team SLA %', teamOps.teamSlaCompliancePct],
            ['Assigned By Coverage %', teamOps.assignedByCoveragePct],
            ['Attribution Note', teamOps.attributionNote],
          ]
            .map(([k, v]) => `${escape(String(k))},${escape(String(v))}`)
            .join('\n')
      );
    }

    const csv = sections.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-metrics-${todayIST()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analyticsData, feScorecards, smScorecards, opsHealth, teamOps]);

  const exportCtx = useMemo(() => {
    if (!analyticsData?.exportContext) return undefined;
    return {
      ...analyticsData.exportContext,
      companyShortNameBySlug,
    };
  }, [analyticsData?.exportContext, companyShortNameBySlug]);
  const hasTickets = (analyticsData?.tickets?.length ?? 0) > 0;

  const handleOpsExport = useCallback(() => {
    if (!analyticsData?.tickets?.length || !exportCtx) return;
    downloadOperationsReport(analyticsData.tickets as Record<string, unknown>[], exportCtx);
  }, [analyticsData?.tickets, exportCtx]);

  const handleFeExport = useCallback(() => {
    if (!feScorecards.length) return;
    downloadFePerformanceReport(feScorecards);
  }, [feScorecards]);

  const handleSlaExport = useCallback(() => {
    if (!analyticsData?.tickets?.length || !exportCtx) return;
    downloadSlaReport(analyticsData.tickets as Record<string, unknown>[], exportCtx);
  }, [analyticsData?.tickets, exportCtx]);

  const handleResolutionExport = useCallback(() => {
    if (!analyticsData?.tickets?.length) return;
    downloadResolutionReport(
      analyticsData.tickets as Record<string, unknown>[],
      exportCtx ?? undefined
    );
  }, [analyticsData?.tickets, exportCtx]);

  const handleVerificationExport = useCallback(() => {
    if (!analyticsData?.tickets?.length || !exportCtx) return;
    downloadVerificationReport(analyticsData.tickets as Record<string, unknown>[], exportCtx);
  }, [analyticsData?.tickets, exportCtx]);

  const completeReportInput = useMemo(
    () =>
      analyticsData?.tickets?.length && exportCtx
        ? {
            tickets: analyticsData.tickets as Record<string, unknown>[],
            ctx: exportCtx,
            feScorecards,
            opsHealth,
            executiveSummary,
            teamOps,
            smScorecards,
            managementHighlights,
          }
        : null,
    [
      analyticsData?.tickets,
      exportCtx,
      feScorecards,
      opsHealth,
      executiveSummary,
      teamOps,
      smScorecards,
      managementHighlights,
    ]
  );

  const handleCompleteOpsReport = useCallback(async () => {
    if (!completeReportInput) return;
    await downloadCompleteOperationsReportExcel(completeReportInput);
  }, [completeReportInput]);

  const handleOpsExcel = useCallback(async () => {
    if (!completeReportInput) return;
    await downloadOperationsWorkbookExcel(completeReportInput);
  }, [completeReportInput]);

  const handleFeExcel = useCallback(async () => {
    if (!feScorecards.length) return;
    await downloadExecutivePerformanceExcel(feScorecards);
  }, [feScorecards]);

  const handleSlaExcel = useCallback(async () => {
    if (!analyticsData?.tickets?.length || !exportCtx) return;
    await downloadSlaReportExcel(analyticsData.tickets as Record<string, unknown>[], exportCtx);
  }, [analyticsData?.tickets, exportCtx]);

  const handleResolutionExcel = useCallback(async () => {
    if (!analyticsData?.tickets?.length) return;
    await downloadResolutionReportExcel(
      analyticsData.tickets as Record<string, unknown>[],
      exportCtx ?? undefined
    );
  }, [analyticsData?.tickets, exportCtx]);

  const handleVerificationExcel = useCallback(async () => {
    if (!analyticsData?.tickets?.length || !exportCtx) return;
    await downloadVerificationReportExcel(
      analyticsData.tickets as Record<string, unknown>[],
      exportCtx
    );
  }, [analyticsData?.tickets, exportCtx]);

  /* Derived series for charts (from existing data, no new fetch) */
  const resolutionTimeByDay = useMemo(() => {
    const tickets = (analyticsData?.tickets ?? []) as Array<Record<string, unknown> & { status?: string; opened_at?: string | null; updated_at?: string | null; resolved_at?: string | null }>;
    const resolved = tickets.filter((t) => t.status === 'RESOLVED');
    const todayStr = formatIST(new Date(), 'yyyy-MM-dd');
    const out: { date: string; avgHours: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStartIST = getStartOfDayIST(todayStr);
      const dayStartMs = dayStartIST.getTime() - i * 24 * 60 * 60 * 1000;
      const dayStartDate = new Date(dayStartMs);
      const dateStr = formatIST(dayStartDate, 'yyyy-MM-dd');
      const dayEndDate = getEndOfDayIST(dateStr);
      const dayResolved = resolved.filter((t) => {
        const resolvedAt = (t.resolved_at ?? t.updated_at) as string | undefined;
        if (!resolvedAt) return false;
        const tms = new Date(resolvedAt).getTime();
        return tms >= dayStartDate.getTime() && tms <= dayEndDate.getTime();
      });
      const hours = dayResolved
        .map((t) => getResolutionHours(t))
        .filter((h): h is number => h != null);
      const avgHours = hours.length > 0 ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;
      out.push({
        date: formatIST(dayStartDate, 'EEE MM/dd'),
        avgHours: Math.round(avgHours * 10) / 10,
        count: dayResolved.length,
      });
    }
    return out;
  }, [analyticsData?.tickets]);

  const slaByPhaseData = useMemo(() => {
    const d = analyticsData;
    if (!d) return [];
    return [
      { name: 'Assignment', value: d.assignmentSlaCompliance ?? 100, fill: '#0EA5E9' },
      { name: 'Onsite', value: d.onsiteSlaCompliance ?? 100, fill: '#22C55E' },
      { name: 'Resolution', value: d.resolutionSlaCompliance ?? 100, fill: '#6B21A8' },
    ];
  }, [analyticsData]);

  const priorityData = useMemo(() => {
    const tickets = (analyticsData?.tickets ?? []) as Array<Record<string, unknown>>;
    const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    tickets.forEach((t) => {
      const level = resolveTicketPriorityLevel({
        priority_level: t.priority_level as string | null | undefined,
        priority: t.priority === true,
      });
      counts[level] += 1;
    });
    return [
      { name: 'Low', value: counts.LOW, fill: '#22C55E' },
      { name: 'Medium', value: counts.MEDIUM, fill: '#FBBF24' },
      { name: 'High', value: counts.HIGH, fill: '#EF4444' },
    ].filter((d) => d.value > 0);
  }, [analyticsData?.tickets]);

  const ticketsThisWeek = useMemo(() => {
    const vol = (analyticsData?.volumeByDay ?? []) as { count: number }[];
    return vol.reduce((s, d) => s + d.count, 0);
  }, [analyticsData?.volumeByDay]);

  const ticketsThisMonth = useMemo(() => {
    const tickets = (analyticsData?.tickets ?? []) as Array<Record<string, unknown> & { opened_at?: string | null; created_at?: string | null }>;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return tickets.filter((t) => {
      const opened = (t.opened_at ?? t.created_at) as string | undefined;
      if (!opened) return false;
      const d = new Date(opened);
      return d.getFullYear() === year && d.getMonth() === month;
    }).length;
  }, [analyticsData?.tickets]);

  const slaBreachRatePct = useMemo(() => {
    const total = analyticsData?.totalTickets ?? 0;
    const breached = analyticsData?.totalBreachedTickets ?? 0;
    if (total === 0) return 0;
    return Math.round((breached / total) * 100);
  }, [analyticsData?.totalTickets, analyticsData?.totalBreachedTickets]);

  const cardSkin = clientReportsMode
    ? "border border-[hsl(270_15%_88%/0.75)] bg-card shadow-[0_1px_4px_hsl(285_25%_10%/0.05),0_8px_24px_hsl(285_25%_10%/0.06)] transition-all duration-200 hover:shadow-[0_4px_20px_hsl(285_25%_10%/0.08)]"
    : "shadow-md border-border/60";
  const chartGridStroke = clientReportsMode ? "hsl(285 22% 88%)" : "#f0f0f0";
  const sectionHeadingClass = cn(
    "text-lg font-semibold text-foreground tracking-tight",
    clientReportsMode && "border-b border-[hsl(270_15%_88%/0.45)] pb-2"
  );

  const content = (
    <div className="space-y-10">
      {/* Section 1 — Filters: page title, quick range, date range, refresh / export */}
      <div className="space-y-4">
        <PageHeader
          title="Analytics"
          description="Executive overview and key metrics"
          icon={BarChart3}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                aria-label="Refresh"
                title="Refresh"
                className="px-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportTickets} disabled={!analyticsData?.tickets?.length}>
                <Download className="h-4 w-4 mr-2" />
                Export Tickets
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportMetrics} disabled={!analyticsData}>
                <Download className="h-4 w-4 mr-2" />
                Export Metrics
              </Button>
              <Button size="sm" onClick={() => void handleCompleteOpsReport()} disabled={!completeReportInput}>
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={!hasTickets}>
                    <Download className="h-4 w-4 mr-2" />
                    Operations Reports
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Excel (.xlsx)</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => void handleOpsExcel()}>
                    Full Operations Workbook
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void handleFeExcel()}
                    disabled={!feScorecards.length}
                  >
                    Executive Performance
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleSlaExcel()}>
                    SLA Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleResolutionExcel()}>
                    Resolution Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleVerificationExcel()}>
                    Verification Report
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>CSV (legacy)</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleOpsExport}>
                    Operations Report (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleFeExport} disabled={!feScorecards.length}>
                    Executive Performance (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSlaExport}>SLA Report (CSV)</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleResolutionExport}>
                    Resolution Report (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleVerificationExport}>
                    Verification Report (CSV)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
        <Card className={cn("w-full", cardSkin)}>
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-wrap gap-2 items-center mb-4">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Quick range</span>
              <Button variant="outline" size="sm" onClick={() => setDateRange(7)} className="shrink-0">
                Last 7 days
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRange(30)} className="shrink-0">
                Last 30 days
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDateRange(90)} className="shrink-0">
                Last 90 days
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDateRange(null)} className="shrink-0">
                Clear range
              </Button>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              {showClientSelector && (
                <div className="min-w-[140px] w-full sm:w-auto sm:min-w-[160px] lg:max-w-[200px]">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Client</Label>
                  <Select
                    value={selectedClientSlug || 'all'}
                    onValueChange={(v) => setSelectedClientSlug(v === 'all' ? '' : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All Clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Clients</SelectItem>
                      {clientOptions.map((slug) => (
                        <SelectItem key={slug} value={slug}>{slug}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="min-w-[140px] w-full sm:w-auto sm:min-w-[160px] lg:max-w-[200px]">
                <Label className="text-xs text-muted-foreground mb-1.5 block">State</Label>
                <Select
                  value={selectedState || 'all'}
                  onValueChange={(v) => setSelectedState(v === 'all' ? '' : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {INDIAN_STATES.map((state) => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[140px] w-full sm:w-auto lg:max-w-[160px]">
                <Label htmlFor="startDate" className="text-xs text-muted-foreground mb-1.5 block">From</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="min-w-[140px] w-full sm:w-auto lg:max-w-[160px]">
                <Label htmlFor="endDate" className="text-xs text-muted-foreground mb-1.5 block">To</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <Button variant="outline" size="default" onClick={() => refetch()} disabled={isLoading} className="shrink-0">
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2 — Key Metrics: 8 cards in consistent grid */}
      <div className="space-y-3">
        <h2 className={cn(sectionHeadingClass, typography.sectionTitle)}>Key Metrics</h2>
        <StatGrid columns={4}>
          <MetricCard label="Tickets This Week" value={ticketsThisWeek} className={cardSkin} />
          <MetricCard label="Tickets This Month" value={ticketsThisMonth} className={cardSkin} />
          <MetricCard label="Total Tickets" value={analyticsData?.totalTickets ?? 0} className={cardSkin} />
          <MetricCard label="Open Tickets" value={analyticsData?.openTickets ?? 0} className={cardSkin} />
          <MetricCard label="Resolved Tickets" value={analyticsData?.resolvedTickets ?? 0} className={cardSkin} />
          <MetricCard label="SLA Compliance" value={`${analyticsData?.slaCompliance ?? 100}%`} className={cardSkin} />
          <MetricCard
            label="Average Resolution Time"
            value={`${analyticsData?.avgResolutionHours != null ? analyticsData.avgResolutionHours.toFixed(1) : '—'}h`}
            className={cardSkin}
          />
          <MetricCard label="SLA Breach Rate" value={`${slaBreachRatePct}%`} className={cardSkin} />
        </StatGrid>
      </div>

      {/* Section 3 — Charts: single grid, equal-height cards, ResponsiveContainer 100% */}
      <div className="space-y-3">
        <h2 className={sectionHeadingClass}>Charts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* 1. Ticket Volume Trend */}
          <Card className={cn("flex w-full min-w-0 flex-col min-h-[340px] overflow-hidden", cardSkin)}>
            <CardHeader className="pb-2 px-4 md:px-6 pt-4 md:pt-6 shrink-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2 break-words min-w-0">
                <Activity className="h-4 w-4 shrink-0" />
                Ticket Volume Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 px-4 pb-4 md:px-6 md:pb-6 pt-0">
              {isLoading ? (
                <div className="flex-1 min-h-[300px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
              ) : (analyticsData?.volumeByDay?.length ?? 0) > 0 ? (
                <div className="w-full h-[300px] min-h-[300px] overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analyticsData?.volumeByDay ?? []} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                      <XAxis dataKey="date" fontSize={12} tickLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#6B21A8" strokeWidth={2} dot={{ fill: '#6B21A8', strokeWidth: 2, r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 min-h-[300px] flex items-center justify-center text-muted-foreground text-sm">No volume data for the selected range</div>
              )}
            </CardContent>
          </Card>

          {/* 2. Ticket Status Distribution — pie, legend bottom, reduced radius */}
          <Card className={cn("flex w-full min-w-0 flex-col min-h-[340px] overflow-hidden", cardSkin)}>
            <CardHeader className="pb-2 px-4 md:px-6 pt-4 md:pt-6 shrink-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2 break-words min-w-0">
                <PieChart className="h-4 w-4 shrink-0" />
                Ticket Status Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 px-4 pb-4 md:px-6 md:pb-6 pt-0 items-center">
              {isLoading ? (
                <div className="flex-1 min-h-[300px] flex items-center justify-center w-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
              ) : (analyticsData?.statusData?.length ?? 0) > 0 ? (
                <div className="w-full h-[300px] min-h-[300px] overflow-hidden px-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie margin={{ top: 16, right: 8, bottom: 56, left: 8 }}>
                      <Pie
                        data={analyticsData?.statusData ?? []}
                        cx="50%"
                        cy="38%"
                        innerRadius={32}
                        outerRadius={52}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {(analyticsData?.statusData ?? []).map((_: { name: string; value: number }, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend layout="horizontal" verticalAlign="bottom" align="center" fontSize={8} iconSize={6} iconType="square" wrapperStyle={{ paddingTop: 6 }} />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 min-h-[300px] flex items-center justify-center text-muted-foreground text-sm w-full">No status data</div>
              )}
            </CardContent>
          </Card>

          {/* 3. SLA Compliance by Phase */}
          <Card className={cn("flex w-full min-w-0 flex-col min-h-[340px] overflow-hidden", cardSkin)}>
            <CardHeader className="pb-2 px-4 md:px-6 pt-4 md:pt-6 shrink-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2 break-words min-w-0">
                <Target className="h-4 w-4 shrink-0" />
                SLA Compliance by Phase
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 px-4 pb-4 md:px-6 md:pb-6 pt-0">
              {isLoading ? (
                <div className="flex-1 min-h-[300px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
              ) : slaByPhaseData.length > 0 ? (
                <div className="w-full h-[300px] min-h-[300px] overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={slaByPhaseData} layout="vertical" margin={{ top: 8, right: 24, left: 72, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} unit="%" fontSize={12} tickLine={false} />
                      <YAxis type="category" dataKey="name" fontSize={12} width={70} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v: number) => [`${v}%`, 'Compliance']} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {slaByPhaseData.map((entry: { fill: string }, index: number) => (
                          <Cell key={`sla-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 min-h-[300px] flex items-center justify-center text-muted-foreground text-sm">No SLA data</div>
              )}
            </CardContent>
          </Card>

          {/* 4. Resolution Time Trend */}
          <Card className={cn("flex w-full min-w-0 flex-col min-h-[340px] overflow-hidden", cardSkin)}>
            <CardHeader className="pb-2 px-4 md:px-6 pt-4 md:pt-6 shrink-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2 break-words min-w-0">
                <Clock className="h-4 w-4 shrink-0" />
                Resolution Time Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 px-4 pb-4 md:px-6 md:pb-6 pt-0">
              {isLoading ? (
                <div className="flex-1 min-h-[300px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
              ) : resolutionTimeByDay.some((d) => d.count > 0) ? (
                <div className="w-full h-[300px] min-h-[300px] overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={resolutionTimeByDay} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                      <XAxis dataKey="date" fontSize={12} tickLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} unit="h" />
                      <Tooltip formatter={(v: number) => [v, 'Avg hours']} />
                      <Line type="monotone" dataKey="avgHours" stroke="#22C55E" strokeWidth={2} dot={{ fill: '#22C55E', strokeWidth: 2, r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 min-h-[300px] flex items-center justify-center text-muted-foreground text-sm">No resolution data for the last 7 days</div>
              )}
            </CardContent>
          </Card>

          {/* Tickets by State */}
          <Card className={cn("flex w-full min-w-0 flex-col min-h-[340px] overflow-hidden", cardSkin)}>
            <CardHeader className="pb-2 px-4 md:px-6 pt-4 md:pt-6 shrink-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2 break-words min-w-0">
                <MapPin className="h-4 w-4 shrink-0" />
                Tickets by State
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 px-4 pb-4 md:px-6 md:pb-6 pt-0">
              {isLoading ? (
                <div className="flex-1 min-h-[300px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
              ) : (analyticsData?.stateData?.length ?? 0) > 0 ? (
                <div className="w-full h-[300px] min-h-[300px] overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData?.stateData ?? []} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                      <XAxis type="number" fontSize={12} tickLine={false} />
                      <YAxis type="category" dataKey="name" fontSize={11} width={100} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#6B21A8" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 min-h-[300px] flex items-center justify-center text-muted-foreground text-sm">No state data</div>
              )}
            </CardContent>
          </Card>

          {/* 5. Tickets by Category */}
          <Card className={cn("flex w-full min-w-0 flex-col min-h-[340px] overflow-hidden", cardSkin)}>
            <CardHeader className="pb-2 px-4 md:px-6 pt-4 md:pt-6 shrink-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2 break-words min-w-0">
                <BarChart3 className="h-4 w-4 shrink-0" />
                Tickets by Category
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 px-4 pb-4 md:px-6 md:pb-6 pt-0">
              {isLoading ? (
                <div className="flex-1 min-h-[300px] flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
              ) : (analyticsData?.categoryData?.length ?? 0) > 0 ? (
                <div className="w-full h-[300px] min-h-[300px] overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData?.categoryData ?? []} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                      <XAxis type="number" fontSize={12} tickLine={false} />
                      <YAxis type="category" dataKey="name" fontSize={11} width={100} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#F97316" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 min-h-[300px] flex items-center justify-center text-muted-foreground text-sm">No category data</div>
              )}
            </CardContent>
          </Card>

          {/* 6. Tickets by Priority (or Location fallback) */}
          <Card className={cn("flex w-full min-w-0 flex-col min-h-[340px] overflow-hidden", cardSkin)}>
            <CardHeader className="pb-2 px-4 md:px-6 pt-4 md:pt-6 shrink-0">
              <CardTitle className="text-base font-semibold flex items-center gap-2 break-words min-w-0">
                {priorityData.length > 0 ? <Star className="h-4 w-4 shrink-0" /> : <MapPin className="h-4 w-4 shrink-0" />}
                {priorityData.length > 0 ? 'Tickets by Priority' : 'Tickets by Location'}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 px-4 pb-4 md:px-6 md:pb-6 pt-0 items-center">
              {isLoading ? (
                <div className="flex-1 min-h-[300px] flex items-center justify-center w-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
              ) : priorityData.length > 0 ? (
                <div className="w-full h-[300px] min-h-[300px] overflow-hidden px-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie margin={{ top: 16, right: 8, bottom: 56, left: 8 }}>
                      <Pie
                        data={priorityData}
                        cx="50%"
                        cy="38%"
                        innerRadius={32}
                        outerRadius={52}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {priorityData.map((entry: { fill: string }, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend layout="horizontal" verticalAlign="bottom" align="center" fontSize={8} iconSize={6} iconType="square" wrapperStyle={{ paddingTop: 6 }} />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              ) : (analyticsData?.locationData?.length ?? 0) > 0 ? (
                <div className="w-full h-[300px] min-h-[300px] overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData?.locationData ?? []} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                      <XAxis type="number" fontSize={12} tickLine={false} />
                      <YAxis type="category" dataKey="name" fontSize={11} width={80} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#0EA5E9" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 min-h-[300px] flex items-center justify-center text-muted-foreground text-sm">No priority or location data</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 4 — Management polish (highlights, leaderboards, attention, extras) */}
      <AnalyticsManagementPolish
        highlights={managementHighlights}
        leaderboards={leaderboards}
        opsHealth={opsHealth}
        cardSkin={cardSkin}
        chartGridStroke={chartGridStroke}
        sectionHeadingClass={sectionHeadingClass}
      />

      {/* Section 5 — Enterprise ops analytics (additive; preserves sections 1–3) */}
      <AnalyticsOpsSections
        feScorecards={feScorecards}
        smScorecards={smScorecards}
        opsHealth={opsHealth}
        teamOps={teamOps}
        executiveSummary={executiveSummary}
        isLoading={isLoading}
        cardSkin={cardSkin}
        chartGridStroke={chartGridStroke}
        sectionHeadingClass={sectionHeadingClass}
        showServiceManagers={!clientReportsMode && !isClientRole}
      />
    </div>
  );

  if (clientReportsMode) {
    return (
      <div className="w-full min-w-0 md:mx-auto md:max-w-7xl px-3 md:px-6 py-4 md:py-6">
        {content}
      </div>
    );
  }

  return (
    <AppLayoutNew>
      <PageContainer>
        {content}
      </PageContainer>
    </AppLayoutNew>
  );
}
