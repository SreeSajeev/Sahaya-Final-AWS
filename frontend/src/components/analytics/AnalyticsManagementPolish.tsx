/**
 * Additive management polish: highlights, leaderboards, attention queues, extra charts.
 * Does not replace existing Analytics Key Metrics or Charts sections.
 */

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
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Trophy, AlertTriangle, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  FeLeaderboards,
  ManagementHighlights,
  OperationalHealth,
} from "@/lib/analyticsMetrics";

const PIE_COLORS = ["#6B21A8", "#F97316", "#0EA5E9", "#22C55E", "#EAB308", "#EF4444", "#64748B"];

type Props = {
  highlights: ManagementHighlights | null;
  leaderboards: FeLeaderboards | null;
  opsHealth: OperationalHealth | null;
  cardSkin: string;
  chartGridStroke: string;
  sectionHeadingClass: string;
};

function LeaderboardCard({
  title,
  entries,
  cardSkin,
}: {
  title: string;
  entries: FeLeaderboards["topProductivity"];
  cardSkin: string;
}) {
  return (
    <Card className={cn(cardSkin)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Trophy className="h-4 w-4 text-amber-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Insufficient data</p>
        ) : (
          <ol className="space-y-2">
            {entries.map((e) => (
              <li
                key={`${title}-${e.feId}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Badge variant={e.rank === 1 ? "default" : "secondary"} className="shrink-0">
                    #{e.rank}
                  </Badge>
                  <span className="truncate font-medium">{e.name}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">{e.valueLabel}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsManagementPolish({
  highlights,
  leaderboards,
  opsHealth,
  cardSkin,
  chartGridStroke,
  sectionHeadingClass,
}: Props) {
  if (!highlights || !opsHealth) return null;

  const pendingVerif = opsHealth.attentionTickets.filter((t) =>
    t.status === "RESOLVED_PENDING_VERIFICATION" || t.reason.includes("Verification")
  );
  const slaBreach = opsHealth.attentionTickets.filter((t) => t.reason.includes("SLA breached"));
  const unassigned = opsHealth.attentionTickets.filter((t) => t.reason.includes("Unassigned"));
  const highAging = opsHealth.attentionTickets.filter((t) => t.ageHours >= 72);

  const categoryChart = opsHealth.categoryAvgResolution.slice(0, 8).map((c) => ({
    name: c.category.length > 18 ? `${c.category.slice(0, 16)}…` : c.category,
    count: c.count,
  }));
  // Prefer volume from locationVolume for category-like chart — use resolution breakdown as pie
  const resolutionPie = opsHealth.resolutionCategoryBreakdown.slice(0, 6);
  const locationChart = opsHealth.locationVolume.slice(0, 8);

  return (
    <div className="space-y-10">
      {/* Management Summary */}
      <div className="space-y-3">
        <h2 className={cn(sectionHeadingClass, typography.sectionTitle)}>
          <span className="inline-flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5" />
            Management Summary
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Executive snapshot for quick operational decisions.
        </p>
        <StatGrid columns={4}>
          <MetricCard label="Top Performing Executive" value={highlights.topPerformingExecutive} className={cardSkin} />
          <MetricCard label="Most Active Executive" value={highlights.mostActiveExecutive} className={cardSkin} />
          <MetricCard label="Highest Workload" value={highlights.highestWorkload} className={cardSkin} />
          <MetricCard label="Highest Aging Bucket" value={highlights.highestAgingCategory} className={cardSkin} />
          <MetricCard
            label="Most Common Complaint"
            value={highlights.mostCommonComplaintCategory}
            className={cardSkin}
          />
          <MetricCard
            label="Most Common Resolution"
            value={highlights.mostCommonResolutionCategory}
            className={cardSkin}
          />
          <MetricCard
            label="Repeat Complaint Tickets"
            value={highlights.repeatComplaintCount}
            className={cardSkin}
          />
          <MetricCard
            label="Operational Health"
            value={highlights.operationalHealthScore}
            className={cardSkin}
          />
        </StatGrid>
      </div>

      {/* Leaderboards */}
      {leaderboards && (
        <div className="space-y-3">
          <h2 className={cn(sectionHeadingClass, typography.sectionTitle)}>
            Executive Leaderboards
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <LeaderboardCard
              title="Top Productivity"
              entries={leaderboards.topProductivity}
              cardSkin={cardSkin}
            />
            <LeaderboardCard
              title="Most Tickets Closed"
              entries={leaderboards.mostClosed}
              cardSkin={cardSkin}
            />
            <LeaderboardCard
              title="Best SLA Compliance"
              entries={leaderboards.bestSla}
              cardSkin={cardSkin}
            />
            <LeaderboardCard
              title="Lowest Resolution Time"
              entries={leaderboards.lowestResolutionTime}
              cardSkin={cardSkin}
            />
          </div>
        </div>
      )}

      {/* Attention Center */}
      <div className="space-y-3">
        <h2 className={cn(sectionHeadingClass, typography.sectionTitle)}>
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Attention Center
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Tickets that need immediate operational action.
        </p>
        <StatGrid columns={4}>
          <MetricCard label="Pending Verification" value={highlights.pendingVerification} className={cardSkin} />
          <MetricCard label="SLA Breaches (attention)" value={highlights.slaBreachTickets} className={cardSkin} />
          <MetricCard label="Unassigned Tickets" value={highlights.unassignedTickets} className={cardSkin} />
          <MetricCard label="High Aging (≥3d)" value={highlights.highAgingTickets} className={cardSkin} />
        </StatGrid>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(
            [
              ["Pending Verification Queue", pendingVerif],
              ["SLA Breaches", slaBreach],
              ["Unassigned", unassigned],
              ["High Aging (≥72h)", highAging],
            ] as const
          ).map(([title, rows]) => (
            <Card key={title} className={cn(cardSkin)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  {title} ({rows.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTableShell
                  aria-label={title}
                  scrollable
                  emptyState={
                    rows.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">None</p>
                    ) : undefined
                  }
                >
                  {rows.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticket</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Age</TableHead>
                          <TableHead>Why</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.slice(0, 8).map((r) => (
                          <TableRow key={`${title}-${r.ticketNumber}`}>
                            <TableCell className="font-medium">{r.ticketNumber}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {r.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{r.ageHours}h</TableCell>
                            <TableCell className="max-w-[160px] truncate text-muted-foreground">
                              {r.reason}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : null}
                </DataTableShell>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Extra readability charts (additive — do not replace existing Charts section) */}
      <div className="space-y-3">
        <h2 className={sectionHeadingClass}>Operational Visuals</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Card className={cn("flex min-h-[300px] flex-col", cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Created vs Closed</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opsHealth.dailyClosures}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="created" fill="#6B21A8" name="Created" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="closed" fill="#22C55E" name="Closed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("flex min-h-[300px] flex-col", cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Ticket Aging</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opsHealth.agingBuckets}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#F97316" name="Open" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("flex min-h-[300px] flex-col", cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Workload Distribution</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="h-[240px]">
                {opsHealth.workloadDistribution.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No workload data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={opsHealth.workloadDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                      <XAxis dataKey="name" fontSize={10} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="active" fill="#0EA5E9" name="Active" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={cn("flex min-h-[300px] flex-col", cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Location Distribution</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="h-[240px]">
                {locationChart.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No location data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={locationChart} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                      <XAxis type="number" fontSize={11} />
                      <YAxis type="category" dataKey="location" width={90} fontSize={10} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6B21A8" name="Tickets" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={cn("flex min-h-[300px] flex-col", cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Resolution Category Mix</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="h-[240px]">
                {resolutionPie.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No resolution data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={resolutionPie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="45%"
                        outerRadius={70}
                        label={false}
                      >
                        {resolutionPie.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </RechartsPie>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={cn("flex min-h-[300px] flex-col", cardSkin)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Category Volume (resolved)</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="h-[240px]">
                {categoryChart.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No category data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryChart} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} horizontal={false} />
                      <XAxis type="number" fontSize={11} />
                      <YAxis type="category" dataKey="name" width={90} fontSize={10} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#F97316" name="Resolved" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
