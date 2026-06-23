import { useState } from 'react';
import { AppLayoutNew } from '@/components/layout/AppLayoutNew';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader, MetricCard, StatGrid, FilterBar, FILTER_SELECT_WIDTH, typography } from '@/components/common';
import { FECard, FECardSkeleton } from '@/components/field-executives/FECard';
import { FEDetailSheet } from '@/components/field-executives/FEDetailSheet';
import { CreateFEModal } from '@/components/field-executives/CreateFEModal';
import { EditFEModal } from '@/components/field-executives/EditFEModal';
import { useFieldExecutivesWithStats } from '@/hooks/useFieldExecutives';
import { useAuth } from '@/hooks/useAuth';
import { useTenantTerminology } from '@/hooks/useTenantTerminology';
import { FieldExecutive, FieldExecutiveWithStats } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Truck, 
  Filter,
  RefreshCw,
  Users,
  CheckCircle2,
  AlertCircle,
  UserPlus
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * FieldExecutives page with ability to create new FEs.
 * Service Manager can add new field executives via the "Add Field Executive" button.
 */
export default function FieldExecutives() {
  const { userProfile } = useAuth();
  const terminology = useTenantTerminology(userProfile?.organisation_id ?? null);
  const { data: executives, isLoading, refetch } = useFieldExecutivesWithStats();
  const [selectedFE, setSelectedFE] = useState<FieldExecutiveWithStats | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createFEModalOpen, setCreateFEModalOpen] = useState(false);
  const [editingFE, setEditingFE] = useState<FieldExecutive | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [workloadFilter, setWorkloadFilter] = useState<'all' | 'available' | 'low' | 'moderate' | 'high'>('all');
  const [resourceFilter, setResourceFilter] = useState<'all' | 'own' | 'outsourced'>('all');

  const canEdit =
    userProfile?.role === 'ADMIN' ||
    userProfile?.role === 'STAFF' ||
    userProfile?.role === 'SUPER_ADMIN';

  const handleViewFE = (fe: FieldExecutive) => {
    const feWithStats = executives?.find(e => e.id === fe.id);
    if (feWithStats) {
      setSelectedFE(feWithStats);
      setSheetOpen(true);
    }
  };

  // Filter executives
  const filteredExecutives = (executives || []).filter((fe) => {
    const matchesSearch = !search || 
      fe.name.toLowerCase().includes(search.toLowerCase()) ||
      fe.base_location?.toLowerCase().includes(search.toLowerCase()) ||
      fe.phone?.includes(search) ||
      (fe.email && fe.email.toLowerCase().includes(search.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && fe.active) ||
      (statusFilter === 'inactive' && !fe.active);

    const matchesWorkload = (() => {
      if (workloadFilter === 'all') return true;
      if (workloadFilter === 'available') return fe.active_tickets === 0;
      if (workloadFilter === 'low') return fe.active_tickets > 0 && fe.active_tickets <= 2;
      if (workloadFilter === 'moderate') return fe.active_tickets > 2 && fe.active_tickets <= 4;
      if (workloadFilter === 'high') return fe.active_tickets > 4;
      return true;
    })();
    
    const matchesResource =
      resourceFilter === 'all'
        ? true
        : (() => {
            const k = String(
              (fe.skills as { resource_kind?: string } | null)?.resource_kind ?? ''
            )
              .toLowerCase()
              .trim();
            const isOut = k === 'outsourced';
            if (resourceFilter === 'outsourced') return isOut;
            return !isOut;
          })();

    return matchesSearch && matchesStatus && matchesWorkload && matchesResource;
  });

  // Calculate summary stats
  const totalActive = (executives || []).filter(fe => fe.active).length;
  const totalInactive = (executives || []).filter(fe => !fe.active).length;
  const availableFEs = (executives || []).filter(fe => fe.active && fe.active_tickets === 0).length;
  const highWorkload = (executives || []).filter(fe => fe.active_tickets > 4).length;

  return (
    <AppLayoutNew>
      <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title={terminology.fieldExecutivesLabel}
          description="Team profiles, skills, and workload visibility"
          icon={Truck}
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setCreateFEModalOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add {terminology.fieldExecutiveLabel}
              </Button>
            </>
          }
        />

        <StatGrid>
          <MetricCard label="Total Active" value={totalActive} icon={Users} />
          <MetricCard
            label="Available Now"
            value={availableFEs}
            icon={CheckCircle2}
            variant="success"
          />
          <MetricCard
            label="High Workload"
            value={highWorkload}
            icon={AlertCircle}
            variant="warning"
          />
          <MetricCard label="Inactive" value={totalInactive} icon={Users} />
        </StatGrid>

        <FilterBar
          aria-label="Field executive filters"
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search by name, location, phone...',
            'aria-label': 'Search field executives',
          }}
        >
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className={FILTER_SELECT_WIDTH}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={resourceFilter} onValueChange={(v) => setResourceFilter(v as 'all' | 'own' | 'outsourced')}>
            <SelectTrigger className={FILTER_SELECT_WIDTH}>
              <Filter className="h-4 w-4 mr-2 opacity-70" />
              <SelectValue placeholder="Resource" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All resources</SelectItem>
              <SelectItem value="own">Own resource</SelectItem>
              <SelectItem value="outsourced">Outsourced</SelectItem>
            </SelectContent>
          </Select>

          <Select value={workloadFilter} onValueChange={(v) => setWorkloadFilter(v as any)}>
            <SelectTrigger className={FILTER_SELECT_WIDTH}>
              <SelectValue placeholder="Workload" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Workload</SelectItem>
              <SelectItem value="available">Available (0)</SelectItem>
              <SelectItem value="low">Low (1-2)</SelectItem>
              <SelectItem value="moderate">Moderate (3-4)</SelectItem>
              <SelectItem value="high">High (5+)</SelectItem>
            </SelectContent>
          </Select>

          {(statusFilter !== 'all' || workloadFilter !== 'all' || resourceFilter !== 'all' || search) && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setWorkloadFilter('all');
                setResourceFilter('all');
                setSearch('');
              }}
            >
              Clear filters
            </Button>
          )}
        </FilterBar>

        {/* Results count */}
        <div className={cn(typography.body, 'text-muted-foreground')}>
          Showing {filteredExecutives.length} of {executives?.length || 0} field executives
        </div>

        {/* Grid of FE Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(6)].map((_, i) => (
              <FECardSkeleton key={i} />
            ))}
          </div>
        ) : filteredExecutives.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
              <Truck className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className={cn(typography.sectionTitle)}>No field executives found</h3>
            <p className={cn(typography.body, 'text-muted-foreground mt-1 max-w-md')}>
              {search || statusFilter !== 'all' || workloadFilter !== 'all' || resourceFilter !== 'all'
                ? 'Try adjusting your filters to see more results.'
                : 'Field executives will appear here once added to the system.'
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredExecutives.map((fe) => (
              <FECard
                key={fe.id}
                executive={fe}
                onClick={handleViewFE}
                canEdit={canEdit}
                onEdit={(exec) => {
                  setEditingFE(exec);
                  setEditModalOpen(true);
                }}
              />
            ))}
          </div>
        )}

        {/* FE Detail Sheet */}
        <FEDetailSheet
          executive={selectedFE}
          stats={selectedFE ? {
            active_tickets: selectedFE.active_tickets,
            resolved_this_week: selectedFE.resolved_this_week,
            avg_resolution_time_hours: selectedFE.avg_resolution_time_hours,
            sla_compliance_rate: selectedFE.sla_compliance_rate,
          } : undefined}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          canEdit={canEdit}
        />

        {/* Create FE Modal - Requirement 4 */}
        <CreateFEModal open={createFEModalOpen} onOpenChange={setCreateFEModalOpen} />

        {/* Edit FE Modal - Admin / Service Manager */}
        <EditFEModal
          executive={editingFE}
          open={editModalOpen}
          onOpenChange={(open) => {
            setEditModalOpen(open);
            if (!open) setEditingFE(null);
          }}
          onSuccess={() => refetch()}
        />
      </div>
    </PageContainer>
    </AppLayoutNew>
  );
}