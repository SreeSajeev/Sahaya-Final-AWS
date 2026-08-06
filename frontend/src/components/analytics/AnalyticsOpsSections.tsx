/**
 * Additive enterprise ops sections for Analytics — does not replace existing charts/KPIs.
 */

import { useMemo, useState } from "react";
import { MetricCard, StatGrid, DataTableShell, typography } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Users,
  UserCog,
  AlertTriangle,
  MapPin,
  Layers,
  Clock,
  Target,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FeScorecard,
  ServiceManagerScorecard,
  OperationalHealth,
  TeamOperationsSummary,
  ExecutiveSummary,
} from "@/lib/analyticsMetrics";

type FeSortKey = keyof FeScorecard;

type Props = {
  feScorecards: FeScorecard[];
  smScorecards: ServiceManagerScorecard[];
  opsHealth: OperationalHealth | null;
  teamOps: TeamOperationsSummary | null;
  executiveSummary: ExecutiveSummary | null;
  isLoading: boolean;
  cardSkin: string;
  chartGridStroke: string;
  sectionHeadingClass: string;
  /** Hide SM / team ops for client portal embedding */
  showServiceManagers?: boolean;
  /** When false, skip Executive Summary (caller already renders Key Metrics only). Default true. */
  showExecutiveSummary?: boolean;
};

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v}%`;
}

function hrs(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v}h`;
}

function sortFeRows(rows: FeScorecard[], key: FeSortKey, dir: "asc" | "desc"): FeScorecard[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * mul;
    }
    const an = av == null ? -Infinity : Number(av);
    const bn = bv == null ? -Infinity : Number(bv);
    if (an === bn) return 0;
    return an > bn ? mul : -mul;
  });
}

