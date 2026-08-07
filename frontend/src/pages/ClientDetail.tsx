import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  DataTableEmptyState,
  DataTableShell,
  dataTableHeadClassName,
  DEFAULT_TABLE_LOADING_LABEL,
  PageHeader,
  typography,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { fetchJson } from "@/lib/backendDataApi";
import { createPortalUser } from "@/lib/createPortalUser";
import { formatIST } from "@/lib/dateUtils";
import { normalizeOrgSlug } from "@/lib/tenantTicketsSupabase";
import type { TenantClient, User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { ClientVehiclesPanel } from "@/components/clients/ClientVehiclesPanel";
import { ArrowLeft, Briefcase, Plus, RefreshCw, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTenantClientsEnabled } from "@/lib/tenantClientsFeature";

function portalUserStatusLabel(u: User): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (u.approval_status === "pending") {
    return { label: "Pending approval", variant: "secondary" };
  }
  if (u.approval_status === "rejected") {
    return { label: "Rejected", variant: "destructive" };
  }
  const active = u.is_active !== false && u.active !== false;
  return active
    ? { label: "Active", variant: "default" }
    : { label: "Inactive", variant: "secondary" };
}

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const { userProfile, signUp } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  const isSuperAdmin = userProfile?.role === "SUPER_ADMIN";
  const isTenantAdmin = userProfile?.role === "ADMIN";
  const allowed = isSuperAdmin || isTenantAdmin;
  const featureOn = isTenantClientsEnabled();

  const {
    data: client,
    isLoading: clientLoading,
    isError: clientError,
    error: clientErr,
  } = useQuery({
    queryKey: ["tenant-client", clientId],
    enabled: Boolean(clientId && featureOn && allowed),
    queryFn: async () => {
      return await fetchJson<TenantClient>(`/data/clients/${encodeURIComponent(clientId!)}`);
    },
  });

  const portalUsersQueryKey = useMemo(
    () => ["portal-users", client?.organisation_id, client?.slug] as const,
    [client?.organisation_id, client?.slug]
  );

  const {
    data: portalUsers = [],
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: portalUsersQueryKey,
    enabled: Boolean(client?.organisation_id && client?.slug),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      params.set("offset", "0");
      params.set("organisationId", client!.organisation_id);
      params.set("role", "CLIENT");
      const res = await fetchJson<{ items: User[] }>(`/data/users?${params.toString()}`);
      const slugKey = normalizeOrgSlug(client!.slug);
      return (res.items ?? []).filter(
        (u) => u.role === "CLIENT" && normalizeOrgSlug(u.client_slug) === slugKey
      );
    },
  });

  const handleAddPortalUser = async () => {
    if (!client) return;
    if (!addName.trim() || !addEmail.trim() || !addPassword) {
      toast({ variant: "destructive", title: "Name, email, and password are required" });
      return;
    }
    setAddSubmitting(true);
    try {
      const { error } = await createPortalUser(signUp, {
        name: addName,
        email: addEmail,
        password: addPassword,
        organisationId: client.organisation_id,
        clientSlug: client.slug,
      });
      if (error) {
        toast({ variant: "destructive", title: "Could not create portal user", description: error.message });
        return;
      }
      toast({
        title: "Portal user created",
        description: "They can sign in at /login with the email and password you set.",
      });
      setAddOpen(false);
      setAddName("");
      setAddEmail("");
      setAddPassword("");
      await queryClient.invalidateQueries({ queryKey: portalUsersQueryKey });
      refetchUsers();
    } finally {
      setAddSubmitting(false);
    }
  };

  if (!featureOn || !allowed) {
    return <Navigate to="/app" replace />;
  }

  if (!clientId) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <p className="text-muted-foreground">Missing client.</p>
          <Button variant="link" asChild className="mt-2 px-0">
            <Link to="/app/clients">Back to Clients</Link>
          </Button>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  if (clientLoading) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <div className="flex h-40 items-center justify-center text-muted-foreground">Loading client…</div>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  if (clientError || !client) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <p className="text-destructive">
            {clientErr instanceof Error ? clientErr.message : "Client not found"}
          </p>
          <Button variant="link" asChild className="mt-2 px-0">
            <Link to="/app/clients">Back to Clients</Link>
          </Button>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title={client.name}
            description={`Client short name: ${client.slug}`}
            icon={Briefcase}
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/clients">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Clients
                </Link>
              </Button>
            }
          />

          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
              <TabsTrigger value="portal-users">Portal Users</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Client information</CardTitle>
                  <CardDescription>Registry record used for tickets and portal access.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
                    <p className="mt-1 text-sm font-medium">{client.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Short Name</p>
                    <p className="mt-1 font-mono text-sm">{client.slug}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact Name</p>
                    <p className="mt-1 text-sm">{client.contact_name?.trim() || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact Email</p>
                    <p className="mt-1 text-sm">{client.contact_email?.trim() || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                    <Badge className="mt-1" variant={client.status === "active" ? "default" : "secondary"}>
                      {client.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vehicles" className="mt-4">
              <ClientVehiclesPanel
                clientId={client.id}
                clientName={client.name}
                canWrite={isSuperAdmin || isTenantAdmin}
              />
            </TabsContent>

            <TabsContent value="portal-users" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Portal users</h2>
                  <p className="text-sm text-muted-foreground">
                    Login accounts for this client&apos;s portal ({client.slug}).
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => refetchUsers()} disabled={usersLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${usersLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add User
                  </Button>
                </div>
              </div>

              <DataTableShell
                aria-label="Client portal users"
                loading={usersLoading}
                loadingLabel={DEFAULT_TABLE_LOADING_LABEL}
                emptyState={
                  !usersLoading && portalUsers.length === 0 ? (
                    <DataTableEmptyState
                      title="No portal users yet"
                      description="Add one to grant this client portal access."
                    />
                  ) : undefined
                }
              >
                {!usersLoading && portalUsers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={dataTableHeadClassName}>Name</TableHead>
                          <TableHead className={dataTableHeadClassName}>Email</TableHead>
                          <TableHead className={dataTableHeadClassName}>Status</TableHead>
                          <TableHead className={dataTableHeadClassName}>Created At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {portalUsers.map((u) => {
                          const status = portalUserStatusLabel(u);
                          return (
                            <TableRow key={u.id}>
                              <TableCell className={cn(typography.body, "font-medium")}>{u.name?.trim() || "—"}</TableCell>
                              <TableCell className={typography.meta}>{u.email}</TableCell>
                              <TableCell>
                                <Badge variant={status.variant}>{status.label}</Badge>
                              </TableCell>
                              <TableCell className={typography.meta}>
                                {u.created_at ? formatIST(u.created_at, "MMM d, yyyy") : "—"}
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
          </Tabs>
        </div>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add portal user
              </DialogTitle>
              <DialogDescription>
                Creates a client login for <span className="font-medium text-foreground">{client.name}</span>.
                Role, tenant, and short name are set automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="portal-user-name">Name</Label>
                <Input
                  id="portal-user-name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Full name"
                  autoComplete="name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="portal-user-email">Email</Label>
                <Input
                  id="portal-user-email"
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="email@example.com"
                  autoComplete="email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="portal-user-password">Password</Label>
                <Input
                  id="portal-user-password"
                  type="password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  At least 8 characters with uppercase, lowercase, a number, and a special character.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleAddPortalUser}
                disabled={addSubmitting || !addName.trim() || !addEmail.trim() || !addPassword}
              >
                {addSubmitting ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </AppLayoutNew>
  );
}
