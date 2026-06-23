import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import { useTickets } from "@/hooks/useTickets";
import { deriveDashboardStatsFromTickets, fetchBreachedTicketIds } from "@/lib/tenantTicketsSupabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DataTableShell,
  MetricCard,
  PageHeader,
  StatGrid,
  dataTableHeadClassName,
  typography,
} from "@/components/common";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/tickets/StatusBadge";
import { Ticket as TicketIcon, Gauge, ArrowLeft } from "lucide-react";
import { formatIST } from "@/lib/dateUtils";
import { Ticket } from "@/lib/types";
import { TicketNumberDisplay } from "@/components/common/TicketNumberDisplay";

function slugToDisplayName(slug: string): string {
  const trimmed = String(slug).trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export default function SuperAdminOrgView() {
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const slug = clientSlug?.trim() ?? "";

  const { data: tickets = [], isLoading: ticketsLoading } = useTickets({
    clientSlug: slug || undefined,
    status: "all",
  });

  const ticketIds = useMemo(() => tickets.map((t) => t.id).filter(Boolean), [tickets]);

  const { data: breachedTicketIdList = [], isFetching: breachFetching } = useQuery({
    queryKey: ["super-admin-org-sla", slug, ticketIds.length],
    enabled: Boolean(slug && ticketIds.length > 0),
    queryFn: async () => Array.from(await fetchBreachedTicketIds(ticketIds)),
  });

  const breachSet = useMemo(() => new Set(breachedTicketIdList), [breachedTicketIdList]);
  const slaBreachesInScope = useMemo(
    () => tickets.reduce((n, t) => n + (breachSet.has(t.id) ? 1 : 0), 0),
    [tickets, breachSet]
  );

  const stats = useMemo(
    () => deriveDashboardStatsFromTickets(tickets, slaBreachesInScope),
    [tickets, slaBreachesInScope]
  );

  const statsLoading = ticketsLoading || (ticketIds.length > 0 && breachFetching);

  const onSiteCount = tickets.filter((t) => t.status === "ON_SITE").length;
  const pendingVerifyCount = tickets.filter(
    (t) => t.status === "RESOLVED_PENDING_VERIFICATION"
  ).length;
  const resolvedCount = tickets.filter((t) => t.status === "RESOLVED").length;

  const totalTickets = stats.totalTickets;
  const slaBreaches = stats.slaBreaches;

  if (!slug) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <div className="space-y-4">
            <Link
              to="/super-admin"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Super Admin
            </Link>
            <p className="text-muted-foreground">Tenant not specified.</p>
          </div>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  const displayName = slugToDisplayName(slug);

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Link
              to="/super-admin"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Super Admin
            </Link>
          </div>

          <PageHeader
            title={displayName}
            description={`Tenant: ${slug}`}
          />

          <StatGrid columns={3}>
            <MetricCard label="Total" value={statsLoading ? "—" : stats.totalTickets} icon={TicketIcon} />
            <MetricCard label="Open" value={statsLoading ? "—" : stats.openTickets} />
            <MetricCard label="ON_SITE" value={ticketsLoading ? "—" : onSiteCount} />
            <MetricCard label="Pending Verify" value={ticketsLoading ? "—" : pendingVerifyCount} />
            <MetricCard label="Resolved" value={ticketsLoading ? "—" : resolvedCount} />
            <MetricCard
              label="SLA"
              value={totalTickets > 0 ? (slaBreaches === 0 ? "On track" : "Alert") : "—"}
              description={totalTickets > 0 ? `${slaBreaches} breached` : "No tickets"}
              icon={Gauge}
            />
          </StatGrid>

          <Card>
            <CardHeader>
              <CardTitle>Tickets</CardTitle>
              <p className={typography.body}>
                All tickets for this tenant
              </p>
            </CardHeader>
            <CardContent>
              {ticketsLoading ? (
                <p className={typography.body}>Loading…</p>
              ) : tickets.length === 0 ? (
                <p className={typography.body}>No tickets.</p>
              ) : (
                <DataTableShell aria-label="Tenant tickets">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={dataTableHeadClassName}>Ticket</TableHead>
                          <TableHead className={dataTableHeadClassName}>Summary</TableHead>
                          <TableHead className={dataTableHeadClassName}>Status</TableHead>
                          <TableHead className={dataTableHeadClassName}>Updated</TableHead>
                          <TableHead className={`${dataTableHeadClassName} w-[80px]`} />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(tickets as Ticket[]).map((t) => (
                          <TableRow key={t.id}>
                            <TableCell>
                              <TicketNumberDisplay
                                ticketNumber={t.ticket_number}
                                organisationId={t.organisation_id}
                                variant="default"
                              />
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">
                              {t.issue_type || t.category || "—"}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={t.status} />
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatIST(t.updated_at, "yyyy-MM-dd")}
                            </TableCell>
                            <TableCell>
                              <Link
                                to={`/app/tickets/${t.id}`}
                                className="text-sm text-primary hover:underline"
                              >
                                View
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </DataTableShell>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </AppLayoutNew>
  );
}
