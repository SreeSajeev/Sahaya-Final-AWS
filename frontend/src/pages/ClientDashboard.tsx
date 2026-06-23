/**
 * Client Dashboard
 *
 * Current system (UI/routing only; no backend changes):
 * - Layout: ClientLayout wraps this page (ClientHeader + main content). No staff sidebar.
 * - Data: useDashboardStats(client_slug) and useTickets({ status: "all", clientSlug }) fetch
 *   stats and tickets; sla_tracking is fetched by ticket ids. All existing hooks/API unchanged.
 * - Ticket list: ClientTicketsTable renders tickets; row click opens TicketDetailDrawer;
 *   "Details" link navigates to /app/client/tickets/:ticketId (client ticket detail page).
 * - Analytics: ClientReports page embeds Analytics in clientReportsMode (same charts, client-scoped).
 * - Ticket detail routing: /app/client/tickets/:ticketId renders a view-only client ticket detail page.
 */
import React, { useState, useMemo, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/backendDataApi";
import {
  LayoutDashboard,
  FileText,
  HelpCircle,
  Ticket,
  CheckCircle2,
  Clock,
  BarChart3,
  Download,
  X,
  ChevronRight,
  ExternalLink,
  MapPin,
  CalendarDays,
  ImageIcon,
  Mail,
  LogOut,
  KeyRound,
  ChevronLeft,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { TicketNumberDisplay } from "@/components/common/TicketNumberDisplay";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useTickets } from "@/hooks/useTickets";
import { useTicketListSupplement } from "@/hooks/useTicketListSupplement";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ticketMatchesClientPortalSearch } from "@/lib/ticketSearch";
import { Ticket as TicketType, TicketStatus } from "@/lib/types";
import { formatIST } from "@/lib/dateUtils";
import { createCSVDownload } from "@/lib/csvExport";
import {
  TICKET_EXPORT_APPENDED_HEADERS,
  buildTicketExportEnrichmentMaps,
  getAppendedTicketExportValues,
  buildSlaMapsFromClientRows,
  resolutionTimeHours,
} from "@/lib/ticketExportEnrichment";
import {
  PageHeader,
  MetricCard,
  StatGrid,
  DataTableShell,
  DEFAULT_TABLE_LOADING_LABEL,
  typography,
  dataTableHeadClassName,
  FilterBar,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ClientPortalBackground,
  clientElevatedCardStyle,
  clientPortalHeaderClass,
  clientSectionTitleClass,
} from "@/components/layout/ClientPortalShell";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Request Received",
  NEEDS_REVIEW: "Needs Review",
  ASSIGNED: "Technician Assigned",
  EN_ROUTE: "En Route",
  ON_SITE: "Technician On-Site",
  RESOLVED_PENDING_VERIFICATION: "Under Review",
  RESOLVED: "Completed",
  REOPENED: "Reopened",
};

const STATUS_ORDER: TicketStatus[] = [
  "OPEN",
  "ASSIGNED",
  "ON_SITE",
  "RESOLVED_PENDING_VERIFICATION",
  "RESOLVED",
];

const LIFECYCLE_STEPS: { label: string; status: TicketStatus }[] = [
  { label: "Request Received", status: "OPEN" },
  { label: "Technician Assigned", status: "ASSIGNED" },
  { label: "Technician On-Site", status: "ON_SITE" },
  { label: "Under Review", status: "RESOLVED_PENDING_VERIFICATION" },
  { label: "Completed", status: "RESOLVED" },
];

const GradientDivider = () => (
  <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, hsl(285 45% 55% / 0.18), hsl(32 95% 52% / 0.10), transparent)" }} />
);

const CLIENT_TICKETS_PAGE_SIZE = 25;

// Logo mark (no asset)
const LogoMark = ({ size = 32 }: { size?: number }) => (
  <div
    className="flex items-center justify-center rounded-xl overflow-hidden shrink-0 text-white font-bold"
    style={{
      width: size,
      height: size,
      background: "linear-gradient(145deg, hsl(285 50% 30%), hsl(285 55% 40%))",
      boxShadow: "0 0 0 1px hsl(285 45% 50% / 0.3), 0 2px 8px hsl(285 45% 20% / 0.4)",
      fontSize: size * 0.5,
    }}
  >
    S
  </div>
);

