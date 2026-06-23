import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  DataTableEmptyState,
  DataTableShell,
  DEFAULT_TABLE_LOADING_LABEL,
  FilterBar,
  PageHeader,
} from "@/components/common";
import { Button } from "@/components/ui/button";
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
import { ComplaintPointDialog, type ComplaintPointFormState } from "@/components/complaint-points/ComplaintPointDialog";
import { ComplaintPointQrModal } from "@/components/complaint-points/ComplaintPointQrModal";
import { ComplaintPointTable } from "@/components/complaint-points/ComplaintPointTable";
import { useAuth } from "@/hooks/useAuth";
import { useOrganisationsTable } from "@/hooks/useOrganisationsTable";
import {
  useComplaintPoints,
  useCreateComplaintPoint,
  useUpdateComplaintPoint,
  useDisableComplaintPoint,
  useRegenerateComplaintPointToken,
} from "@/hooks/useComplaintPoints";
import { useToast } from "@/hooks/use-toast";
import { isPublicComplaintsEnabled } from "@/lib/publicComplaintsFeature";
import type { ComplaintPoint } from "@/lib/complaintPointsApi";
import type { Organisation } from "@/lib/types";
import { MapPin, Plus } from "lucide-react";

function trimOrNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

function formToCreateBody(form: ComplaintPointFormState, isSuperAdmin: boolean) {
  return {
    name: form.name.trim(),
    description: trimOrNull(form.description),
    building: trimOrNull(form.building),
    floor: trimOrNull(form.floor),
    site_name: trimOrNull(form.site_name),
    asset_reference: trimOrNull(form.asset_reference),
    default_client_slug: trimOrNull(form.default_client_slug),
    default_category: trimOrNull(form.default_category),
    default_issue_type: trimOrNull(form.default_issue_type),
    ...(isSuperAdmin ? { organisation_id: form.organisation_id } : {}),
  };
}

function formToUpdateBody(form: ComplaintPointFormState) {
  return {
    name: form.name.trim(),
    description: trimOrNull(form.description),
    building: trimOrNull(form.building),
    floor: trimOrNull(form.floor),
    site_name: trimOrNull(form.site_name),
    asset_reference: trimOrNull(form.asset_reference),
    default_client_slug: trimOrNull(form.default_client_slug),
    default_category: trimOrNull(form.default_category),
    default_issue_type: trimOrNull(form.default_issue_type),
  };
}

