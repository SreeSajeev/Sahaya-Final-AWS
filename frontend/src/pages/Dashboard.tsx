import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  PageHeader,
  MetricCard,
  StatGrid,
  DataTableShell,
  typography,
} from "@/components/common";
import {
  TicketsTable,
  TicketsTableEmptyState,
  TICKETS_TABLE_LOADING_LABEL,
} from "@/components/tickets/TicketsTable";
import { DashboardFilterBar } from "@/components/dashboard/DashboardFilterBar";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import { useTickets } from "@/hooks/useTickets";
import { useFieldExecutives } from "@/hooks/useFieldExecutives";
import { useAuth } from "@/hooks/useAuth";
import { fetchJson } from "@/lib/backendDataApi";
import { dashboardFilterSummary } from "@/lib/dashboardFilters";
import {
  LayoutDashboard,
  Ticket,
  AlertTriangle,
  Clock,
  TrendingUp,
  ArrowRight,
  Users,
  Zap,
  CheckCircle,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GradientDivider = () => (
  <div
    className="h-px w-full"
    style={{
      background:
        "linear-gradient(90deg, transparent, hsl(285 45% 55% / 0.18), hsl(32 95% 52% / 0.10), transparent)",
    }}
  />
);

export default function Dashboard() {
  const { userProfile } = useAuth();
  const {
    filters,
    isoRange,
    setClientSlug,
    setState,
    setDatePreset,
    setCustomDateRange,
  } = useDashboardFilters();

  const showClientFilter =
    userProfile?.role === "STAFF" ||
    userProfile?.role === "ADMIN" ||
    userProfile?.role === "SUPER_ADMIN";

  const { data: clientListData } = useQuery({
    queryKey: ["dashboard-client-list", userProfile?.organisation_id, userProfile?.role],
    queryFn: async () => {
      const res = await fetchJson<{ clientSlugs: string[] }>("/data/analytics/client-slugs");
      return res.clientSlugs ?? [];
    },
    enabled: showClientFilter,
  });

  const { data: stats, isLoading: statsLoading } = useDashboardStats({
    clientSlug: filters.clientSlug,
    state: filters.state,
    startDate: isoRange.startDate,
    endDate: isoRange.endDate,
  });

  const { data: recentTickets, isLoading: ticketsLoading } = useTickets({
    status: "all",
    clientSlug: filters.clientSlug ?? undefined,
    state: filters.state ?? undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });
  const { data: fieldExecutives = [] } = useFieldExecutives(true);

  const filterSummary = dashboardFilterSummary(filters);
  const hasDateFilter = filters.datePreset !== "all";

  const recentDisplayTickets = (recentTickets || [])
    .filter((t) => t.status !== "REJECTED")
    .slice(0, 8);

  return (
    <AppLayoutNew>
      <PageContainer>
        <PageHeader
          title="Dashboard"
          description="Welcome back. Here's your operations overview."
          icon={LayoutDashboard}
          actions={
            <DashboardFilterBar
              filters={filters}
              clientOptions={clientListData ?? []}
              showClientFilter={showClientFilter}
              onClientChange={setClientSlug}
              onStateChange={setState}
              onDatePresetChange={setDatePreset}
              onCustomDateRangeChange={setCustomDateRange}
            />
          }
        />

        <section className="space-y-4">
          <h2 className={typography.sectionTitle}>Service Overview</h2>
          <StatGrid>
            <MetricCard
              label="Total Tickets"
              value={statsLoading ? "—" : stats?.totalTickets ?? 0}
              description={hasDateFilter ? filterSummary : "All matching tickets"}
              icon={Ticket}
              variant="primary"
              interactive
            />
            <MetricCard
              label="Assigned Tickets"
              value={statsLoading ? "—" : stats?.assignedTickets ?? 0}
              description="Currently assigned"
              icon={UserCheck}
              variant="accent"
              interactive
            />
            <MetricCard
              label="In Progress Tickets"
              value={statsLoading ? "—" : stats?.inProgressTickets ?? 0}
              description="Active field work"
              icon={Clock}
              variant="default"
            />
            <MetricCard
              label="Resolved Tickets"
              value={statsLoading ? "—" : stats?.resolvedTickets ?? 0}
              description={hasDateFilter ? "Closed in selected period" : "Resolved tickets"}
              icon={CheckCircle}
              variant="default"
            />
          </StatGrid>
        </section>

        <section className="space-y-4">
          <h2 className={typography.sectionTitle}>SLA Overview</h2>
          <StatGrid>
            <MetricCard
              label="Response SLA Breached"
              value={statsLoading ? "—" : stats?.responseSlaBreached ?? 0}
              description="Past response due"
              icon={AlertTriangle}
              variant="default"
            />
            <MetricCard
              label="Resolution SLA Breached"
              value={statsLoading ? "—" : stats?.resolutionSlaBreached ?? 0}
              description="Past resolution due"
              icon={AlertTriangle}
              variant="default"
            />
            <MetricCard
              label="Approaching SLA"
              value={statsLoading ? "—" : stats?.ticketsApproachingSla ?? 0}
              description="≤20% time remaining"
              icon={Clock}
              variant="accent"
            />
            <MetricCard
              label="SLA Compliance %"
              value={
                statsLoading
                  ? "—"
                  : stats?.slaCompliancePercent != null
                    ? `${stats.slaCompliancePercent}%`
                    : "—"
              }
              description="Non-breached resolution SLA"
              icon={TrendingUp}
              variant="primary"
            />
            <MetricCard
              label="Avg Response Time"
              value={
                statsLoading
                  ? "—"
                  : stats?.avgResponseTimeMinutes != null
                    ? `${Math.round(stats.avgResponseTimeMinutes / 60)}h`
                    : "—"
              }
              description="Open → first assignment"
              icon={Zap}
              variant="default"
            />
            <MetricCard
              label="Avg Resolution Time"
              value={
                statsLoading
                  ? "—"
                  : stats?.avgResolutionTimeMinutes != null
                    ? `${Math.round(stats.avgResolutionTimeMinutes / 60)}h`
                    : "—"
              }
              description="Open → resolved"
              icon={CheckCircle}
              variant="default"
            />
          </StatGrid>
        </section>

        {stats?.needsReviewCount ? (
          <>
            <GradientDivider />
            <div
              className="flex animate-slide-up flex-col gap-4 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between md:p-6"
              style={{
                background: "hsl(38 95% 50% / 0.08)",
                border: "1px solid hsl(38 95% 50% / 0.25)",
                boxShadow: "0 1px 3px hsl(285 25% 10% / 0.04)",
              }}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning/20">
                  <AlertTriangle className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className={typography.sectionTitle}>
                    {stats.needsReviewCount} ticket{stats.needsReviewCount > 1 ? "s" : ""} require your
                    attention
                  </p>
                  <p className={cn(typography.body, "text-muted-foreground")}>
                    Low confidence parsing detected. Please verify ticket details.
                  </p>
                </div>
              </div>
              <Link to="/app/review">
                <Button className="btn-primary shrink-0 gap-2">
                  Review Now
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </>
        ) : null}

        <GradientDivider />

        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex flex-row items-center justify-between gap-3">
              <div>
                <h2 className={typography.sectionTitle}>Recent Tickets</h2>
                <p className={cn(typography.body, "mt-0.5 text-muted-foreground")}>
                  Latest service requests
                </p>
              </div>
              <Link to="/app/tickets">
                <Button variant="outline" size="sm" className="gap-1.5">
                  View All
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>

            <DataTableShell
              aria-label="Recent tickets"
              loading={ticketsLoading}
              loadingLabel={TICKETS_TABLE_LOADING_LABEL}
              emptyState={
                !ticketsLoading && recentDisplayTickets.length === 0 ? (
                  <TicketsTableEmptyState />
                ) : undefined
              }
            >
              {!ticketsLoading && recentDisplayTickets.length > 0 ? (
                <TicketsTable tickets={recentDisplayTickets} compact />
              ) : null}
            </DataTableShell>
          </div>

          <div className="space-y-4 md:space-y-5">
            <div
              className="dashboard-side-card rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5 md:p-6"
              style={{
                border: "1px solid hsl(270 15% 88% / 0.6)",
                boxShadow: "0 1px 3px hsl(285 25% 10% / 0.04)",
                background: "hsl(var(--card))",
              }}
            >
              <h3 className={cn(typography.sectionTitle, "mb-3 flex items-center gap-2 md:mb-4")}>
                <Zap className="h-4 w-4 text-accent" />
                Automation Health
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={cn(typography.body, "text-muted-foreground")}>Email Processing</span>
                  <span className="rounded-md border border-success/25 bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                    Active
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={cn(typography.body, "text-muted-foreground")}>Parsing Engine</span>
                  <span className="rounded-md border border-success/25 bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                    Online
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={cn(typography.body, "text-muted-foreground")}>WhatsApp Gateway</span>
                  <span className="rounded-md border border-success/25 bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                    Connected
                  </span>
                </div>
              </div>
            </div>

            <div
              className="dashboard-side-card rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5 md:p-6"
              style={{
                border: "1px solid hsl(270 15% 88% / 0.6)",
                boxShadow: "0 1px 3px hsl(285 25% 10% / 0.04)",
                background: "hsl(var(--card))",
              }}
            >
              <h3 className={cn(typography.sectionTitle, "mb-3 flex items-center gap-2 md:mb-4")}>
                <TrendingUp className="h-4 w-4 text-primary" />
                Ticket Status
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Open", count: stats?.openTickets ?? 0, color: "hsl(205 85% 50%)" },
                  { label: "Assigned", count: stats?.assignedTickets ?? 0, color: "hsl(285 45% 50%)" },
                  { label: "In Progress", count: stats?.inProgressTickets ?? 0, color: "hsl(175 60% 40%)" },
                  { label: "Resolved", count: stats?.resolvedTickets ?? 0, color: "hsl(145 65% 35%)" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: item.color }}
                    />
                    <span className={cn(typography.body, "flex-1 text-muted-foreground")}>
                      {item.label}
                    </span>
                    <span className={cn(typography.body, "font-semibold")}>{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="dashboard-side-card rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5 md:p-6"
              style={{
                border: "1px solid hsl(270 15% 88% / 0.6)",
                boxShadow: "0 1px 3px hsl(285 25% 10% / 0.04)",
                background: "hsl(var(--card))",
              }}
            >
              <h3 className={cn(typography.sectionTitle, "mb-3 flex items-center gap-2 md:mb-4")}>
                <Users className="h-4 w-4 text-accent" />
                Field Team
              </h3>
              <div className="py-4 text-center">
                <p className={typography.kpiValue}>{fieldExecutives.length}</p>
                <p className={cn(typography.meta, "mt-1 font-normal")}>Active Executives</p>
              </div>
              <Link to="/app/field-executives">
                <Button variant="outline" size="sm" className="mt-2 w-full">
                  Manage Team
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </PageContainer>
    </AppLayoutNew>
  );
}