// ─── Client Header (exported for ClientReportsPage) ───────────────────────────

export const ClientHeader = () => {
  const { userProfile, signOut } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;
  const isReports = pathname.startsWith("/app/client/reports");
  const isSupport = pathname.startsWith("/app/client/support");
  const initials = userProfile?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, active: !isReports && !isSupport, to: "/app/client" },
    { label: "Reports", icon: FileText, active: isReports, to: "/app/client/reports" },
    { label: "Support", icon: HelpCircle, active: isSupport, to: "/app/client/support" },
  ];

  const headerActionClass =
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/85 transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-foreground";

  return (
    <header className={clientPortalHeaderClass}>
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-3 md:px-6">
        <Link to="/app/client" className="flex min-w-0 items-center gap-3 shrink-0">
          <img src="/sahaya-logo.png" alt={APP_NAME} className="h-8 w-auto flex-shrink-0" />
          <div className="hidden min-w-0 flex-col sm:flex">
            <span className="truncate text-sm font-bold text-sidebar-foreground">{APP_NAME}</span>
            <span className={cn(typography.meta, "uppercase tracking-wider text-sidebar-primary/70")}>
              BY PARISKQ
            </span>
          </div>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200",
                item.active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
              {item.active && (
                <span
                  className="absolute bottom-1 left-3 right-3 h-0.5 rounded-full bg-sidebar-primary"
                  aria-hidden
                />
              )}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link to="/change-password" className={headerActionClass}>
            <KeyRound className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Change password</span>
          </Link>
          <button type="button" onClick={signOut} className={headerActionClass}>
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Log out</span>
          </button>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-primary/30 bg-sidebar-accent text-xs font-bold text-sidebar-foreground"
            aria-hidden
          >
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
};

// ─── Welcome Section ─────────────────────────────────────────────────────────

const WelcomeSection = ({
  clientDisplayName,
  stats,
  loading,
}: {
  clientDisplayName: string;
  stats: { totalTickets?: number; openTickets?: number; slaBreaches?: number } | null;
  loading: boolean;
}) => (
  <section className="relative py-6 md:py-8">
    <div className="w-full md:mx-auto md:max-w-7xl px-3 md:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <PageHeader
            title={`Welcome back, ${clientDisplayName}`}
            description="Track your service requests with full transparency and SLA visibility."
          />
        </div>
        <div
          className="flex items-center gap-4 rounded-2xl p-4 transition-shadow duration-200 hover:shadow-[0_4px_20px_hsl(285_25%_10%/0.08)]"
          style={clientElevatedCardStyle}
        >
          <div className="px-3 text-center">
            <div className={cn(typography.kpiValue, "text-xl")} style={{ color: "hsl(285 45% 30%)" }}>{loading ? "—" : stats?.openTickets ?? 0}</div>
            <div className={cn(typography.meta, "whitespace-nowrap")}>Active Tickets</div>
          </div>
          <div className="h-8 w-px" style={{ background: "hsl(270 15% 88% / 0.6)" }} />
          <div className="px-3 text-center">
            <div className={cn(typography.kpiValue, "text-xl")} style={{ color: "hsl(145 65% 35%)" }}>{loading ? "—" : (stats?.totalTickets ?? 0) - (stats?.openTickets ?? 0)}</div>
            <div className={cn(typography.meta, "whitespace-nowrap")}>Resolved</div>
          </div>
          <div className="h-8 w-px" style={{ background: "hsl(270 15% 88% / 0.6)" }} />
          <div className="px-3 text-center">
            <div className={cn(typography.kpiValue, "text-xl")} style={{ color: "hsl(32 95% 48%)" }}>
              {(stats?.totalTickets ?? 0) > 0 ? ((stats?.slaBreaches ?? 0) === 0 ? "On track" : "Alert") : "—"}
            </div>
            <div className={cn(typography.meta, "whitespace-nowrap")}>SLA</div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── Status badge (client-facing labels) ───────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/12 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {STATUS_LABELS[status] ?? status}
  </span>
);

