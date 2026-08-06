import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useOrganisationsTable, useCreateOrganisation } from "@/hooks/useOrganisationsTable";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Ticket,
  Gauge,
  Users,
  Building2,
  Shield,
  RefreshCw,
  BarChart3,
  UserPlus,
  Plus,
} from "lucide-react";
import { User, UserRole } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { fetchJson } from "@/lib/backendDataApi";
import { createAdminUser } from "@/lib/createAdminUser";
import { OrganisationEmailArraysEditor } from "@/components/organisations/OrganisationEmailArraysEditor";
import {
  DataTableShell,
  MetricCard,
  PageHeader,
  StatGrid,
  dataTableHeadClassName,
  typography,
} from "@/components/common";

const ROLES_FOR_ORG: UserRole[] = ["ADMIN", "STAFF", "FIELD_EXECUTIVE", "CLIENT"];
const ROLE_DISPLAY_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  STAFF: "Service Manager",
  FIELD_EXECUTIVE: "Field Executive",
  CLIENT: "Client",
  SUPER_ADMIN: "Super Admin",
};

export default function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState("organizations");
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { signUp } = useAuth();

  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [createOrgName, setCreateOrgName] = useState("");
  const [createOrgSlug, setCreateOrgSlug] = useState("");
  const [createOrgShortName, setCreateOrgShortName] = useState("");
  const [createOrgIncomingEmails, setCreateOrgIncomingEmails] = useState<string[]>([""]);
  const [createOrgOutgoingEmails, setCreateOrgOutgoingEmails] = useState<string[]>([""]);

  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserName, setAddUserName] = useState("");
  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserPassword, setAddUserPassword] = useState("");
  const [addUserRole, setAddUserRole] = useState<UserRole>("STAFF");
  const [addUserOrgId, setAddUserOrgId] = useState<string>("");
  const [addUserSubmitting, setAddUserSubmitting] = useState(false);

  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [createAdminName, setCreateAdminName] = useState("");
  const [createAdminEmail, setCreateAdminEmail] = useState("");
  const [createAdminPassword, setCreateAdminPassword] = useState("");
  const [createAdminOrgId, setCreateAdminOrgId] = useState<string>("");
  const [createAdminSubmitting, setCreateAdminSubmitting] = useState(false);

  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: organisations = [], isLoading: orgsLoading } = useOrganisationsTable();
  const createOrgMutation = useCreateOrganisation();

  const { data: slaCount } = useQuery({
    queryKey: ["sla-tracking-count"],
    queryFn: async () => {
      const res = await fetchJson<{ count: number }>(`/data/sla/tracked-count`);
      return res.count ?? 0;
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetchJson<{ items: User[] }>(`/data/users?limit=1000&offset=0`);
      return (res.items ?? []) as User[];
    },
  });

  const totalSla = slaCount ?? 0;
  const slaBreaches = stats?.slaBreaches ?? 0;
  const slaCompliancePct =
    totalSla > 0
      ? (((totalSla - slaBreaches) / totalSla) * 100).toFixed(1)
      : "—";
  const activeUsers = users?.filter((u) => u.active).length ?? 0;

  return (
    <AppLayoutNew>
      <PageContainer>
      <div className="space-y-8">
        <PageHeader
          title="Super Admin"
          description="Global overview and SaaS management"
          icon={Shield}
        />

        {/* Top cards */}
        <StatGrid>
          <MetricCard
            label="Total Tickets"
            value={statsLoading ? "—" : stats?.totalTickets ?? 0}
            description="All time"
            icon={Ticket}
          />
          <MetricCard
            label="SLA Compliance"
            value={totalSla > 0 ? `${slaCompliancePct}%` : "—"}
            description={totalSla > 0 ? `${totalSla} tracked · ${slaBreaches} breached` : "No tickets tracked"}
            icon={Gauge}
          />
          <MetricCard
            label="Active Users"
            value={usersLoading ? "—" : activeUsers}
            description={`${users?.length ?? 0} total users`}
            icon={Users}
          />
          <MetricCard
            label="Tenants"
            value={orgsLoading ? "—" : organisations.length}
            description="SaaS tenants"
            icon={Building2}
          />
        </StatGrid>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="organizations">Tenants</TabsTrigger>
            <TabsTrigger value="users">Global Users</TabsTrigger>
            <TabsTrigger value="metrics">System Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="organizations" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Tenants</CardTitle>
                  <p className={typography.body}>
                    SaaS tenants. Create one, then add users under it.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setCreateOrgOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Tenant
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setCreateAdminOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create Tenant Admin
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAddUserOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {orgsLoading ? (
                  <p className={typography.body}>Loading…</p>
                ) : organisations.length === 0 ? (
                  <p className={typography.body}>
                    No tenants yet. Create one to get started.
                  </p>
                ) : (
                  <DataTableShell aria-label="Super admin tenants">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className={dataTableHeadClassName}>Name</TableHead>
                            <TableHead className={dataTableHeadClassName}>Short Name</TableHead>
                            <TableHead className={dataTableHeadClassName}>Slug</TableHead>
                            <TableHead className={dataTableHeadClassName}>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {organisations.map((org) => (
                            <TableRow
                              key={org.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => navigate(`/super-admin/org/${encodeURIComponent(org.slug)}`)}
                            >
                              <TableCell className="font-medium">{org.name}</TableCell>
                              <TableCell>{org.short_name?.trim() || "—"}</TableCell>
                              <TableCell className="font-mono text-sm">{org.slug}</TableCell>
                              <TableCell>
                                <Badge variant={org.status === "active" ? "default" : "secondary"}>
                                  {org.status}
                                </Badge>
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
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Global Users</CardTitle>
                  <p className={typography.body}>
                    All system users across the platform
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/app/users">
                    Open full Users page
                    <RefreshCw className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <p className={typography.body}>Loading users…</p>
                ) : (
                  <DataTableShell aria-label="Global users">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className={dataTableHeadClassName}>Name</TableHead>
                            <TableHead className={dataTableHeadClassName}>Email</TableHead>
                            <TableHead className={dataTableHeadClassName}>Role</TableHead>
                            <TableHead className={dataTableHeadClassName}>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(users ?? []).slice(0, 20).map((u) => (
                            <TableRow key={u.id}>
                              <TableCell className="font-medium">{u.name}</TableCell>
                              <TableCell>{u.email}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{u.role}</Badge>
                              </TableCell>
                              <TableCell>
                                {u.active ? (
                                  <span className="text-green-600">Active</span>
                                ) : (
                                  <span className="text-muted-foreground">Inactive</span>
                                )}
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
          </TabsContent>

          <TabsContent value="metrics" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>System Metrics</CardTitle>
                  <p className={typography.body}>
                    Key operational metrics (same data as Dashboard & Analytics)
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/app/analytics">
                    Open Analytics
                    <BarChart3 className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <StatGrid>
                  <MetricCard
                    label="Open Tickets"
                    value={statsLoading ? "—" : stats?.openTickets ?? 0}
                  />
                  <MetricCard
                    label="Needs Review"
                    value={statsLoading ? "—" : stats?.needsReviewCount ?? 0}
                  />
                  <MetricCard
                    label="Assigned"
                    value={statsLoading ? "—" : stats?.assignedTickets ?? 0}
                  />
                  <MetricCard
                    label="Avg Confidence"
                    value={statsLoading ? "—" : stats?.avgConfidenceScore ?? "—"}
                  />
                </StatGrid>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create Organisation modal */}
        <Dialog
          open={createOrgOpen}
          onOpenChange={(o) => {
            setCreateOrgOpen(o);
            if (!o) {
              setCreateOrgIncomingEmails([""]);
              setCreateOrgOutgoingEmails([""]);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Tenant</DialogTitle>
              <DialogDescription>
                Official name and slug are required. Short Name is optional and separate from the slug.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="org-name">Official company name</Label>
                <Input
                  id="org-name"
                  value={createOrgName}
                  onChange={(e) => {
                    setCreateOrgName(e.target.value);
                    if (!createOrgSlug) setCreateOrgSlug(e.target.value.trim().toLowerCase().replace(/\s+/g, "-"));
                  }}
                  placeholder="e.g. Hitachi Payment Services Private Limited"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="org-short-name">Short Name</Label>
                <Input
                  id="org-short-name"
                  value={createOrgShortName}
                  onChange={(e) => setCreateOrgShortName(e.target.value)}
                  placeholder="Hitachi"
                  maxLength={80}
                />
                <p className="text-xs text-muted-foreground">
                  Short searchable name used to identify this company. This does not change the official company name or slug.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  value={createOrgSlug}
                  onChange={(e) => setCreateOrgSlug(e.target.value.trim().toLowerCase().replace(/\s+/g, "-"))}
                  placeholder="hitachi-payment-services"
                />
              </div>
              <OrganisationEmailArraysEditor
                incomingEmails={createOrgIncomingEmails}
                outgoingEmails={createOrgOutgoingEmails}
                onIncomingChange={setCreateOrgIncomingEmails}
                onOutgoingChange={setCreateOrgOutgoingEmails}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOrgOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!createOrgName.trim() || !createOrgSlug.trim() || createOrgMutation.isPending}
                onClick={async () => {
                  try {
                    await createOrgMutation.mutateAsync({
                      name: createOrgName.trim(),
                      slug: createOrgSlug.trim().toLowerCase().replace(/\s+/g, "-"),
                      short_name: createOrgShortName.trim() || null,
                      incoming_emails: createOrgIncomingEmails,
                      outgoing_emails: createOrgOutgoingEmails,
                    });
                    toast({ title: "Tenant created" });
                    setCreateOrgOpen(false);
                    setCreateOrgName("");
                    setCreateOrgSlug("");
                    setCreateOrgShortName("");
                    setCreateOrgIncomingEmails([""]);
                    setCreateOrgOutgoingEmails([""]);
                  } catch (err) {
                    toast({
                      title: "Failed to create tenant",
                      description: err instanceof Error ? err.message : "Unknown error",
                      variant: "destructive",
                    });
                  }
                }}
              >
                {createOrgMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Organisation Admin modal — ADMIN role, linked to org */}
        <Dialog open={createAdminOpen} onOpenChange={setCreateAdminOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Tenant Admin</DialogTitle>
              <DialogDescription>
                Create a tenant admin linked to a tenant. They will manage only that tenant.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="admin-name">Name</Label>
                <Input
                  id="admin-name"
                  value={createAdminName}
                  onChange={(e) => setCreateAdminName(e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={createAdminEmail}
                  onChange={(e) => setCreateAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={createAdminPassword}
                  onChange={(e) => setCreateAdminPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="grid gap-2">
                <Label>Tenant</Label>
                <Select value={createAdminOrgId} onValueChange={setCreateAdminOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {organisations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>{org.name} ({org.slug})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateAdminOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!createAdminName.trim() || !createAdminEmail.trim() || !createAdminPassword || !createAdminOrgId || createAdminSubmitting}
                onClick={async () => {
                  setCreateAdminSubmitting(true);
                  try {
                    const { error } = await createAdminUser(signUp, {
                      email: createAdminEmail.trim(),
                      password: createAdminPassword,
                      name: createAdminName.trim(),
                      role: "ADMIN",
                      organisationId: createAdminOrgId,
                    });
                    if (error) {
                      toast({ title: "Failed to create admin", description: error.message, variant: "destructive" });
                      return;
                    }
                    queryClient.invalidateQueries({ queryKey: ["users"] });
                    toast({ title: "Tenant Admin created. They can sign in with the email and password." });
                    setCreateAdminOpen(false);
                    setCreateAdminName("");
                    setCreateAdminEmail("");
                    setCreateAdminPassword("");
                    setCreateAdminOrgId("");
                  } finally {
                    setCreateAdminSubmitting(false);
                  }
                }}
              >
                {createAdminSubmitting ? "Creating…" : "Create Admin"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add User under Organisation modal */}
        <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
              <DialogDescription>
                Create a user under a tenant. They will only see that tenant&apos;s data.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="user-name">Name</Label>
                <Input
                  id="user-name"
                  value={addUserName}
                  onChange={(e) => setAddUserName(e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={addUserEmail}
                  onChange={(e) => setAddUserEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="user-password">Password</Label>
                <Input
                  id="user-password"
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
                    {ROLES_FOR_ORG.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_DISPLAY_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tenant</Label>
                <Select value={addUserOrgId} onValueChange={setAddUserOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {organisations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>{org.name} ({org.slug})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddUserOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!addUserName.trim() || !addUserEmail.trim() || !addUserPassword || !addUserOrgId || addUserSubmitting}
                onClick={async () => {
                  setAddUserSubmitting(true);
                  try {
                    const { error } = await createAdminUser(signUp, {
                      email: addUserEmail.trim(),
                      password: addUserPassword,
                      name: addUserName.trim(),
                      role: addUserRole,
                      organisationId: addUserOrgId,
                      fieldExecutive:
                        addUserRole === "FIELD_EXECUTIVE" ? { active: true } : undefined,
                    });
                    if (error) {
                      toast({ title: "Failed to add user", description: error.message, variant: "destructive" });
                      return;
                    }
                    queryClient.invalidateQueries({ queryKey: ["users"] });
                    toast({ title: "User created. They can sign in with the email and password." });
                    setAddUserOpen(false);
                    setAddUserName("");
                    setAddUserEmail("");
                    setAddUserPassword("");
                    setAddUserRole("STAFF");
                    setAddUserOrgId("");
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
      </div>
      </PageContainer>
    </AppLayoutNew>
  );
}