export default function ComplaintPoints() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const featureOn = isPublicComplaintsEnabled();
  const isSuperAdmin = userProfile?.role === "SUPER_ADMIN";
  const isTenantAdmin = userProfile?.role === "ADMIN";
  const allowed = isSuperAdmin || isTenantAdmin;

  const tenantOrgId = userProfile?.organisation_id ?? "";
  const [orgFilter, setOrgFilter] = useState<string>(isSuperAdmin ? "" : tenantOrgId);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ComplaintPoint | null>(null);
  const [disableTarget, setDisableTarget] = useState<ComplaintPoint | null>(null);
  const [regenerateTarget, setRegenerateTarget] = useState<ComplaintPoint | null>(null);
  const [qrTarget, setQrTarget] = useState<ComplaintPoint | null>(null);

  const { data: organisations = [] } = useOrganisationsTable({
    enabled: allowed && isSuperAdmin && featureOn,
  });

  const listOrgId = isSuperAdmin && orgFilter ? orgFilter : isSuperAdmin ? undefined : tenantOrgId;
  const listStatus =
    statusFilter === "active" || statusFilter === "disabled"
      ? (statusFilter as "active" | "disabled")
      : null;

  const { data: points = [], isLoading, refetch } = useComplaintPoints({
    organisationId: listOrgId ?? null,
    status: listStatus,
    enabled: featureOn && allowed && Boolean(userProfile?.id),
  });

  const createPoint = useCreateComplaintPoint();
  const updatePoint = useUpdateComplaintPoint();
  const disablePoint = useDisableComplaintPoint();
  const regenerateToken = useRegenerateComplaintPointToken();

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of organisations as Organisation[]) {
      map.set(o.id, o.name);
    }
    return map;
  }, [organisations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return points;
    return points.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.building ?? "").toLowerCase().includes(q) ||
        (p.floor ?? "").toLowerCase().includes(q) ||
        (p.public_url ?? "").toLowerCase().includes(q)
    );
  }, [points, search]);
  const hasActiveFilters = Boolean(search.trim() || statusFilter || (isSuperAdmin && orgFilter));

  const defaultOrgId = isSuperAdmin && orgFilter ? orgFilter : tenantOrgId;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (p: ComplaintPoint) => {
    setEditing(p);
    setDialogOpen(true);
  };

  const handleSave = async (form: ComplaintPointFormState, editRow: ComplaintPoint | null) => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    if (!form.building.trim()) {
      toast({ variant: "destructive", title: "Location is required" });
      return;
    }
    if (isSuperAdmin && !editRow && !form.organisation_id) {
      toast({ variant: "destructive", title: "Select a tenant" });
      return;
    }

    try {
      if (editRow) {
        await updatePoint.mutateAsync({
          id: editRow.id,
          body: formToUpdateBody(form),
        });
        toast({ title: "Complaint point updated" });
      } else {
        await createPoint.mutateAsync(formToCreateBody(form, isSuperAdmin));
        toast({ title: "Complaint point created" });
      }
      setDialogOpen(false);
      refetch();
    } catch (e) {
      toast({
        variant: "destructive",
        title: editRow ? "Update failed" : "Create failed",
        description: e instanceof Error ? e.message : "Request failed",
      });
    }
  };

  const handleDisable = async () => {
    if (!disableTarget) return;
    try {
      await disablePoint.mutateAsync(disableTarget.id);
      toast({ title: "Complaint point disabled" });
      setDisableTarget(null);
      refetch();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Disable failed",
        description: e instanceof Error ? e.message : "Request failed",
      });
    }
  };

  const handleRegenerate = async () => {
    if (!regenerateTarget) return;
    try {
      await regenerateToken.mutateAsync(regenerateTarget.id);
      toast({
        title: "Token regenerated",
        description: "Update printed QR codes — old URLs will stop working.",
      });
      setRegenerateTarget(null);
      refetch();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Regenerate failed",
        description: e instanceof Error ? e.message : "Request failed",
      });
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "URL copied to clipboard" });
    } catch {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Could not access clipboard",
      });
    }
  };

  const busy =
    createPoint.isPending ||
    updatePoint.isPending ||
    disablePoint.isPending ||
    regenerateToken.isPending;

  if (!featureOn || !allowed) {
    return <Navigate to="/app" replace />;
  }

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="Complaint Points"
            description="Manage QR complaint locations for your tenant. Public reporting will be enabled in a later release."
            icon={MapPin}
            actions={
              <Button onClick={openCreate} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add complaint point
              </Button>
            }
          />

          <FilterBar
            aria-label="Complaint point filters"
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search complaint points…",
              "aria-label": "Search complaint points",
            }}
          >
            {isSuperAdmin ? (
              <Select
                value={orgFilter || "__all__"}
                onValueChange={(v) => setOrgFilter(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All tenants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All tenants</SelectItem>
                  {(organisations as Organisation[]).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={statusFilter || "__all__"}
              onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar>

          <DataTableShell
            aria-label="Complaint points"
            loading={isLoading}
            loadingLabel={DEFAULT_TABLE_LOADING_LABEL}
            emptyState={
              !isLoading && filtered.length === 0 ? (
                <DataTableEmptyState
                  filterEmpty={hasActiveFilters}
                  title="No complaint points yet"
                  description="Create one to get a public report URL for QR codes."
                  filteredTitle="No complaint points match your filters"
                  filteredDescription="Try adjusting your search, status, or tenant filters."
                />
              ) : undefined
            }
          >
            {!isLoading && filtered.length > 0 ? (
              <ComplaintPointTable
                points={filtered}
                isLoading={isLoading}
                isSuperAdmin={isSuperAdmin}
                orgNameById={orgNameById}
                onEdit={openEdit}
                onDisable={setDisableTarget}
                onRegenerateToken={setRegenerateTarget}
                onCopyUrl={handleCopyUrl}
                onViewQr={setQrTarget}
              />
            ) : null}
          </DataTableShell>
        </div>

        <ComplaintPointDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          isSuperAdmin={isSuperAdmin}
          organisations={organisations as Organisation[]}
          defaultOrganisationId={defaultOrgId}
          busy={busy}
          onSave={handleSave}
        />

        <ComplaintPointQrModal
          point={qrTarget}
          open={!!qrTarget}
          onOpenChange={(o) => !o && setQrTarget(null)}
          tenantName={
            qrTarget && isSuperAdmin
              ? orgNameById.get(qrTarget.organisation_id) ?? undefined
              : undefined
          }
          onCopyUrl={handleCopyUrl}
        />

        <AlertDialog open={!!disableTarget} onOpenChange={(o) => !o && setDisableTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disable complaint point?</AlertDialogTitle>
              <AlertDialogDescription>
                {disableTarget?.name} will be disabled. Its public URL will not accept reports when
                the public flow is live. Existing data is retained.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDisable}
                className="bg-destructive text-destructive-foreground"
              >
                Disable
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={!!regenerateTarget}
          onOpenChange={(o) => !o && setRegenerateTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate public token?</AlertDialogTitle>
              <AlertDialogDescription>
                This invalidates the current URL for {regenerateTarget?.name}. Any printed QR codes
                must be replaced. The new URL will appear in the list after confirmation.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRegenerate}>Regenerate token</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </AppLayoutNew>
  );
}