const SlaBadge = ({ onTrack }: { onTrack: boolean }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${onTrack ? "border-success/25 bg-success/12 text-success" : "border-destructive/25 bg-destructive/12 text-destructive"}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />
    {onTrack ? "On Track" : "Breached"}
  </span>
);

// ─── Tickets Table (client list) ─────────────────────────────────────────────
// Details uses programmatic navigation so it always goes to ClientTicketDetail.

const ClientTicketsTable = ({
  tickets,
  loading,
  organisationId,
  searchInput,
  onSearchChange,
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  tickets: TicketType[];
  loading: boolean;
  organisationId?: string | null;
  searchInput: string;
  onSearchChange: (value: string) => void;
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) => {
  const navigate = useNavigate();
  const hasSearch = searchInput.trim().length > 0;

  return (
    <section className="py-10">
      <div className="w-full md:mx-auto md:max-w-7xl px-3 md:px-6">
        <h2 className={`mb-4 ${clientSectionTitleClass}`}>Your Service Requests</h2>
        <div
          className="mb-4 rounded-2xl p-4"
          style={clientElevatedCardStyle}
        >
          <FilterBar
            aria-label="Search service requests"
            className="space-y-0"
            search={{
              value: searchInput,
              onChange: onSearchChange,
              placeholder:
                "Search ticket #, complaint ID, vehicle, location, category, status, technician…",
              "aria-label": "Search service requests",
              id: "client-tickets-search",
            }}
            secondary={
              <p className={cn(typography.meta, "text-muted-foreground")}>
                Search across ticket details, status, resolution notes, and assigned technician.
                {hasSearch ? ` Showing ${totalCount} match${totalCount === 1 ? "" : "es"}.` : null}
              </p>
            }
          />
        </div>
        <DataTableShell
          aria-label="Client tickets table"
          loading={loading}
          loadingLabel={DEFAULT_TABLE_LOADING_LABEL}
          emptyState={
            !loading && tickets.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {hasSearch ? "No tickets match your search." : "No tickets yet."}
              </div>
            ) : undefined
          }
          className="rounded-2xl"
        >
          {!loading && tickets.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow style={{ background: "linear-gradient(135deg, hsl(285 20% 96%), hsl(270 10% 94%))", borderBottom: "1px solid hsl(270 15% 88% / 0.7)" }}>
                    <TableHead className={dataTableHeadClassName}>Ticket ID</TableHead>
                    <TableHead className={dataTableHeadClassName}>Summary</TableHead>
                    <TableHead className={dataTableHeadClassName}>Status</TableHead>
                    <TableHead className={dataTableHeadClassName}>Last Updated</TableHead>
                    <TableHead className={cn(dataTableHeadClassName, "text-right")} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket, i) => (
                    <TableRow
                      key={ticket.id}
                      className="group transition-all duration-150"
                      style={{
                        background: i % 2 === 1 ? "hsl(270 10% 94% / 0.15)" : "hsl(0 0% 100%)",
                        borderBottom: i < tickets.length - 1 ? "1px solid hsl(270 15% 88% / 0.4)" : "none",
                      }}
                    >
                      <TableCell className="whitespace-nowrap px-5 py-3 text-xs font-medium text-foreground">
                        <TicketNumberDisplay
                          ticketNumber={ticket.ticket_number}
                          organisationId={ticket.organisation_id ?? organisationId}
                          variant="compact"
                        />
                      </TableCell>
                      <TableCell className="max-w-xs truncate px-5 py-3 text-foreground">{ticket.issue_type || ticket.category || ticket.ticket_number}</TableCell>
                      <TableCell className="px-5 py-3"><StatusBadge status={ticket.status} /></TableCell>
                      <TableCell className="whitespace-nowrap px-5 py-3 text-muted-foreground">{formatIST(ticket.updated_at, "yyyy-MM-dd")}</TableCell>
                      <TableCell className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/app/client/tickets/${ticket.id}`)}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary transition-all duration-200 hover:bg-primary/6 cursor-pointer bg-transparent border-0"
                        >
                          Details <ChevronRight className="h-3 w-3" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </DataTableShell>
        {!loading && totalCount > CLIENT_TICKETS_PAGE_SIZE ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3" style={clientElevatedCardStyle}>
            <p className={cn(typography.meta, "text-muted-foreground")}>
              Page {page} of {totalPages} · {totalCount} ticket{totalCount === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

// ─── Ticket Detail Drawer ─────────────────────────────────────────────────────

const TicketDetailDrawer = ({
  ticket,
  onClose,
  organisationId,
}: {
  ticket: TicketType | null;
  onClose: () => void;
  organisationId?: string | null;
}) => {
  if (!ticket) return null;
  const currentIdx = STATUS_ORDER.indexOf(ticket.status);

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} style={{ background: "hsl(285 45% 10% / 0.4)", backdropFilter: "blur(6px)" }} />
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto"
        style={{
          background: "linear-gradient(180deg, hsl(0 0% 100%), hsl(285 10% 98%))",
          boxShadow: "-8px 0 40px hsl(285 45% 10% / 0.15), -1px 0 0 hsl(270 15% 88% / 0.5)",
        }}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid hsl(270 15% 88% / 0.6)", background: "linear-gradient(135deg, hsl(285 20% 97%), hsl(0 0% 100%))" }}>
          <div>
            <TicketNumberDisplay
              ticketNumber={ticket.ticket_number}
              organisationId={ticket.organisation_id ?? organisationId}
              variant="compact"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <StatusBadge status={ticket.status} />
              <SlaBadge onTrack={true} />
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted/50 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 p-6">
          <div>
            <h3 className="text-base font-semibold text-foreground tracking-tight">{ticket.issue_type || ticket.category || ticket.ticket_number}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{ticket.category && ticket.issue_type ? `${ticket.category} · ${ticket.issue_type}` : "Service request"}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {ticket.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{ticket.location}</span>}
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />Created {formatIST(ticket.opened_at, "yyyy-MM-dd")}</span>
            </div>
          </div>

          <div className="h-px w-full" style={{ background: "linear-gradient(90deg, transparent, hsl(285 45% 55% / 0.15), transparent)" }} />

          <div>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Lifecycle Progress</h4>
            <div className="space-y-0">
              {LIFECYCLE_STEPS.map((step, i) => {
                const stepIdx = STATUS_ORDER.indexOf(step.status);
                const isComplete = stepIdx < currentIdx;
                const isCurrent = stepIdx === currentIdx;
                const isPending = stepIdx > currentIdx;
                return (
                  <div key={step.label} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                        style={
                          isComplete ? { background: "hsl(145 65% 35%)", color: "white", boxShadow: "0 0 8px hsl(145 65% 35% / 0.3)" }
                          : isCurrent ? { background: "linear-gradient(135deg, hsl(285 45% 30%), hsl(285 45% 40%))", color: "white", boxShadow: "0 0 12px hsl(285 45% 40% / 0.4)" }
                          : { background: "hsl(270 10% 94%)", color: "hsl(270 10% 45%)", border: "1px solid hsl(270 15% 88%)" }
                        }
                      >
                        {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                      </div>
                      {i < LIFECYCLE_STEPS.length - 1 && <div className="w-px flex-1 min-h-[18px]" style={{ background: isComplete ? "hsl(145 65% 35% / 0.4)" : "hsl(270 15% 88%)" }} />}
                    </div>
                    <div className={`pb-3.5 ${isPending ? "opacity-35" : ""}`}>
                      <p className={`text-sm font-medium ${isCurrent ? "text-primary" : "text-foreground"}`}>{step.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {ticket.status === "RESOLVED" && (
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Resolution Proof</h4>
              <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: "hsl(145 65% 35% / 0.06)", border: "1px solid hsl(145 65% 35% / 0.18)" }}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/12">
                  <ImageIcon className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Resolution Verified</p>
                  <p className="text-xs text-muted-foreground">Evidence submitted and validated</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6" style={{ borderTop: "1px solid hsl(270 15% 88% / 0.6)" }}>
          <Link
            to={`/app/client/tickets/${ticket.id}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-px"
            style={{ background: "linear-gradient(135deg, hsl(32 95% 46%), hsl(32 95% 54%))", boxShadow: "0 2px 12px hsl(32 95% 52% / 0.35), inset 0 1px 0 hsl(0 0% 100% / 0.15)" }}
          >
            <Download className="h-4 w-4" />
            View Full Details
          </Link>
        </div>
      </div>
    </>
  );
};

// ─── Reports Section ─────────────────────────────────────────────────────────

type SlaRow = { ticket_id: string; assignment_breached?: boolean; onsite_breached?: boolean; resolution_breached?: boolean };

const REPORTS = [
  { id: "ticket-summary" as const, title: "Ticket Summary (CSV)", desc: "Export all service requests with status and SLA data.", icon: FileText },
  { id: "monthly-sla" as const, title: "Monthly SLA Report", desc: "Phase-based SLA compliance summary for management review.", icon: BarChart3 },
  { id: "resolution" as const, title: "Resolution Report", desc: "Detailed resolution records with proof and timelines.", icon: CheckCircle2 },
];

function getReportFilename(prefix: string, orgNameOrSlug: string): string {
  const safe = (orgNameOrSlug || "export").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 32);
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${safe}-${date}.csv`;
}

const ReportsSection = ({
  tickets,
  stats,
  slaData,
  orgNameOrSlug,
}: {
  tickets: TicketType[];
  stats: { slaBreaches?: number } | null;
  slaData: SlaRow[] | undefined;
  orgNameOrSlug: string;
}) => {
  const breachedSet = React.useMemo(() => {
    if (!slaData) return new Set<string>();
    return new Set(
      slaData
        .filter((s) => s.assignment_breached || s.onsite_breached || s.resolution_breached)
        .map((s) => s.ticket_id)
    );
  }, [slaData]);

  const onTicketSummary = () => {
    const baseHeaders = ["ticket_id", "summary", "status", "client_slug", "created_at", "updated_at", "sla_status", "organisation_id"];
    const appendedIdentity = ["ticket_number", "complaint_id", "vehicle_number", "issue_type", "state", "location", "opened_at"];
    const headers = [...baseHeaders, ...appendedIdentity, ...TICKET_EXPORT_APPENDED_HEADERS];

    const maps = buildTicketExportEnrichmentMaps([], [], []);
    maps.slaByTicketId = buildSlaMapsFromClientRows(
      (slaData ?? []).map((s) => ({
        ticket_id: s.ticket_id,
        assignment_breached: s.assignment_breached,
        onsite_breached: s.onsite_breached,
        resolution_breached: s.resolution_breached,
      }))
    );

    const rows = [
      headers,
      ...tickets.map((t) => {
        const ticketRow = t as unknown as Record<string, unknown>;
        return [
          t.id,
          t.issue_type || t.category || t.ticket_number || "",
          t.status,
          t.client_slug ?? "",
          t.created_at ?? "",
          t.updated_at ?? "",
          breachedSet.has(t.id) ? "breached" : "compliant",
          t.organisation_id ?? "",
          t.ticket_number ?? "",
          t.complaint_id ?? "",
          t.vehicle_number ?? "",
          t.issue_type ?? "",
          t.state ?? "",
          t.location ?? "",
          t.opened_at ?? "",
          ...getAppendedTicketExportValues(ticketRow, maps),
        ];
      }),
    ];
    createCSVDownload(rows, getReportFilename("ticket-summary", orgNameOrSlug));
  };

  const onMonthlySla = () => {
    const monthMap: Record<string, { total: number; breached: number }> = {};
    for (const t of tickets) {
      const created = t.created_at ? new Date(t.created_at) : new Date();
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap[key]) monthMap[key] = { total: 0, breached: 0 };
      monthMap[key].total++;
      if (breachedSet.has(t.id)) monthMap[key].breached++;
    }
    const sortedMonths = Object.keys(monthMap).sort();
    const rows = [
      ["Month", "Total Tickets", "Breached", "Compliant"],
      ...sortedMonths.map((m) => {
        const v = monthMap[m];
        return [m, v.total, v.breached, v.total - v.breached];
      }),
    ];
    createCSVDownload(rows, getReportFilename("monthly-sla", orgNameOrSlug));
  };

  const onResolutionReport = () => {
    const resolved = tickets.filter((t) => t.status === "RESOLVED");
    const baseHeaders = ["ticket_id", "summary", "assigned_fe", "resolved_at", "time_to_resolution", "proof"];
    const appendedIdentity = ["ticket_number", "complaint_id", "vehicle_number", "state"];
    const headers = [...baseHeaders, ...appendedIdentity, ...TICKET_EXPORT_APPENDED_HEADERS];

    const maps = buildTicketExportEnrichmentMaps([], [], []);
    maps.slaByTicketId = buildSlaMapsFromClientRows(
      (slaData ?? []).map((s) => ({
        ticket_id: s.ticket_id,
        assignment_breached: s.assignment_breached,
        onsite_breached: s.onsite_breached,
        resolution_breached: s.resolution_breached,
      }))
    );

    const rows = [
      headers,
      ...resolved.map((t) => {
        const ticketRow = t as unknown as Record<string, unknown>;
        const resolvedAt = (t as TicketType & { resolved_at?: string }).resolved_at ?? t.updated_at ?? "";
        const timeToResolution = resolutionTimeHours(ticketRow);
        return [
          t.id,
          t.issue_type || t.category || t.ticket_number || "",
          "",
          resolvedAt,
          timeToResolution,
          "",
          t.ticket_number ?? "",
          t.complaint_id ?? "",
          t.vehicle_number ?? "",
          t.state ?? "",
          ...getAppendedTicketExportValues(ticketRow, maps),
        ];
      }),
    ];
    createCSVDownload(rows, getReportFilename("resolution-report", orgNameOrSlug));
  };

  const handleDownload = (id: "ticket-summary" | "monthly-sla" | "resolution") => {
    if (id === "ticket-summary") onTicketSummary();
    else if (id === "monthly-sla") onMonthlySla();
    else onResolutionReport();
  };

  return (
    <section className="relative py-10 overflow-hidden">
      <div className="relative z-10 w-full md:mx-auto md:max-w-7xl px-3 md:px-6">
        <h2 className={`mb-4 ${clientSectionTitleClass}`}>Reports & Documentation</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {REPORTS.map((r) => (
            <button
              key={r.title}
              type="button"
              onClick={() => handleDownload(r.id)}
              className="group flex flex-col rounded-xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_hsl(285_25%_10%/0.08)]"
              style={clientElevatedCardStyle}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-primary" style={{ background: "hsl(285 45% 30% / 0.06)" }}>
                <r.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{r.title}</h3>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{r.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"> <Download className="h-3.5 w-3.5" /> Download </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── Support Section ─────────────────────────────────────────────────────────

const SupportSection = () => (
  <section className="py-8">
    <div className="w-full md:mx-auto md:max-w-7xl px-3 md:px-6">
      <div
        className="rounded-2xl p-6 md:flex md:items-center md:justify-between transition-shadow duration-200 hover:shadow-[0_4px_20px_hsl(285_25%_10%/0.08)]"
        style={clientElevatedCardStyle}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl text-primary shrink-0" style={{ background: "hsl(285 45% 30% / 0.06)" }}>
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Need Assistance?</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">If you have questions regarding your service requests or SLA performance, contact our support team.</p>
          </div>
        </div>
        <a href="mailto:support@pariskq.com" className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-foreground transition-all duration-200 hover:-translate-y-px md:mt-0" style={{ border: "1px solid hsl(270 15% 88%)", boxShadow: "0 1px 3px hsl(285 25% 10% / 0.04)" }}>
          <ExternalLink className="h-4 w-4" />
          Contact Support
        </a>
      </div>
    </div>
  </section>
);

// ─── Footer (exported for ClientReportsPage) ───────────────────────────────────

export const DashboardFooter = () => (
  <footer className="py-5" style={{ borderTop: "1px solid hsl(270 15% 88% / 0.5)" }}>
    <div className="w-full md:mx-auto flex md:max-w-7xl flex-col items-center justify-between gap-2 px-3 md:px-6 text-xs text-muted-foreground sm:flex-row">
      <span>© 2026 Pariskq. All rights reserved.</span>
      <span className="font-medium" style={{ letterSpacing: "0.08em" }}>Precision Meets Perfection</span>
    </div>
  </footer>
);

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ClientDashboard() {
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(1);
  const { userProfile } = useAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats({
    clientSlug: userProfile?.client_slug ?? null,
  });
  const { data: ticketsRaw = [], isLoading: ticketsLoading } = useTickets({
    status: "all",
    clientSlug: userProfile?.client_slug ?? undefined,
  });

  const ticketIds = useMemo(() => ticketsRaw.map((t) => t.id), [ticketsRaw]);
  const { data: rowExtra = {} } = useTicketListSupplement(ticketIds);

  const filteredTickets = useMemo(() => {
    const term = debouncedSearch.trim();
    if (!term) return ticketsRaw;
    return ticketsRaw.filter((t) =>
      ticketMatchesClientPortalSearch(t, term, {
        assignedFeName: rowExtra[t.id]?.assignedFeName ?? null,
        statusLabels: STATUS_LABELS,
      })
    );
  }, [ticketsRaw, debouncedSearch, rowExtra]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / CLIENT_TICKETS_PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedTickets = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * CLIENT_TICKETS_PAGE_SIZE;
    return filteredTickets.slice(start, start + CLIENT_TICKETS_PAGE_SIZE);
  }, [filteredTickets, page, totalPages]);

  const ticketIdsForSla = React.useMemo(() => ticketsRaw.map((t) => t.id), [ticketsRaw]);
  const { data: slaData } = useQuery({
    queryKey: ["sla-tracking", ticketIdsForSla.join(",")],
    enabled: ticketIdsForSla.length > 0,
    queryFn: async () => {
      const res = await fetchJson<{ items: SlaRow[] }>("/data/sla/by-ticket-ids", {
        method: "POST",
        body: { ticketIds: ticketIdsForSla },
      });
      return res.items ?? [];
    },
  });

  const clientDisplayName = userProfile?.name?.trim() || "Guest";
  const reportOrgSlug = userProfile?.client_slug ?? "client";

  return (
    <>
      <ClientPortalBackground>
          <WelcomeSection clientDisplayName={clientDisplayName} stats={stats} loading={statsLoading} />
          <GradientDivider />
          <section className="pb-6 md:pb-8">
            <div className="w-full md:mx-auto md:max-w-7xl px-3 md:px-6">
              <h2 className={`mb-4 ${clientSectionTitleClass}`}>Service Overview</h2>
              <StatGrid>
                <MetricCard
                  label="Active Tickets"
                  value={statsLoading ? "—" : stats?.openTickets ?? 0}
                  description="Currently in progress"
                  icon={Ticket}
                  variant="primary"
                />
                <MetricCard
                  label="Resolved"
                  value={statsLoading ? "—" : (stats?.totalTickets ?? 0) - (stats?.openTickets ?? 0)}
                  description="Successfully completed"
                  icon={CheckCircle2}
                />
                <MetricCard
                  label="SLA Compliance"
                  value={(stats?.totalTickets ?? 0) > 0 ? ((stats?.slaBreaches ?? 0) === 0 ? "On track" : "Alert") : "—"}
                  description="Phase-based tracking"
                  icon={Clock}
                  variant="accent"
                />
                <MetricCard
                  label="Total Requests"
                  value={statsLoading ? "—" : stats?.totalTickets ?? 0}
                  description="All time"
                  icon={BarChart3}
                />
              </StatGrid>
            </div>
          </section>
          <GradientDivider />
          <ClientTicketsTable
            tickets={paginatedTickets}
            loading={ticketsLoading}
            organisationId={userProfile?.organisation_id}
            searchInput={searchInput}
            onSearchChange={setSearchInput}
            page={page}
            totalPages={totalPages}
            totalCount={filteredTickets.length}
            onPageChange={setPage}
          />
          <GradientDivider />
          <ReportsSection tickets={ticketsRaw} stats={stats ?? null} slaData={slaData} orgNameOrSlug={reportOrgSlug} />
          <GradientDivider />
          <SupportSection />
          <DashboardFooter />
      </ClientPortalBackground>
      <TicketDetailDrawer
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        organisationId={userProfile?.organisation_id}
      />
    </>
  );
}
