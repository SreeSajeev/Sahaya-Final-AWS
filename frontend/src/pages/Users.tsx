import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatIST } from '@/lib/dateUtils';
import { AppLayoutNew } from '@/components/layout/AppLayoutNew';
import { PageContainer } from '@/components/layout/PageContainer';
import {
  PageHeader,
  MetricCard,
  StatGrid,
  FilterBar,
  FILTER_SELECT_WIDTH,
  DataTableShell,
  dataTableHeadClassName,
} from '@/components/common';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/backendDataApi';
import { createAdminUser } from '@/lib/createAdminUser';
import { fetchPendingUsersList, fetchWorkspaceUsersList } from '@/lib/usersDirectorySupabase';
import { useAuth } from '@/hooks/useAuth';
import { useOrganisationsTable } from '@/hooks/useOrganisationsTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Users as UsersIcon, 
  RefreshCw, 
  Search,
  Shield,
  UserCheck,
  UserX,
  Clock,
  Info,
  Plus,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { User, UserRole } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useTenantTerminology } from '@/hooks/useTenantTerminology';

const ROLE_BADGES: Record<UserRole, { label: string; className: string }> = {
  STAFF: { label: 'Service Manager', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  FIELD_EXECUTIVE: { label: 'Field Executive', className: 'bg-green-100 text-green-700 border-green-200' },
  ADMIN: { label: 'Admin', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  SUPER_ADMIN: { label: 'Super Admin', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  CLIENT: { label: 'Client', className: 'bg-slate-100 text-slate-700 border-slate-200' },
};

/** Roles an Organisation Admin can create (STAFF and FIELD_EXECUTIVE only). */
const TENANT_ADMIN_ROLES: UserRole[] = ['STAFF', 'FIELD_EXECUTIVE'];
const SUPER_ADMIN_ROLES: UserRole[] = ['ADMIN', 'STAFF', 'FIELD_EXECUTIVE', 'CLIENT', 'SUPER_ADMIN'];

export default function Users() {
  const queryClient = useQueryClient();
  const { userProfile, session, signUp, loading: authLoading } = useAuth();
  const terminology = useTenantTerminology(userProfile?.organisation_id ?? null);
  const roleBadges = useMemo(
    () => ({
      ...ROLE_BADGES,
      FIELD_EXECUTIVE: {
        ...ROLE_BADGES.FIELD_EXECUTIVE,
        label: terminology.fieldExecutiveLabel,
      },
    }),
    [terminology.fieldExecutiveLabel]
  );
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserName, setAddUserName] = useState('');
  const [addUserEmail, setAddUserEmail] = useState('');
  const [addUserPassword, setAddUserPassword] = useState('');
  const [addUserRole, setAddUserRole] = useState<UserRole>('STAFF');
  const [addUserOrgId, setAddUserOrgId] = useState('');
  const [addUserSubmitting, setAddUserSubmitting] = useState(false);
  const [assignOrgTarget, setAssignOrgTarget] = useState<User | null>(null);
  const [assignOrgId, setAssignOrgId] = useState('');
  const [assignOrgSubmitting, setAssignOrgSubmitting] = useState(false);
  const [approvalPendingId, setApprovalPendingId] = useState<string | null>(null);

  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';
  const isTenantAdmin = userProfile?.role === 'ADMIN';

  const safeName = (u: User) => (u.name ?? "").trim();
  const safeEmail = (u: User) => (u.email ?? "").trim();
  const nameInitial = (u: User) => {
    const n = safeName(u);
    return (n.charAt(0) || "?").toUpperCase();
  };

  const assignUserToOrg = async () => {
    if (!assignOrgTarget || !assignOrgId) return;
    setAssignOrgSubmitting(true);
    try {
      await fetchJson(`/admin/users/${assignOrgTarget.id}/organisation`, {
        method: 'PATCH',
        body: { organisation_id: assignOrgId },
      });
      queryClient.invalidateQueries({ queryKey: ['users', organisationId, isSuperAdmin] });
      toast({
        title: 'Tenant assigned',
        description: `${safeName(assignOrgTarget) || safeEmail(assignOrgTarget) || 'User'} can now access their tenant.`,
      });
      setAssignOrgTarget(null);
      setAssignOrgId('');
    } catch (err) {
      toast({ title: 'Failed to assign', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setAssignOrgSubmitting(false);
    }
  };

  const handleApproveUser = async (userId: string) => {
    setApprovalPendingId(userId);
    try {
      await fetchJson(`/admin/users/${userId}/approval`, {
        method: 'PATCH',
        body: { approval_status: 'approved' },
      });
      toast({ title: 'User approved', description: 'They can now sign in.' });
      refetch();
      refetchPending();
    } catch (err) {
      toast({ title: 'Failed to approve', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setApprovalPendingId(null);
    }
  };

  const handleRejectUser = async (userId: string) => {
    setApprovalPendingId(userId);
    try {
      await fetchJson(`/admin/users/${userId}/approval`, {
        method: 'PATCH',
        body: { approval_status: 'rejected' },
      });
      toast({ title: 'Request rejected', description: 'The user cannot sign in.' });
      refetch();
      refetchPending();
    } catch (err) {
      toast({ title: 'Failed to reject', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setApprovalPendingId(null);
    }
  };

  const updateUserStatus = async (userId: string, isActive: boolean) => {
    if (!session?.access_token) {
      toast({ title: 'Not signed in', variant: 'destructive' });
      return;
    }
    setStatusPendingId(userId);
    try {
      await fetchJson(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: { is_active: isActive },
      });
      toast({
        title: isActive ? 'User activated' : 'User deactivated',
        description: isActive ? 'They can sign in again.' : 'They will lose access immediately.',
      });
      refetch();
    } catch (err) {
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setStatusPendingId(null);
      setDeactivateTarget(null);
    }
  };

  const organisationId = userProfile?.organisation_id ?? null;

  const hasSessionToken = Boolean(session?.access_token);
  /** Wait for AuthProvider + JWT so Supabase RLS sees an authenticated client. */
  const authReadyForData =
    !authLoading && hasSessionToken && userProfile != null;

  const { data: organisations = [], isError: orgsQueryError, error: orgsQueryErr } =
    useOrganisationsTable({ enabled: authReadyForData });

  const {
    data: users,
    isPending: usersPending,
    isError: isUsersError,
    error: usersError,
    refetch,
  } = useQuery({
    queryKey: ['users', organisationId, isSuperAdmin],
    enabled: authReadyForData,
    queryFn: async () => fetchWorkspaceUsersList({ isSuperAdmin, organisationId }),
  });

  const { data: pendingUsersTenant = [], refetch: refetchPendingTenant } = useQuery({
    queryKey: ['users-pending', organisationId],
    queryFn: async () =>
      fetchPendingUsersList({ isSuperAdmin: false, organisationId, limit: 200 }),
    enabled: authReadyForData && isTenantAdmin && !!organisationId,
  });

  const { data: pendingUsersSuperAdmin = [], refetch: refetchPendingSuperAdmin } = useQuery({
    queryKey: ['users-pending-all'],
    queryFn: async () =>
      fetchPendingUsersList({ isSuperAdmin: true, organisationId: null, limit: 500 }),
    enabled: authReadyForData && isSuperAdmin,
  });

  const usersListLoading = authLoading || (authReadyForData && usersPending);

  const pendingUsers = isSuperAdmin ? pendingUsersSuperAdmin : pendingUsersTenant;
  const refetchPending = isSuperAdmin ? refetchPendingSuperAdmin : refetchPendingTenant;

  useEffect(() => {
    if (isUsersError && usersError) {
      // eslint-disable-next-line no-console
      console.error('[Users page] users list query failed:', usersError);
    }
  }, [isUsersError, usersError]);

  useEffect(() => {
    if (orgsQueryError && orgsQueryErr) {
      // eslint-disable-next-line no-console
      console.error('[Users page] organisations list query failed:', orgsQueryErr);
    }
  }, [orgsQueryError, orgsQueryErr]);

  const isActive = (u: User) => u.is_active !== false && u.active !== false;

  const orgMap = useMemo(() => {
    const m = new Map<string, string>();
    (organisations as { id: string; name: string }[]).forEach((o) => m.set(o.id, o.name));
    return m;
  }, [organisations]);

  const usersByOrgThenRole = useMemo(() => {
    const list = users ?? [];
    const byOrg: Record<string, User[]> = {};
    list.forEach((u) => {
      const key = u.organisation_id ?? '__none__';
      if (!byOrg[key]) byOrg[key] = [];
      byOrg[key].push(u);
    });
    const result: { orgId: string; orgName: string; roles: { role: UserRole; users: User[] }[] }[] = [];
    const roleOrder: UserRole[] = ['ADMIN', 'STAFF', 'FIELD_EXECUTIVE', 'CLIENT', 'SUPER_ADMIN'];
    const orgIds = Object.keys(byOrg).sort((a, b) => {
      if (a === '__none__') return -1;
      if (b === '__none__') return 1;
      return (orgMap.get(a) ?? a).localeCompare(orgMap.get(b) ?? b);
    });
    orgIds.forEach((orgId) => {
      const orgUsers = byOrg[orgId] ?? [];
      const orgName = orgId === '__none__' ? 'Platform' : (orgMap.get(orgId) ?? orgId);
      const roleMap: Record<string, User[]> = {};
      orgUsers.forEach((u) => {
        if (!roleMap[u.role]) roleMap[u.role] = [];
        roleMap[u.role].push(u);
      });
      const roles = roleOrder
        .filter((r) => (roleMap[r]?.length ?? 0) > 0)
        .map((r) => ({ role: r, users: roleMap[r] ?? [] }));
      result.push({ orgId, orgName, roles });
    });
    return result;
  }, [users, orgMap]);

  // Filter users (for non–Super Admin view)
  const filteredUsers = (users || []).filter(user => {
    const matchesSearch = !search ||
      safeName(user).toLowerCase().includes(search.toLowerCase()) ||
      safeEmail(user).toLowerCase().includes(search.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && isActive(user)) ||
      (statusFilter === 'inactive' && !isActive(user));

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Calculate stats
  const stats = {
    total: users?.length || 0,
    active: users?.filter(u => isActive(u)).length || 0,
    inactive: users?.filter(u => !isActive(u)).length || 0,
    admins: users?.filter(u => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN').length || 0,
  };

  return (
    <AppLayoutNew>
      <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Users"
          description={isTenantAdmin ? 'Manage users in your tenant' : 'System user management and role overview'}
          icon={UsersIcon}
          actions={
            <>
              {(isTenantAdmin && organisationId) || isSuperAdmin ? (
                <Button size="sm" onClick={() => setAddUserOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              ) : null}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => refetch()}
                disabled={usersListLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${usersListLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </>
          }
        />

        {authLoading && (
          <Alert>
            <AlertTitle>Loading session</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Preparing your account. User list will load next.
            </AlertDescription>
          </Alert>
        )}

        {!authLoading && !authReadyForData && userProfile === null && (
          <Alert variant="destructive">
            <AlertTitle>Not signed in</AlertTitle>
            <AlertDescription>User list is unavailable until a profile is loaded. Refresh the page or sign in again.</AlertDescription>
          </Alert>
        )}

        {orgsQueryError && (
          <Alert variant="destructive">
            <AlertTitle>Could not load tenants</AlertTitle>
            <AlertDescription>
              {orgsQueryErr instanceof Error ? orgsQueryErr.message : 'Organisation query failed. Please retry.'}
            </AlertDescription>
          </Alert>
        )}

        {isUsersError && (
          <Alert variant="destructive">
            <AlertTitle>Could not load users</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                {usersError instanceof Error ? usersError.message : 'Unknown error loading users. Try Refresh.'}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {Boolean(userProfile && authReadyForData && !isSuperAdmin && !organisationId) && (
          <Alert variant="default" className="border-amber-200 bg-amber-50">
            <Info className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-amber-900">No tenant on your account</AlertTitle>
            <AlertDescription className="text-amber-800">
              Users are loaded per tenant. Ask a Super Admin to assign{' '}
              <code className="text-xs rounded bg-amber-100/80 px-1">organisation_id</code> to your profile, then refresh.
            </AlertDescription>
          </Alert>
        )}

        {/* Admin Notice */}
        <Alert className="bg-purple-50 border-purple-200">
          <Shield className="h-4 w-4 text-purple-600" />
          <AlertDescription className="text-sm text-purple-800">
            {isTenantAdmin ? (
              <>
                <strong>Tenant Admin:</strong> You manage users in your tenant only. You can add users, change roles, and activate or deactivate them. Tenant cannot be changed.
              </>
            ) : (
              <>
                <strong>Admin View:</strong> This page shows all system users and their roles. User management operations require appropriate administrative privileges.
              </>
            )}
          </AlertDescription>
        </Alert>

        {/* Pending User Requests — Organisation admins (their org) or Super Admin (all) */}
        {((isTenantAdmin && organisationId) || isSuperAdmin) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending User Requests
              </CardTitle>
              <CardDescription>
                {isSuperAdmin
                  ? 'Users waiting for approval (any tenant). Approve so they can sign in.'
                  : 'Users who signed up and are waiting for your approval to access the platform.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending requests.</p>
              ) : (
                <DataTableShell aria-label="Pending users table" className="rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className={dataTableHeadClassName}>Name</TableHead>
                        <TableHead className={dataTableHeadClassName}>Email</TableHead>
                        <TableHead className={dataTableHeadClassName}>Role</TableHead>
                        {isSuperAdmin && <TableHead className={dataTableHeadClassName}>Tenant</TableHead>}
                        <TableHead className={cn(dataTableHeadClassName, 'text-right')}>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{safeName(u) || "—"}</TableCell>
                          <TableCell>{safeEmail(u) || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={cn(roleBadges[u.role]?.className)}>
                              {roleBadges[u.role]?.label ?? u.role}
                            </Badge>
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell className="text-muted-foreground">
                              {u.organisation_id ? (orgMap.get(u.organisation_id) ?? u.organisation_id) : '—'}
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApproveUser(u.id)}
                                disabled={approvalPendingId === u.id}
                              >
                                {approvalPendingId === u.id ? '…' : 'Approve'}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleRejectUser(u.id)}
                                disabled={approvalPendingId === u.id}
                              >
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </DataTableShell>
              )}
            </CardContent>
          </Card>
        )}

        {/* Summary Stats — hidden for Super Admin (they see org-grouped view) */}
        {!isSuperAdmin && (
          <StatGrid>
            <MetricCard label="Total Users" value={stats.total} icon={UsersIcon} layout="horizontal" />
            <MetricCard label="Active" value={stats.active} icon={UserCheck} variant="success" layout="horizontal" />
            <MetricCard label="Inactive" value={stats.inactive} icon={UserX} layout="horizontal" />
            <MetricCard label="Admins" value={stats.admins} icon={Shield} layout="horizontal" />
          </StatGrid>
        )}

        {/* Super Admin: Organisation-grouped layout */}
        {isSuperAdmin && (
          <div className="space-y-6">
            {usersListLoading ? (
              <div className="flex h-48 items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Loading users...</p>
                </div>
              </div>
            ) : isUsersError ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Users could not be loaded. Use the message above or Retry.
              </p>
            ) : usersByOrgThenRole.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed text-center p-6">
                <p className="text-sm font-medium">No users found</p>
                <p className="text-xs text-muted-foreground mt-1">Create users from Add User if the list should not be empty.</p>
              </div>
            ) : (
              usersByOrgThenRole.map(({ orgId, orgName, roles }) => (
                <Card key={orgId} className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{orgName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {roles.map(({ role, users: roleUsers }) => (
                      <div key={role} className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <span className="uppercase tracking-wide">{roleBadges[role]?.label ?? role}</span>
                          <Badge variant="secondary" className="text-xs">
                            {roleUsers.length}
                          </Badge>
                        </div>
                        <DataTableShell aria-label={`${orgName} ${role} users`} className="rounded-lg">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className={dataTableHeadClassName}>Name</TableHead>
                                <TableHead className={dataTableHeadClassName}>Email</TableHead>
                                <TableHead className={dataTableHeadClassName}>Status</TableHead>
                                <TableHead className={dataTableHeadClassName}>Created</TableHead>
                                {orgId === '__none__' && (
                                  <TableHead className={cn(dataTableHeadClassName, 'text-right')}>Actions</TableHead>
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {roleUsers.map((user) => (
                                <TableRow key={user.id} className="data-table-row">
                                  <TableCell>
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                                        {nameInitial(user)}
                                      </div>
                                      <span className="font-medium">{safeName(user) || "—"}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm text-muted-foreground">{safeEmail(user) || "—"}</span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={isActive(user)}
                                        disabled={statusPendingId === user.id || user.id === userProfile?.id}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            updateUserStatus(user.id, true);
                                          } else {
                                            setDeactivateTarget(user);
                                          }
                                        }}
                                      />
                                      <span className="text-sm text-muted-foreground">
                                        {isActive(user) ? 'Active' : 'Inactive'}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                      <Clock className="h-3.5 w-3.5" />
                                      {formatIST(user.created_at, 'MMM d, yyyy')}
                                    </div>
                                  </TableCell>
                                  {orgId === '__none__' && (
                                    <TableCell className="text-right">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setAssignOrgTarget(user);
                                          setAssignOrgId('');
                                        }}
                                      >
                                        <Building2 className="h-3.5 w-3.5 mr-1.5" />
                                        Assign to org
                                      </Button>
                                    </TableCell>
                                  )}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </DataTableShell>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Filters — non–Super Admin only */}
        {!isSuperAdmin && (
        <FilterBar
          aria-label="User filters"
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search by name or email...',
            'aria-label': 'Search users',
          }}
        >
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as UserRole | 'all')}>
            <SelectTrigger className={FILTER_SELECT_WIDTH} aria-label="Filter by role">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="STAFF">Service Manager</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              {isSuperAdmin && <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>}
              <SelectItem value="FIELD_EXECUTIVE">{terminology.fieldExecutiveLabel}</SelectItem>
              <SelectItem value="CLIENT">Client</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}>
            <SelectTrigger className={FILTER_SELECT_WIDTH} aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          {(search || roleFilter !== 'all' || statusFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setRoleFilter('all');
                setStatusFilter('all');
              }}
            >
              Clear filters
            </Button>
          )}
        </FilterBar>
        )}

        {/* Results count — non–Super Admin only */}
        {!isSuperAdmin && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredUsers.length} of {stats.total} users
        </div>
        )}

        {/* Users Table — non–Super Admin only */}
        {!isSuperAdmin && (usersListLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Loading users...</p>
            </div>
          </div>
        ) : isUsersError ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
            <p className="text-sm font-medium text-destructive">Could not load users</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {usersError instanceof Error ? usersError.message : 'Unknown error'}
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-center p-8">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <UsersIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">No users found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || roleFilter !== 'all' || statusFilter !== 'all'
                ? 'Try adjusting your filters to see more results.'
                : 'Users will appear here once created.'
              }
            </p>
          </div>
        ) : (
          <DataTableShell aria-label="Users table">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className={dataTableHeadClassName}>Name</TableHead>
                  <TableHead className={dataTableHeadClassName}>Email</TableHead>
                  <TableHead className={dataTableHeadClassName}>Role</TableHead>
                  <TableHead className={dataTableHeadClassName}>Status</TableHead>
                  <TableHead className={dataTableHeadClassName}>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user, idx) => (
                  <TableRow 
                    key={user.id}
                    className={cn(
                      "data-table-row",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                    )}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                          {nameInitial(user)}
                        </div>
                        <span className="font-medium">{safeName(user) || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{safeEmail(user) || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs", roleBadges[user.role]?.className)}
                      >
                        {roleBadges[user.role]?.label || user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={isActive(user)}
                            disabled={statusPendingId === user.id || user.id === userProfile?.id}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                updateUserStatus(user.id, true);
                              } else {
                                setDeactivateTarget(user);
                              }
                            }}
                          />
                          <span className="text-sm text-muted-foreground">
                            {isActive(user) ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      ) : (
                        isActive(user) ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            Inactive
                          </Badge>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatIST(user.created_at, 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </DataTableShell>
        ))}

        <Dialog open={addUserOpen} onOpenChange={(open) => {
          setAddUserOpen(open);
          if (!open) setAddUserOrgId('');
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
              <DialogDescription>
                {isSuperAdmin
                  ? 'Create a user in any tenant. They will sign in with the email and password you set.'
                  : 'Create a user in your tenant. They will sign in with the email and password you set. Tenant cannot be changed.'}
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
              {isSuperAdmin && (
                <div className="grid gap-2">
                  <Label>Tenant</Label>
                  <Select
                    value={addUserOrgId || undefined}
                    onValueChange={setAddUserOrgId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {(organisations as { id: string; name: string; slug?: string }[]).map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name} {org.slug ? `(${org.slug})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select value={addUserRole} onValueChange={(v) => setAddUserRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(isSuperAdmin ? SUPER_ADMIN_ROLES : TENANT_ADMIN_ROLES).map((r) => (
                      <SelectItem key={r} value={r}>{roleBadges[r]?.label ?? r}</SelectItem>
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
                disabled={
                  !addUserName.trim() ||
                  !addUserEmail.trim() ||
                  !addUserPassword ||
                  (isSuperAdmin ? !addUserOrgId : !organisationId) ||
                  addUserSubmitting
                }
                onClick={async () => {
                  const selectedOrganisationId = isSuperAdmin ? addUserOrgId : organisationId ?? undefined;
                  setAddUserSubmitting(true);
                  try {
                    const { error } = await createAdminUser(signUp, {
                      email: addUserEmail.trim(),
                      password: addUserPassword,
                      name: addUserName.trim(),
                      role: addUserRole,
                      organisationId: selectedOrganisationId ?? null,
                      fieldExecutive:
                        addUserRole === 'FIELD_EXECUTIVE' ? { active: true } : undefined,
                    });
                    if (error) {
                      toast({ title: 'Failed to add user', description: error.message, variant: 'destructive' });
                      return;
                    }
                    queryClient.invalidateQueries({ queryKey: ['users', organisationId, isSuperAdmin] });
                    if (addUserRole === 'STAFF' || addUserRole === 'ADMIN') {
                      queryClient.invalidateQueries({ queryKey: ['service-managers'] });
                    }
                    if (addUserRole === 'FIELD_EXECUTIVE') {
                      queryClient.invalidateQueries({ queryKey: ['field-executives'] });
                      queryClient.invalidateQueries({ queryKey: ['field-executives-with-stats'] });
                    }
                    toast({ title: 'User created', description: 'They can sign in with the email and password.' });
                    setAddUserOpen(false);
                    setAddUserName('');
                    setAddUserEmail('');
                    setAddUserPassword('');
                    setAddUserRole('STAFF');
                    setAddUserOrgId('');
                  } finally {
                    setAddUserSubmitting(false);
                  }
                }}
              >
                {addUserSubmitting ? 'Creating…' : 'Add User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!assignOrgTarget} onOpenChange={(open) => !open && (setAssignOrgTarget(null), setAssignOrgId(''))}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assign to tenant</DialogTitle>
              <DialogDescription>
                {assignOrgTarget
                  ? `${safeName(assignOrgTarget) || '—'} (${safeEmail(assignOrgTarget) || '—'}) has no tenant. Choose one so they can access the app.`
                  : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Tenant</Label>
                <Select value={assignOrgId || undefined} onValueChange={setAssignOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {(organisations as { id: string; name: string; slug?: string }[]).map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name} {org.slug ? `(${org.slug})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAssignOrgTarget(null); setAssignOrgId(''); }}>
                Cancel
              </Button>
              <Button disabled={!assignOrgId || assignOrgSubmitting} onClick={assignUserToOrg}>
                {assignOrgSubmitting ? 'Saving…' : 'Assign'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
              <AlertDialogDescription>
                {deactivateTarget && (
                  <>
                    <strong>{safeName(deactivateTarget) || '—'}</strong> will lose access immediately and cannot sign in until
                    reactivated. Are you sure?
                  </>
                )}
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
