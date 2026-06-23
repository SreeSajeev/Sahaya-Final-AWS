import { Link } from "react-router-dom";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOrganisationsTable } from "@/hooks/useOrganisationsTable";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Ticket,
  Users,
  Truck,
  UserCheck,
  ChevronRight,
} from "lucide-react";
import { Organisation } from "@/lib/types";
import { fetchJson } from "@/lib/backendDataApi";

/**
 * Platform Overview — Super Admin only.
 * Aggregates: orgs, tickets, open tickets, FEs, users, distinct clients.
 * Uses existing Supabase queries; no new schema.
 */
export default function PlatformOverview() {
  const { data: organisations = [], isLoading: orgsLoading } = useOrganisationsTable();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ["platform-counts"],
    queryFn: async () => {
      return await fetchJson<{ totalUsers: number; totalFEs: number; distinctClients: number }>(`/data/platform/overview`);
    },
  });

  const { data: perOrgStats, isLoading: perOrgLoading } = useQuery({
    queryKey: ["platform-per-org-stats", organisations.length],
    enabled: organisations.length > 0,
    queryFn: async () => {
      const res = await fetchJson<{ items: Record<string, { totalTickets: number; openTickets: number; feCount: number; userCount: number; distinctClients: number; slaBreached: number }> }>(
        `/data/organisations/stats`
      );
      return res.items ?? {};
    },
  });

  const isLoading = statsLoading || countsLoading;
  const statCards = [
    {
      title: "Total Tenants",
      value: orgsLoading ? "—" : organisations.length,
      icon: Building2,
      sub: "SaaS tenants",
    },
    {
      title: "Total Tickets",
      value: statsLoading ? "—" : stats?.totalTickets ?? 0,
      icon: Ticket,
      sub: "All time",
    },
    {
      title: "Open Tickets",
      value: statsLoading ? "—" : stats?.openTickets ?? 0,
      icon: Ticket,
      sub: "Awaiting action",
    },
    {
      title: "Field Executives",
      value: countsLoading ? "—" : counts?.totalFEs ?? 0,
      icon: Truck,
      sub: "Across platform",
    },
    {
      title: "Total Users",
      value: countsLoading ? "—" : counts?.totalUsers ?? 0,
      icon: Users,
      sub: "All roles",
    },
    {
      title: "Active Clients",
      value: countsLoading ? "—" : counts?.distinctClients ?? 0,
      icon: UserCheck,
      sub: "Distinct client short names",
    },
  ];

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-8">
          <PageHeader
            title="Platform Overview"
            description="Multi-tenant SaaS control panel"
          />

          <StatGrid className="grid-cols-2 md:grid-cols-4" columns={4}>
            {statCards.map((item) => (
              <MetricCard
                key={item.title}
                label={item.title}
                value={item.value}
                description={item.sub}
                icon={item.icon}
              />
            ))}
          </StatGrid>

          <Card>
            <CardHeader>
              <CardTitle>Tenants</CardTitle>
              <p className={typography.body}>
                Tenant list with key metrics. Click a row to open tenant view.
              </p>
            </CardHeader>
            <CardContent>
              {orgsLoading || perOrgLoading ? (
                <p className={typography.body}>Loading…</p>
              ) : organisations.length === 0 ? (
                <p className={typography.body}>No tenants yet.</p>
              ) : (
                <DataTableShell aria-label="Platform tenants">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={dataTableHeadClassName}>Name</TableHead>
                          <TableHead className={dataTableHeadClassName}>Status</TableHead>
                          <TableHead className={`${dataTableHeadClassName} text-right`}>Tickets</TableHead>
                          <TableHead className={`${dataTableHeadClassName} text-right`}>Open</TableHead>
                          <TableHead className={`${dataTableHeadClassName} text-right`}>FEs</TableHead>
                          <TableHead className={`${dataTableHeadClassName} text-right`}>Users</TableHead>
                          <TableHead className={`${dataTableHeadClassName} text-right`}>Clients</TableHead>
                          <TableHead className={`${dataTableHeadClassName} w-[80px]`} />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(organisations as Organisation[]).map((org) => {
                          const s = perOrgStats?.[org.id];
                          return (
                            <TableRow key={org.id} className="cursor-pointer hover:bg-muted/50">
                              <TableCell className="font-medium">{org.name}</TableCell>
                              <TableCell>
                                <Badge variant={org.status === "active" ? "default" : "secondary"}>
                                  {org.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{s?.totalTickets ?? "—"}</TableCell>
                              <TableCell className="text-right">{s?.openTickets ?? "—"}</TableCell>
                              <TableCell className="text-right">{s?.feCount ?? "—"}</TableCell>
                              <TableCell className="text-right">{s?.userCount ?? "—"}</TableCell>
                              <TableCell className="text-right">{s?.distinctClients ?? "—"}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" asChild>
                                  <Link to={`/app/tenant/${encodeURIComponent(org.id)}`}>
                                    View <ChevronRight className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
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
