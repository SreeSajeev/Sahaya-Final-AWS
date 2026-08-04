import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DataTableShell,
  FilterBar,
  MetricCard,
  PageHeader,
  StatGrid,
  dataTableHeadClassName,
  typography,
} from "@/components/common";
import {
  TicketsTable,
  TicketsTableEmptyState,
  TICKETS_TABLE_LOADING_LABEL,
} from "@/components/tickets/TicketsTable";
import { EditOrganisationModal } from "@/components/organisations/EditOrganisationModal";
import { useFieldExecutivesWithStats } from "@/hooks/useFieldExecutives";
import { FECard } from "@/components/field-executives/FECard";
import { fetchJson } from "@/lib/backendDataApi";
import { createAdminUser } from "@/lib/createAdminUser";
import {
  fetchOrganisationById,
  fetchTicketsByOrganisationId,
  fetchBreachedTicketIds,
  deriveDashboardStatsFromTickets,
  distinctClientSlugsFromTickets,
  clientStatsFromTickets,
  normalizeOrgSlug,
} from "@/lib/tenantTicketsSupabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  UserCheck,
  ArrowLeft,
  Plus,
  Pencil,
} from "lucide-react";
import { User, UserRole } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTenantTerminology } from "@/hooks/useTenantTerminology";
import { sortTicketList, type TicketSortDir, type TicketSortKey } from "@/lib/ticketListSort";
import { Label } from "@/components/ui/label";

const ROLE_LABELS: Record<UserRole, string> = {
  STAFF: "Service Manager",
  ADMIN: "Admin",
  FIELD_EXECUTIVE: "Field Executive",
  CLIENT: "Client",
  SUPER_ADMIN: "Super Admin",
};

/**
 * Tenant view — Super Admin only.
 * Tickets and ticket metrics are scoped by matching `tickets.client_slug` to the organisation slug.
 */
const ADD_USER_ROLES: UserRole[] = ["ADMIN", "STAFF", "FIELD_EXECUTIVE", "CLIENT"];