export function AnalyticsOpsSections({
  feScorecards,
  smScorecards,
  opsHealth,
  teamOps,
  executiveSummary,
  isLoading,
  cardSkin,
  chartGridStroke,
  sectionHeadingClass,
  showServiceManagers = true,
  showExecutiveSummary = true,
}: Props) {
  const [feSortKey, setFeSortKey] = useState<FeSortKey>("closedThisWeek");
  const [feSortDir, setFeSortDir] = useState<"asc" | "desc">("desc");

  const sortedFe = useMemo(
    () => sortFeRows(feScorecards, feSortKey, feSortDir),
    [feScorecards, feSortKey, feSortDir]
  );

  const toggleSort = (key: FeSortKey) => {
    if (feSortKey === key) setFeSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setFeSortKey(key);
      setFeSortDir("desc");
    }
  };

  const SortHead = ({
    label,
    sortKey,
    className,
  }: {
    label: string;
    sortKey: FeSortKey;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => toggleSort(sortKey)}
      >
        {label}
        <ArrowUpDown
          className={cn(
            "h-3 w-3 opacity-40",
            feSortKey === sortKey && "opacity-100 text-primary"
          )}
        />
      </button>
    </TableHead>
  );

  if (isLoading && !opsHealth) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!opsHealth) return null;

  return (
    <div className="space-y-10">
      {/* Executive Summary — additive; keeps existing Key Metrics section above */}
      {showExecutiveSummary && executiveSummary && (
        <div className="space-y-3">
          <h2 className={cn(sectionHeadingClass, typography.sectionTitle)}>
            Executive Summary
          </h2>
          <p className="text-sm text-muted-foreground">
            High-level operations snapshot from tickets, assignments, and SLA flags. SLA compliance
            reflects phase-dwell breach flags (not open→assign latency).
          </p>
          <StatGrid columns={4}>
            <MetricCard label="Total Tickets" value={executiveSummary.totalTickets} className={cardSkin} />
            <MetricCard label="Open Tickets" value={executiveSummary.openTickets} className={cardSkin} />
            <MetricCard label="Closed Tickets" value={executiveSummary.closedTickets} className={cardSkin} />
            <MetricCard
              label="Pending Verification"
              value={executiveSummary.pendingVerification}
              className={cardSkin}
            />
            <MetricCard
              label="Pending Assignment"
              value={executiveSummary.pendingAssignment}
              className={cardSkin}
            />
            <MetricCard
              label="Tickets Requiring Attention"
              value={executiveSummary.ticketsRequiringAttention}
              className={cardSkin}
            />
            <MetricCard
              label="Overall SLA Compliance"
              value={`${executiveSummary.slaCompliancePct}%`}
              className={cardSkin}
            />
            <MetricCard
              label="Average Resolution Time"
              value={hrs(executiveSummary.avgResolutionHours)}
              className={cardSkin}
            />
            <MetricCard
              label="Operational Health Score"
              value={executiveSummary.operationalHealthScore}
              className={cardSkin}
            />
          </StatGrid>
          <p className="text-xs text-muted-foreground">
            Ticket aging: {executiveSummary.agingSummaryLabel}
          </p>
        </div>
      )}

      {/* Operational health KPIs */}
      <div className="space-y-3">
        <h2 className={cn(sectionHeadingClass, typography.sectionTitle)}>
          Operational Health
        </h2>
        <p className="text-sm text-muted-foreground">
          Where work is stuck, queues, SLA breaches, and team utilization.
        </p>
        <StatGrid columns={4}>
          <MetricCard label="Pending Assignment" value={opsHealth.pendingAssignment} className={cardSkin} />
          <MetricCard label="Awaiting Approval" value={opsHealth.awaitingApproval} className={cardSkin} />
          <MetricCard label="Pending Verification" value={opsHealth.pendingVerification} className={cardSkin} />
          <MetricCard label="On Site Now" value={opsHealth.onSite} className={cardSkin} />
          <MetricCard label="Failed Attempts" value={opsHealth.attemptFailed} className={cardSkin} />
          <MetricCard label="SLA Breach Tickets" value={opsHealth.slaBreachTickets} className={cardSkin} />
          <MetricCard label="Attention Queue" value={opsHealth.attentionTickets.length} className={cardSkin} />
          <MetricCard label="Team Utilization" value={`${opsHealth.teamUtilizationPct}%`} className={cardSkin} />
        </StatGrid>
      </div>

      {/* Trends & bottlenecks */}
      <div className="space-y-3">
        <h2 className={sectionHeadingClass}>Workflow Analytics</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Card className={cn("flex min-h-[320px] flex-col overflow-hidden", cardSkin)}>
            <CardHeader className="shrink-0 pb-2 pt-4 md:pt-6 px-4 md:px-6">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Clock className="h-4 w-4 shrink-0" />
                Ticket Aging Buckets
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 px-4 pb-4 md:px-6 md:pb-6 pt-0">
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opsHealth.agingBuckets}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis dataKey="label" fontSize={11} tickLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#F97316" radius={[4, 4, 0, 0]} name="Open tickets" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("flex min-h-[320px] flex-col overflow-hidden", cardSkin)}>
            <CardHeader className="shrink-0 pb-2 pt-4 md:pt-6 px-4 md:px-6">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Target className="h-4 w-4 shrink-0" />
                Created vs Closed (7 days)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 px-4 pb-4 md:px-6 md:pb-6 pt-0">
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opsHealth.dailyClosures}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="created" fill="#6B21A8" radius={[4, 4, 0, 0]} name="Created" />
                    <Bar dataKey="closed" fill="#22C55E" radius={[4, 4, 0, 0]} name="Closed" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("flex min-h-[320px] flex-col overflow-hidden", cardSkin)}>
            <CardHeader className="shrink-0 pb-2 pt-4 md:pt-6 px-4 md:px-6">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Layers className="h-4 w-4 shrink-0" />
                Workflow Bottlenecks
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 px-4 pb-4 md:px-6 md:pb-6 pt-0">
              {opsHealth.bottleneckStatuses.length === 0 ? (
                <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                  No open-pipeline bottlenecks
                </div>
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={opsHealth.bottleneckStatuses.slice(0, 8)}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                      <XAxis type="number" fontSize={11} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="status"
                        fontSize={10}
                        width={110}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number, _n, item) => {
                          const avg = (item?.payload as { avgAgeHours?: number })?.avgAgeHours;
                          return [`${value} (avg age ${avg ?? "—"}h)`, "Count"];
                        }}
                      />
                      <Bar dataKey="count" fill="#0EA5E9" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={cn("flex min-h-[320px] flex-col overflow-hidden", cardSkin)}>
            <CardHeader className="shrink-0 pb-2 pt-4 md:pt-6 px-4 md:px-6">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                Workload Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 px-4 pb-4 md:px-6 md:pb-6 pt-0">
              {opsHealth.workloadDistribution.length === 0 ? (
                <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                  No workload data
                </div>
              ) : (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={opsHealth.workloadDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                      <XAxis dataKey="name" fontSize={10} tickLine={false} />
                      <YAxis fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="active" fill="#6B21A8" radius={[4, 4, 0, 0]} name="Active load" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className={cn(cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Assignment Analytics</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>Avg time to first assign: {hrs(opsHealth.avgAssignmentHours)}</div>
              <div>Pending assignment queue: {opsHealth.pendingAssignment}</div>
            </CardContent>
          </Card>
          <Card className={cn(cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Verification Analytics</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>Pending verification: {opsHealth.pendingVerification}</div>
              <div>
                Avg SUCCESS→close wait: {hrs(opsHealth.avgVerificationWaitHours)}
              </div>
            </CardContent>
          </Card>
          <Card className={cn(cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Active Queues</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>On site: {opsHealth.onSite}</div>
              <div>Attempt failed: {opsHealth.attemptFailed}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Location / category / resolution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className={cn(cardSkin)}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <MapPin className="h-4 w-4" />
              Location Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTableShell
              aria-label="Location volume"
              scrollable
              emptyState={
                opsHealth.locationVolume.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No location data</p>
                ) : undefined
              }
            >
              {opsHealth.locationVolume.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsHealth.locationVolume.map((r) => (
                      <TableRow key={r.location}>
                        <TableCell className="max-w-[200px] truncate font-medium">{r.location}</TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                        <TableCell className="text-right">{r.openCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </DataTableShell>
          </CardContent>
        </Card>

        <Card className={cn(cardSkin)}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Clock className="h-4 w-4" />
              Category Trends (avg resolution)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTableShell
              aria-label="Category resolution times"
              scrollable
              emptyState={
                opsHealth.categoryAvgResolution.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No resolved tickets with resolved_at in range
                  </p>
                ) : undefined
              }
            >
              {opsHealth.categoryAvgResolution.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Avg hours</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsHealth.categoryAvgResolution.map((r) => (
                      <TableRow key={r.category}>
                        <TableCell className="max-w-[200px] truncate font-medium">{r.category}</TableCell>
                        <TableCell className="text-right">{r.avgHours}h</TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </DataTableShell>
          </CardContent>
        </Card>
      </div>

      {/* Resolution analytics */}
      <div className="space-y-3">
        <h2 className={cn(sectionHeadingClass, typography.sectionTitle)}>Resolution Analytics</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className={cn(cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Resolution Category Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTableShell
                aria-label="Resolution categories"
                scrollable
                emptyState={
                  opsHealth.resolutionCategoryBreakdown.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No resolution categories recorded
                    </p>
                  ) : undefined
                }
              >
                {opsHealth.resolutionCategoryBreakdown.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Resolution</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opsHealth.resolutionCategoryBreakdown.map((r) => (
                        <TableRow key={r.name}>
                          <TableCell className="max-w-[320px] truncate" title={r.name}>
                            {r.name}
                          </TableCell>
                          <TableCell className="text-right">{r.value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
              </DataTableShell>
            </CardContent>
          </Card>

          <Card className={cn(cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Other Resolution Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTableShell
                aria-label="Other resolution details"
                scrollable
                emptyState={
                  opsHealth.otherResolutions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No tickets closed with Resolution Category = Other
                    </p>
                  ) : undefined
                }
              >
                {opsHealth.otherResolutions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Custom resolution</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opsHealth.otherResolutions.map((r) => (
                        <TableRow key={r.ticketNumber}>
                          <TableCell className="whitespace-nowrap font-medium">
                            {r.ticketNumber}
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate" title={r.details}>
                            Other: {r.details}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
              </DataTableShell>
            </CardContent>
          </Card>
        </div>
      </div>

      {opsHealth.repeatComplaints.length > 0 && (
        <Card className={cn(cardSkin)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Repeat Complaint Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {opsHealth.repeatComplaints.map((r) => (
                <Badge key={r.key} variant="outline" className="text-xs font-normal">
                  {r.label} · {r.count} tickets
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attention */}
      <div className="space-y-3">
        <h2 className={cn(sectionHeadingClass, typography.sectionTitle)}>
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Tickets Requiring Attention
          </span>
        </h2>
        <Card className={cn(cardSkin)}>
          <CardContent className="pt-4">
            <DataTableShell
              aria-label="Attention tickets"
              scrollable
              emptyState={
                opsHealth.attentionTickets.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No aging, breached, or stuck tickets in the current view
                  </p>
                ) : undefined
              }
            >
              {opsHealth.attentionTickets.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Why</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsHealth.attentionTickets.map((r) => (
                      <TableRow key={r.ticketNumber}>
                        <TableCell className="font-medium">{r.ticketNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{r.ageHours}h</TableCell>
                        <TableCell className="max-w-[140px] truncate">{r.location}</TableCell>
                        <TableCell className="max-w-[240px] text-muted-foreground">{r.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </DataTableShell>
          </CardContent>
        </Card>
      </div>

      {/* FE performance */}
      <div className="space-y-3">
        <h2 className={cn(sectionHeadingClass, typography.sectionTitle)}>
          <span className="inline-flex items-center gap-2">
            <Users className="h-5 w-5" />
            Field Executive Performance
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Click column headers to sort. Productivity = closed ÷ tickets ever assigned. Avg handle =
          assignment start → end. Repeat assignments = tickets with more than one assignment row.
        </p>
        <Card className={cn(cardSkin)}>
          <CardContent className="pt-4">
            <DataTableShell
              aria-label="Field executive scorecards"
              scrollable
              emptyState={
                feScorecards.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No field executive assignment data in range
                  </p>
                ) : undefined
              }
            >
              {sortedFe.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead label="Executive" sortKey="name" />
                      <SortHead label="Productivity" sortKey="productivityPct" className="text-right" />
                      <SortHead label="Assigned" sortKey="totalAssigned" className="text-right" />
                      <SortHead label="Active" sortKey="activeTickets" className="text-right" />
                      <SortHead label="On Site" sortKey="onSiteTickets" className="text-right" />
                      <SortHead label="Pending Verif." sortKey="pendingVerification" className="text-right" />
                      <SortHead label="Closed" sortKey="closedTickets" className="text-right" />
                      <SortHead label="Workload" sortKey="currentWorkload" className="text-right" />
                      <SortHead label="SLA %" sortKey="slaCompliancePct" className="text-right" />
                      <SortHead label="Avg Res." sortKey="avgResolutionHours" className="text-right" />
                      <SortHead label="Avg Handle" sortKey="avgHandleHours" className="text-right" />
                      <SortHead label="Repeat Asgn" sortKey="repeatAssignments" className="text-right" />
                      <SortHead label="Failed" sortKey="failedAttempts" className="text-right" />
                      <SortHead label="Today" sortKey="closedToday" className="text-right" />
                      <SortHead label="Week" sortKey="closedThisWeek" className="text-right" />
                      <SortHead label="Month" sortKey="closedThisMonth" className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedFe.map((r) => (
                      <TableRow key={r.feId}>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          {!r.active && (
                            <span className="text-xs text-muted-foreground">Inactive</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{pct(r.productivityPct)}</TableCell>
                        <TableCell className="text-right">{r.totalAssigned}</TableCell>
                        <TableCell className="text-right">{r.activeTickets}</TableCell>
                        <TableCell className="text-right">{r.onSiteTickets}</TableCell>
                        <TableCell className="text-right">{r.pendingVerification}</TableCell>
                        <TableCell className="text-right">{r.closedTickets}</TableCell>
                        <TableCell className="text-right">{r.currentWorkload}</TableCell>
                        <TableCell className="text-right">{pct(r.slaCompliancePct)}</TableCell>
                        <TableCell className="text-right">{hrs(r.avgResolutionHours)}</TableCell>
                        <TableCell className="text-right">{hrs(r.avgHandleHours)}</TableCell>
                        <TableCell className="text-right">
                          {r.repeatAssignments ?? r.escalatedTickets}
                        </TableCell>
                        <TableCell className="text-right">{r.failedAttempts}</TableCell>
                        <TableCell className="text-right">{r.closedToday}</TableCell>
                        <TableCell className="text-right">{r.closedThisWeek}</TableCell>
                        <TableCell className="text-right">{r.closedThisMonth}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </DataTableShell>
          </CardContent>
        </Card>
      </div>

      {/* Service team — org-level always; per-manager only with attribution */}
      {showServiceManagers && teamOps && (
        <div className="space-y-3">
          <h2 className={cn(sectionHeadingClass, typography.sectionTitle)}>
            <span className="inline-flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Service Manager / Team Analytics
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">{teamOps.attributionNote}</p>
          <StatGrid columns={4}>
            <MetricCard label="Team Productivity" value={`${teamOps.teamProductivityPct}%`} className={cardSkin} />
            <MetricCard label="Pending Approvals" value={teamOps.pendingApproval} className={cardSkin} />
            <MetricCard label="Verification Queue" value={teamOps.pendingVerification} className={cardSkin} />
            <MetricCard label="Team Workload" value={teamOps.teamWorkload} className={cardSkin} />
            <MetricCard label="Avg Assignment Time" value={hrs(teamOps.avgAssignmentHours)} className={cardSkin} />
            <MetricCard label="Avg Closure Time" value={hrs(teamOps.avgClosureHours)} className={cardSkin} />
            <MetricCard label="Team SLA" value={`${teamOps.teamSlaCompliancePct}%`} className={cardSkin} />
            <MetricCard label="Failed Attempts" value={teamOps.failedAttempts} className={cardSkin} />
          </StatGrid>

          {teamOps.managerAttributionAvailable && smScorecards.length > 0 ? (
            <Card className={cn(cardSkin)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">
                  Per-Manager Attribution ({teamOps.assignedByCoveragePct}% coverage)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTableShell aria-label="Service manager scorecards" scrollable>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Manager</TableHead>
                        <TableHead className="text-right">Tickets</TableHead>
                        <TableHead className="text-right">Pending Verif.</TableHead>
                        <TableHead className="text-right">Closed</TableHead>
                        <TableHead className="text-right">SLA %</TableHead>
                        <TableHead className="text-right">Avg Assign</TableHead>
                        <TableHead className="text-right">Avg Close</TableHead>
                        <TableHead className="text-right">Team Prod.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {smScorecards.map((r) => (
                        <TableRow key={r.userId}>
                          <TableCell>
                            <div className="font-medium">{r.name}</div>
                            {r.email && (
                              <div className="text-xs text-muted-foreground">{r.email}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{r.uniqueTicketsAssigned}</TableCell>
                          <TableCell className="text-right">{r.pendingVerificationQueue}</TableCell>
                          <TableCell className="text-right">{r.closedTickets}</TableCell>
                          <TableCell className="text-right">{pct(r.slaCompliancePct)}</TableCell>
                          <TableCell className="text-right">{hrs(r.avgAssignmentHours)}</TableCell>
                          <TableCell className="text-right">{hrs(r.avgClosureHours)}</TableCell>
                          <TableCell className="text-right">{pct(r.teamProductivityPct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </DataTableShell>
              </CardContent>
            </Card>
          ) : (
            <Card className={cn(cardSkin)}>
              <CardContent className="py-4 text-sm text-muted-foreground">
                Per-manager leaderboards are not shown because{" "}
                <code className="text-xs">ticket_assignments.assigned_by</code> is rarely
                populated by current assign/reassign writers. Org-level team metrics above remain
                accurate. Enabling assigned_by persistence is a small backend change with no schema
                migration.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
