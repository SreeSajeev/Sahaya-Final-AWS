import { useState, useMemo } from "react";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  DataTableEmptyState,
  DataTableShell,
  dataTableHeadClassName,
  DEFAULT_TABLE_LOADING_LABEL,
  FilterBar,
  MetricCard,
  PageHeader,
  StatGrid,
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
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/backendDataApi";
import { useAuth } from "@/hooks/useAuth";
import { useOrganisationsTable } from "@/hooks/useOrganisationsTable";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Shield, Users, UserCheck, UserX, Building2 } from "lucide-react";
import { User, UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<UserRole, string> = {
  STAFF: "Service Manager",
  ADMIN: "Admin",
  FIELD_EXECUTIVE: "Field Executive",
  CLIENT: "Client",
  SUPER_ADMIN: "Super Admin",
};

const ROLE_BADGE_CLASS: Record<string, string> = {
  STAFF: "bg-blue-100 text-blue-700 border-blue-200",
  ADMIN: "bg-purple-100 text-purple-700 border-purple-200",
};

/**
 * Service Managers — Super Admin (all orgs, filterable) and ADMIN (own org only).
 * Lists users with role IN ('STAFF', 'ADMIN'). UI-only enhancements; same data/API.
 */
export default function ServiceManagers() {
  const { session, userProfile } = useAuth();
  const { toast } = useToast();
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const isSuperAdmin = userProfile?.role === "SUPER_ADMIN";
  const adminOrgId = userProfile?.role === "ADMIN" ? userProfile?.organisation_id ?? null : null;

  const { data: organisations = [] } = useOrganisationsTable();

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ["service-managers", isSuperAdmin ? orgFilter : adminOrgId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "500");
      params.set("offset", "0");
      params.set("role", "STAFF");
      if (adminOrgId) params.set("organisationId", adminOrgId);
      else if (isSuperAdmin && orgFilter) params.set("organisationId", orgFilter);
      const res = await fetchJson<{ items: User[] }>(`/data/users?${params.toString()}`);
      const usersData = res.items ?? [];
      const orgMap = Object.fromEntries(
        (organisations as { id: string; name: string }[]).map((o) => [o.id, o.name])
      );
      return usersData.map((u: User & { org_name?: string }) => ({
        ...u,
        org_name: u.organisation_id ? orgMap[u.organisation_id] ?? "—" : "—",
      })) as (User & { org_name?: string })[];
    },
  });

  const isActive = (u: User) => u.is_active !== false && u.active !== false;

  const filteredUsers = useMemo(() => {
    const list = users ?? [];
    if (!search.trim()) return list;
    const s = search.trim().toLowerCase();
    return list.filter(
      (u) =>
        u.name?.toLowerCase().includes(s) ||
        u.email?.toLowerCase().includes(s) ||
        (u as User & { org_name?: string }).org_name?.toLowerCase().includes(s)
    );
  }, [users, search]);

  const stats = useMemo(() => {
    const list = users ?? [];
    const active = list.filter(isActive).length;
    const orgIds = new Set(list.map((u) => u.organisation_id).filter(Boolean));
    return {
      total: list.length,
      active,
      inactive: list.length - active,
      orgCount: orgIds.size,
    };
  }, [users]);
  const hasActiveFilters = Boolean(search.trim() || (isSuperAdmin && orgFilter));

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
      refetch();
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setStatusPendingId(null);
      setDeactivateTarget(null);
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
      refetch();
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    }
  };

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="Service Managers"
            description={isSuperAdmin ? "Staff and Admin users across the platform" : "Staff and Admin in your tenant"}
            icon={Shield}
            actions={
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                Refresh
              </Button>
            }
          />

          <StatGrid>
            <MetricCard label="Total Service Managers" value={stats.total} icon={Users} layout="horizontal" />
            <MetricCard label="Active" value={stats.active} icon={UserCheck} variant="success" layout="horizontal" />
            <MetricCard label="Inactive" value={stats.inactive} icon={UserX} layout="horizontal" />
            <MetricCard label="Tenants" value={stats.orgCount} icon={Building2} layout="horizontal" />
          </StatGrid>

          <FilterBar
            aria-label="Service manager filters"
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search by name or email...",
              "aria-label": "Search service managers",
            }}
          >
            {isSuperAdmin ? (
              <Select value={orgFilter || "all"} onValueChange={(v) => setOrgFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All tenants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tenants</SelectItem>
                  {(organisations as { id: string; name: string; slug?: string }[]).map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name} {org.slug ? `(${org.slug})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </FilterBar>

          <DataTableShell
            aria-label="Service managers"
            loading={isLoading}
            loadingLabel={DEFAULT_TABLE_LOADING_LABEL}
            emptyState={
              !isLoading && filteredUsers.length === 0 ? (
                <DataTableEmptyState
                  filterEmpty={hasActiveFilters}
                  title="No service managers found"
                  description="Service managers will appear here when available."
                  filteredTitle="No service managers match your filters"
                  filteredDescription="Try adjusting search or tenant filters."
                />
              ) : undefined
            }
          >
            {!isLoading && filteredUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={dataTableHeadClassName}>Name</TableHead>
                      <TableHead className={dataTableHeadClassName}>Email</TableHead>
                      <TableHead className={dataTableHeadClassName}>Tenant</TableHead>
                      <TableHead className={dataTableHeadClassName}>Role</TableHead>
                      <TableHead className={dataTableHeadClassName}>Status</TableHead>
                      <TableHead className={cn(dataTableHeadClassName, "text-right")}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => {
                      const active = isActive(u);
                      const uWithOrg = u as User & { org_name?: string };
                      return (
                        <TableRow key={u.id}>
                          <TableCell className={cn(typography.body, "font-medium")}>{u.name}</TableCell>
                          <TableCell className={typography.meta}>{u.email}</TableCell>
                          <TableCell className={typography.body}>{uWithOrg.org_name ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-xs", ROLE_BADGE_CLASS[u.role] ?? "")}>
                              {ROLE_LABELS[u.role] ?? u.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={active ? "default" : "secondary"} className={active ? "bg-green-600" : ""}>
                              {active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Switch
                              checked={active}
                              disabled={statusPendingId === u.id}
                              onCheckedChange={(checked) => {
                                if (checked) updateUserStatus(u.id, true);
                                else setDeactivateTarget(u);
                              }}
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

          {filteredUsers.length > 0 ? (
            <p className={cn(typography.meta, "text-right")}>
              Showing {filteredUsers.length} of {users.length} service managers
            </p>
          ) : null}

          <AlertDialog open={!!deactivateTarget} onOpenChange={() => setDeactivateTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deactivateTarget?.name} will lose access immediately. You can reactivate later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deactivateTarget && updateUserStatus(deactivateTarget.id, false)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Deactivate
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PageContainer>
    </AppLayoutNew>
  );
}