export default function TenantView() {
  const { orgId } = useParams<{ orgId: string }>();
  const terminology = useTenantTerminology(orgId ?? null);
  const roleLabels = useMemo(
    () => ({
      ...ROLE_LABELS,
      FIELD_EXECUTIVE: terminology.fieldExecutiveLabel,
    }),
    [terminology.fieldExecutiveLabel]
  );
  const queryClient = useQueryClient();
  const { session, signUp } = useAuth();
  const { toast } = useToast();
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [ticketSortBy, setTicketSortBy] = useState<TicketSortKey>("created_at");
  const [ticketSortDir, setTicketSortDir] = useState<TicketSortDir>("desc");
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserName, setAddUserName] = useState("");
  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserPassword, setAddUserPassword] = useState("");
  const [addUserRole, setAddUserRole] = useState<UserRole>("STAFF");
  const [addUserActive, setAddUserActive] = useState(true);
  const [addUserSubmitting, setAddUserSubmitting] = useState(false);
  const [editOrgOpen, setEditOrgOpen] = useState(false);

  const { data: org, isLoading: orgLoading } = useQuery({
    queryKey: ["organisation", orgId],
    enabled: Boolean(orgId && session?.access_token),
    queryFn: async () => {
      const row = await fetchOrganisationById(orgId!);
      if (!row) throw new Error("Tenant not found");
      return row;
    },
  });

  const {
    data: tenantTicketsRaw = [],
    isLoading: ticketsLoading,
    isError: ticketsError,
    error: ticketsQueryError,
  } = useQuery({
    queryKey: ["tenant-tickets", orgId],
    enabled: Boolean(orgId && session?.access_token),
    queryFn: async () => fetchTicketsByOrganisationId(orgId!),
  });

  const tenantTickets = tenantTicketsRaw;

  const ticketIds = useMemo(() => tenantTickets.map((t) => t.id).filter(Boolean), [tenantTickets]);

  const { data: breachedTicketIdList = [], isFetching: breachFetching } = useQuery({
    queryKey: ["tenant-ticket-sla-breaches", org?.slug, ticketIds.length],
    enabled: Boolean(org?.slug && session?.access_token) && ticketIds.length > 0,
    queryFn: async () => Array.from(await fetchBreachedTicketIds(ticketIds)),
  });

  const breachSet = useMemo(() => new Set(breachedTicketIdList), [breachedTicketIdList]);

  const slaBreachesInScope = useMemo(
    () => tenantTickets.reduce((n, t) => n + (breachSet.has(t.id) ? 1 : 0), 0),
    [tenantTickets, breachSet]
  );

  const stats = useMemo(
    () => deriveDashboardStatsFromTickets(tenantTickets, slaBreachesInScope),
    [tenantTickets, slaBreachesInScope]
  );

  const statsLoading = ticketsLoading || (ticketIds.length > 0 && breachFetching);

  const clientSlugs = useMemo(() => distinctClientSlugsFromTickets(tenantTickets), [tenantTickets]);
  const clientStats = useMemo(() => clientStatsFromTickets(tenantTickets), [tenantTickets]);

  const filteredTickets = useMemo(() => {
    if (!clientFilter) return tenantTickets;
    const target = normalizeOrgSlug(clientFilter);
    return tenantTickets.filter((t) => normalizeOrgSlug(t.client_slug) === target);
  }, [tenantTickets, clientFilter]);

  const sortedFilteredTickets = useMemo(
    () => sortTicketList(filteredTickets, ticketSortBy, ticketSortDir),
    [filteredTickets, ticketSortBy, ticketSortDir]
  );

  const { data: executives, isLoading: feLoading } = useFieldExecutivesWithStats(orgId ?? undefined);

  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ["users-tenant", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      params.set("offset", "0");
      params.set("organisationId", orgId!);
      const res = await fetchJson<{ items: User[] }>(`/data/users?${params.toString()}`);
      return res.items ?? [];
    },
  });

  const updateUserStatus = async (userId: string, isActive: boolean) => {
    if (!session?.access_token) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }
    setStatusPendingId(userId);
    try {
      await fetchJson(`/admin/users/${userId}/status`, {
        method: "PATCH",
        body: { is_active: isActive },
      });
      toast({ title: isActive ? "User activated" : "User deactivated" });
      refetchUsers();
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setStatusPendingId(null);
    }
  };

  const updateUserRole = async (userId: string, role: UserRole) => {
    if (!session?.access_token) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }
    try {
      await fetchJson(`/admin/users/${userId}/role`, {
        method: "PATCH",
        body: { role },
      });
      toast({ title: "Role updated" });
      refetchUsers();
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    }
  };

  if (!orgId) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <p className="text-muted-foreground">Missing tenant.</p>
          <Button variant="link" asChild><Link to="/app/organisations">Back to Tenants</Link></Button>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  if (orgLoading || !org) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <p className="text-muted-foreground">Loading tenant…</p>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/organisations" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back to Tenants
              </Link>
            </Button>
          </div>

          <PageHeader
            title={org.name}
            description={org.slug}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={org.status === "active" ? "default" : "secondary"}>
                  {org.status}
                </Badge>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditOrgOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Tenant
                </Button>
              </div>
            }
          />

          <StatGrid>
            <MetricCard
              label="Tickets"
              value={statsLoading ? "—" : stats?.totalTickets ?? 0}
            />
            <MetricCard
              label="Open"
              value={statsLoading ? "—" : stats?.openTickets ?? 0}
            />
            <MetricCard
              label="Field Executives"
              value={feLoading ? "—" : (executives?.length ?? 0)}
            />
            <MetricCard label="Users" value={users.length} />
          </StatGrid>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="tickets">Tickets</TabsTrigger>
              <TabsTrigger value="fes">{terminology.fieldExecutivesLabel}</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="clients">Clients</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <StatGrid>
                <MetricCard
                  label="Total Tickets"
                  value={statsLoading ? "—" : stats?.totalTickets ?? 0}
                />
                <MetricCard
                  label="Open"
                  value={statsLoading ? "—" : stats?.openTickets ?? 0}
                />
                <MetricCard
                  label="Needs Review"
                  value={statsLoading ? "—" : stats?.needsReviewCount ?? 0}
                />
                <MetricCard
                  label="SLA Breaches"
                  value={
                    statsLoading ? "—" : (stats?.totalTickets ?? 0) > 0 ? (stats?.slaBreaches ?? 0) : "—"
                  }
                />
              </StatGrid>
            </TabsContent>

            <TabsContent value="tickets" className="space-y-4">
              {import.meta.env.DEV && org?.slug && (
                <p className={typography.meta}>
                  Tenant ticket scope: client short name (`client_slug`) ≡ “{normalizeOrgSlug(org.slug)}”
                </p>
              )}
              {ticketsError && (
                <p className={typography.body}>
                  {ticketsQueryError instanceof Error ? ticketsQueryError.message : "Could not load tickets."}
                </p>
              )}
              <FilterBar
                aria-label="Tenant ticket filters"
                secondary={
                  <>
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">Sort by</Label>
                      <Select
                        value={ticketSortBy}
                        onValueChange={(v) => setTicketSortBy(v as TicketSortKey)}
                      >
                        <SelectTrigger className="h-9 w-[140px]" aria-label="Sort tenant tickets by">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="created_at">Created</SelectItem>
                          <SelectItem value="opened_at">Opened</SelectItem>
                          <SelectItem value="client_slug">Client</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">Direction</Label>
                      <Select
                        value={ticketSortDir}
                        onValueChange={(v) => setTicketSortDir(v as TicketSortDir)}
                      >
                        <SelectTrigger className="h-9 w-[120px]" aria-label="Sort direction">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desc">Newest first</SelectItem>
                          <SelectItem value="asc">Oldest first</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                }
              >
                {clientSlugs.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={clientFilter === null ? "default" : "outline"}
                      size="sm"
                      onClick={() => setClientFilter(null)}
                    >
                      All
                    </Button>
                    {clientSlugs.map((slug) => (
                      <Button
                        key={slug}
                        variant={clientFilter === slug ? "default" : "outline"}
                        size="sm"
                        onClick={() => setClientFilter(slug)}
                      >
                        {slug}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </FilterBar>
              <DataTableShell
                aria-label="Tenant tickets"
                loading={ticketsLoading}
                loadingLabel={TICKETS_TABLE_LOADING_LABEL}
                emptyState={
                  !ticketsLoading && sortedFilteredTickets.length === 0 ? (
                    <TicketsTableEmptyState
                      filterEmpty={
                        tenantTickets.length > 0 && clientFilter !== null
                      }
                    />
                  ) : undefined
                }
              >
                {!ticketsLoading && sortedFilteredTickets.length > 0 ? (
                  <TicketsTable tickets={sortedFilteredTickets} />
                ) : null}
              </DataTableShell>
            </TabsContent>

            <TabsContent value="fes" className="space-y-4">
              {feLoading ? (
                <p className={typography.body}>Loading…</p>
              ) : (executives?.length ?? 0) === 0 ? (
                <p className={typography.body}>No field executives in this tenant.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {executives?.map((fe) => (
                    <FECard
                      key={fe.id}
                      executive={fe}
                      onClick={() => {}}
                      onEdit={() => {}}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <p className={typography.body}>Users in this tenant. Add users or change roles and status.</p>
                <Button size="sm" onClick={() => setAddUserOpen(true)} disabled={!orgId}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </div>
              <DataTableShell
                aria-label="Tenant users"
                emptyState={
                  users.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No users in this tenant.</p>
                  ) : undefined
                }
              >
                {users.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={dataTableHeadClassName}>Name</TableHead>
                          <TableHead className={dataTableHeadClassName}>Email</TableHead>
                          <TableHead className={dataTableHeadClassName}>Role</TableHead>
                          <TableHead className={dataTableHeadClassName}>Status</TableHead>
                          <TableHead className={`${dataTableHeadClassName} text-right`}>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => {
                          const active = u.is_active !== false && u.active !== false;
                          return (
                            <TableRow key={u.id}>
                              <TableCell className="font-medium">{u.name}</TableCell>
                              <TableCell>{u.email}</TableCell>
                              <TableCell>
                                <Select
                                  value={u.role}
                                  onValueChange={(v) => updateUserRole(u.id, v as UserRole)}
                                >
                                  <SelectTrigger className="w-[160px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="STAFF">{ROLE_LABELS.STAFF}</SelectItem>
                                    <SelectItem value="ADMIN">{ROLE_LABELS.ADMIN}</SelectItem>
                                    <SelectItem value="FIELD_EXECUTIVE">{ROLE_LABELS.FIELD_EXECUTIVE}</SelectItem>
                                    <SelectItem value="CLIENT">{ROLE_LABELS.CLIENT}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>{active ? "Active" : "Inactive"}</TableCell>
                              <TableCell className="text-right">
                                <Switch
                                  checked={active}
                                  disabled={statusPendingId === u.id}
                                  onCheckedChange={(checked) => updateUserStatus(u.id, !!checked)}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </DataTableShell>
            </TabsContent>

            <TabsContent value="clients" className="space-y-4">
              {!clientStats || Object.keys(clientStats).length === 0 ? (
                <p className={typography.body}>No client data (distinct client short names) for this tenant.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(clientStats).map(([slug, s]) => (
                    <MetricCard
                      key={slug}
                      label={slug === "_unknown" ? "Unknown" : slug}
                      value={`${s.total} tickets`}
                      description={`${s.open} open`}
                      icon={UserCheck}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
              <DialogDescription>
                Create a user in this tenant. They will sign in with the email and password you set.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="add-user-name">Name</Label>
                <Input
                  id="add-user-name"
                  value={addUserName}
                  onChange={(e) => setAddUserName(e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-user-email">Email</Label>
                <Input
                  id="add-user-email"
                  type="email"
                  value={addUserEmail}
                  onChange={(e) => setAddUserEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-user-password">Password</Label>
                <Input
                  id="add-user-password"
                  type="password"
                  value={addUserPassword}
                  onChange={(e) => setAddUserPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={addUserRole} onValueChange={(v) => setAddUserRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADD_USER_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="add-user-active">Active</Label>
                <Switch
                  id="add-user-active"
                  checked={addUserActive}
                  onCheckedChange={setAddUserActive}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddUserOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!addUserName.trim() || !addUserEmail.trim() || !addUserPassword || !orgId || addUserSubmitting}
                onClick={async () => {
                  setAddUserSubmitting(true);
                  try {
                    const { error } = await createAdminUser(signUp, {
                      email: addUserEmail.trim(),
                      password: addUserPassword,
                      name: addUserName.trim(),
                      role: addUserRole,
                      organisationId: orgId ?? null,
                      active: addUserActive,
                    });
                    if (error) {
                      toast({ title: "Failed to add user", description: error.message, variant: "destructive" });
                      return;
                    }
                    queryClient.invalidateQueries({ queryKey: ["users-tenant", orgId] });
                    toast({ title: "User created", description: "They can sign in with the email and password." });
                    setAddUserOpen(false);
                    setAddUserName("");
                    setAddUserEmail("");
                    setAddUserPassword("");
                    setAddUserRole("STAFF");
                    setAddUserActive(true);
                  } finally {
                    setAddUserSubmitting(false);
                  }
                }}
              >
                {addUserSubmitting ? "Creating…" : "Add User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <EditOrganisationModal
          open={editOrgOpen}
          onOpenChange={setEditOrgOpen}
          organisation={org}
        />
      </PageContainer>
    </AppLayoutNew>
  );
}
