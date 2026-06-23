/**
 * Tenant Admin Dashboard — DEMO-ONLY
 * Centralized dashboard for ADMIN role. UI-only orchestration; reuses existing hooks and components.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayoutNew } from '@/components/layout/AppLayoutNew';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useTenantTerminology } from '@/hooks/useTenantTerminology';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useTickets } from '@/hooks/useTickets';
import { useFieldExecutivesWithStats } from '@/hooks/useFieldExecutives';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/backendDataApi';
import { createAdminUser } from '@/lib/createAdminUser';
import { useToast } from '@/hooks/use-toast';
import { DataTableShell, MetricCard, PageHeader, StatGrid } from '@/components/common';
import {
  TicketsTable,
  TicketsTableEmptyState,
  TICKETS_TABLE_LOADING_LABEL,
} from '@/components/tickets/TicketsTable';
import { CreateFEModal } from '@/components/field-executives/CreateFEModal';
import {
  Ticket,
  Truck,
  Users,
  Building2,
  UserPlus,
  Sliders,
} from 'lucide-react';

export default function TenantAdminDashboard() {
  const { userProfile, signUp } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const organisationId = userProfile?.organisation_id ?? null;
  const terminology = useTenantTerminology(organisationId);

  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [addStaffName, setAddStaffName] = useState('');
  const [addStaffEmail, setAddStaffEmail] = useState('');
  const [addStaffPassword, setAddStaffPassword] = useState('');
  const [addStaffSubmitting, setAddStaffSubmitting] = useState(false);
  const [createFEModalOpen, setCreateFEModalOpen] = useState(false);

  const isAdmin = userProfile?.role === 'ADMIN';

  const { data: stats } = useDashboardStats();
  const { data: tickets = [], isLoading: ticketsLoading } = useTickets({ status: 'all' });
  const { data: executives = [] } = useFieldExecutivesWithStats();

  const { data: org } = useQuery({
    queryKey: ['organisation', organisationId],
    enabled: Boolean(organisationId),
    queryFn: async () => {
      return await fetchJson<{ id: string; name: string; slug: string }>(
        `/data/organisations/${encodeURIComponent(organisationId!)}`
      );
    },
  });

  const { data: orgUsers = [] } = useQuery({
    queryKey: ['users-org-overview', organisationId],
    enabled: Boolean(organisationId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '500');
      params.set('offset', '0');
      params.set('organisationId', organisationId!);
      const res = await fetchJson<{ items: { id: string; role: string }[] }>(`/data/users?${params.toString()}`);
      return (res.items ?? []).map((u) => ({ id: u.id, role: u.role }));
    },
  });

  const { data: clientSlugs = [] } = useQuery({
    queryKey: ['tenant-clients-overview', organisationId],
    enabled: Boolean(organisationId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('organisationId', organisationId!);
      const res = await fetchJson<{ clientSlugs: string[] }>(`/data/analytics/client-slugs?${params.toString()}`);
      return res.clientSlugs ?? [];
    },
  });

  if (!isAdmin) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
            <p className="text-muted-foreground font-medium">Tenant Admin access required.</p>
            <p className="text-sm text-muted-foreground mt-1">This dashboard is only available for tenant administrators.</p>
          </div>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  if (!organisationId) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
            <p className="text-muted-foreground font-medium">Tenant context required.</p>
          </div>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  const totalTickets = stats?.totalTickets ?? 0;
  const totalFEs = executives.length;
  const totalUsersExcludingClient = orgUsers.filter((u) => u.role !== 'CLIENT').length;
  const totalClients = clientSlugs.length;

  const handleAddStaff = async () => {
    if (!organisationId) return;
    setAddStaffSubmitting(true);
    try {
      const { error } = await createAdminUser(signUp, {
        email: addStaffEmail.trim(),
        password: addStaffPassword,
        name: addStaffName.trim(),
        role: 'STAFF',
        organisationId,
      });
      if (error) {
        toast({ title: 'Failed to add user', description: error.message, variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['users-org-overview', organisationId] });
      queryClient.invalidateQueries({ queryKey: ['users', organisationId] });
      queryClient.invalidateQueries({ queryKey: ['service-managers', organisationId] });
      toast({ title: 'Service Manager created', description: 'They can sign in with the email and password.' });
      setAddStaffOpen(false);
      setAddStaffName('');
      setAddStaffEmail('');
      setAddStaffPassword('');
    } finally {
      setAddStaffSubmitting(false);
    }
  };

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-8">
          <PageHeader
            title="Tenant Admin Dashboard"
            description="Manage your tenant — users, field executives, tickets, and settings"
          />

          {/* 1. Tenant Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Tenant Overview
              </CardTitle>
              <CardDescription>{org?.name ?? '—'} {org?.slug ? `(${org.slug})` : ''}</CardDescription>
            </CardHeader>
            <CardContent>
              <StatGrid>
                <MetricCard label="Total tickets" value={totalTickets} icon={Ticket} />
                <MetricCard label="Field executives" value={totalFEs} icon={Truck} />
                <MetricCard label="Users (excl. clients)" value={totalUsersExcludingClient} icon={Users} />
                <MetricCard label="Clients (distinct)" value={totalClients} icon={Building2} />
              </StatGrid>
            </CardContent>
          </Card>

          {/* 2. Workforce Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Workforce Management
              </CardTitle>
              <CardDescription>Add field executives and service managers to your tenant.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={() => setCreateFEModalOpen(true)}>
                <Truck className="h-4 w-4 mr-2" />
                Add {terminology.fieldExecutiveLabel}
              </Button>
              <Button variant="outline" onClick={() => setAddStaffOpen(true)}>
                <Users className="h-4 w-4 mr-2" />
                Add Service Manager
              </Button>
            </CardContent>
          </Card>

          {/* 3. Ticket Configuration — link to full Ticket Settings page */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="h-5 w-5" />
                Ticket Configuration
              </CardTitle>
              <CardDescription>Configure categories, issue types, and SLA hours for your tenant.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link to="/app/ticket-settings">
                  <Sliders className="h-4 w-4 mr-2" />
                  Open Ticket Settings
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* 4. Tickets Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-5 w-5" />
                Tickets
              </CardTitle>
              <CardDescription>Your tenant&apos;s tickets. Click to view or edit.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <DataTableShell
                aria-label="Tenant tickets"
                className="rounded-none border-0 shadow-none"
                loading={ticketsLoading}
                loadingLabel={TICKETS_TABLE_LOADING_LABEL}
                emptyState={
                  !ticketsLoading && tickets.length === 0 ? (
                    <TicketsTableEmptyState />
                  ) : undefined
                }
              >
                {!ticketsLoading && tickets.length > 0 ? (
                  <TicketsTable tickets={tickets} />
                ) : null}
              </DataTableShell>
            </CardContent>
          </Card>
        </div>

        {/* Add Service Manager dialog */}
        <Dialog open={addStaffOpen} onOpenChange={setAddStaffOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Service Manager</DialogTitle>
              <DialogDescription>
                Create a user in your tenant with the Service Manager role. They will sign in with the email and password you set.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="staff-name">Name</Label>
                <Input
                  id="staff-name"
                  value={addStaffName}
                  onChange={(e) => setAddStaffName(e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={addStaffEmail}
                  onChange={(e) => setAddStaffEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="staff-password">Password</Label>
                <Input
                  id="staff-password"
                  type="password"
                  value={addStaffPassword}
                  onChange={(e) => setAddStaffPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddStaffOpen(false)}>Cancel</Button>
              <Button
                disabled={
                  !addStaffName.trim() ||
                  !addStaffEmail.trim() ||
                  !addStaffPassword ||
                  addStaffSubmitting
                }
                onClick={handleAddStaff}
              >
                {addStaffSubmitting ? 'Creating…' : 'Add Service Manager'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CreateFEModal open={createFEModalOpen} onOpenChange={setCreateFEModalOpen} />
      </PageContainer>
    </AppLayoutNew>
  );
}
