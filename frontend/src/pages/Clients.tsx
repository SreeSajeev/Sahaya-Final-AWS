import { useMemo, useState } from "react";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  DataTableEmptyState,
  DataTableShell,
  dataTableHeadClassName,
  DEFAULT_TABLE_LOADING_LABEL,
  FilterBar,
  PageHeader,
  typography,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useOrganisationsTable } from "@/hooks/useOrganisationsTable";
import {
  useTenantClients,
  useCreateTenantClient,
  useUpdateTenantClient,
  useDeleteTenantClient,
} from "@/hooks/useTenantClients";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import type { Organisation, TenantClient } from "@/lib/types";
import { Link, Navigate } from "react-router-dom";
import { isTenantClientsEnabled } from "@/lib/tenantClientsFeature";
import { cn } from "@/lib/utils";
import { suggestCompanyShortName } from "@/lib/companyShortName";

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type ClientFormState = {
  name: string;
  slug: string;
  company_short_name: string;
  website: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: "active" | "inactive";
  organisation_id: string;
};

const emptyForm = (organisationId: string): ClientFormState => ({
  name: "",
  slug: "",
  company_short_name: "",
  website: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  status: "active",
  organisation_id: organisationId,
});

export default function Clients() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = userProfile?.role === "SUPER_ADMIN";
  const isTenantAdmin = userProfile?.role === "ADMIN";
  const allowed = isSuperAdmin || isTenantAdmin;

  const tenantOrgId = userProfile?.organisation_id ?? "";
  const [orgFilter, setOrgFilter] = useState<string>(isSuperAdmin ? "" : tenantOrgId);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TenantClient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantClient | null>(null);
  const [form, setForm] = useState<ClientFormState>(emptyForm(tenantOrgId));

  const { data: organisations = [] } = useOrganisationsTable({
    enabled: allowed && isSuperAdmin,
  });

  const listOrgId = isSuperAdmin && orgFilter ? orgFilter : isSuperAdmin ? undefined : tenantOrgId;

  const featureOn = isTenantClientsEnabled();

  const { data: clients = [], isLoading, refetch } = useTenantClients({
    organisationId: listOrgId ?? null,
    enabled: featureOn && allowed && Boolean(userProfile?.id),
  });

  const createClient = useCreateTenantClient();
  const updateClient = useUpdateTenantClient();
  const deleteClient = useDeleteTenantClient();

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of organisations as Organisation[]) {
      map.set(o.id, o.name);
    }
    return map;
  }, [organisations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company_short_name ?? "").toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.contact_email ?? "").toLowerCase().includes(q)
    );
  }, [clients, search]);
  const hasActiveFilters = Boolean(search.trim() || (isSuperAdmin && orgFilter));

  const openCreate = () => {
    setEditing(null);
    const orgId = isSuperAdmin && orgFilter ? orgFilter : tenantOrgId;
    setForm(emptyForm(orgId));
    setDialogOpen(true);
  };

  const openEdit = (c: TenantClient) => {
    setEditing(c);
    setForm({
      name: c.name,
      slug: c.slug,
      company_short_name: c.company_short_name ?? "",
      website: c.website ?? "",
      contact_name: c.contact_name ?? "",
      contact_email: c.contact_email ?? "",
      contact_phone: c.contact_phone ?? "",
      status: c.status === "inactive" ? "inactive" : "active",
      organisation_id: c.organisation_id,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast({ variant: "destructive", title: "Name and slug are required" });
      return;
    }
    if (isSuperAdmin && !form.organisation_id) {
      toast({ variant: "destructive", title: "Select a tenant" });
      return;
    }

    const body = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      company_short_name: form.company_short_name.trim() || null,
      website: form.website.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      status: form.status,
      ...(isSuperAdmin ? { organisation_id: form.organisation_id } : {}),
    };

    try {
      if (editing) {
        await updateClient.mutateAsync({ id: editing.id, body });
        toast({ title: "Client updated" });
      } else {
        await createClient.mutateAsync(body);
        toast({ title: "Client created" });
      }
      setDialogOpen(false);
      refetch();
    } catch (e) {
      toast({
        variant: "destructive",
        title: editing ? "Update failed" : "Create failed",
        description: e instanceof Error ? e.message : "Request failed",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteClient.mutateAsync(deleteTarget.id);
      toast({ title: "Client deactivated" });
      setDeleteTarget(null);
      refetch();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Deactivate failed",
        description: e instanceof Error ? e.message : "Request failed",
      });
    }
  };

  const busy = createClient.isPending || updateClient.isPending;

  if (!featureOn || !allowed) {
    return <Navigate to="/app" replace />;
  }

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="Clients"
            description="Manage official client names, display short names, and ticket slugs."
            icon={Briefcase}
            actions={
              <Button onClick={openCreate} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add client
              </Button>
            }
          />

          <FilterBar
            aria-label="Client filters"
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search clients…",
              "aria-label": "Search clients",
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
          </FilterBar>

          <DataTableShell
            aria-label="Clients"
            loading={isLoading}
            loadingLabel={DEFAULT_TABLE_LOADING_LABEL}
            emptyState={
              !isLoading && filtered.length === 0 ? (
                <DataTableEmptyState
                  filterEmpty={hasActiveFilters}
                  title="No clients found"
                  description="Add a client to use it in ticket creation."
                  filteredTitle="No clients match your filters"
                  filteredDescription="Try adjusting your search or tenant filter."
                />
              ) : undefined
            }
          >
            {!isLoading && filtered.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={dataTableHeadClassName}>Official Name</TableHead>
                      <TableHead className={dataTableHeadClassName}>Company Short Name</TableHead>
                      <TableHead className={dataTableHeadClassName}>Slug</TableHead>
                      {isSuperAdmin ? <TableHead className={dataTableHeadClassName}>Tenant</TableHead> : null}
                      <TableHead className={dataTableHeadClassName}>Contact</TableHead>
                      <TableHead className={dataTableHeadClassName}>Status</TableHead>
                      <TableHead className={cn(dataTableHeadClassName, "text-right")}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className={cn(typography.body, "font-medium")}>
                          <Link to={`/app/clients/${c.id}`} className="text-primary hover:underline">
                            {c.name}
                          </Link>
                        </TableCell>
                        <TableCell className={typography.body}>{c.company_short_name?.trim() || "—"}</TableCell>
                        <TableCell className={cn(typography.body, "font-mono")}>{c.slug}</TableCell>
                        {isSuperAdmin ? (
                          <TableCell className={typography.body}>
                            {orgNameById.get(c.organisation_id) ?? c.organisation_id}
                          </TableCell>
                        ) : null}
                        <TableCell className={typography.body}>
                          {c.contact_name ? <div>{c.contact_name}</div> : null}
                          {c.contact_email ? <div className={typography.meta}>{c.contact_email}</div> : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/app/clients/${c.id}`}>
                              <ExternalLink className="mr-1.5 h-4 w-4" />
                              View
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {c.status === "active" ? (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(c)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </DataTableShell>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit client" : "Add client"}</DialogTitle>
              <DialogDescription>
                The slug is stored on tickets as client_slug. Company Short Name is a display label.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label>Tenant *</Label>
                  <Select
                    value={form.organisation_id || undefined}
                    onValueChange={(v) => setForm((f) => ({ ...f, organisation_id: v }))}
                    disabled={Boolean(editing)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {(organisations as Organisation[]).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      slug: !editing && !f.slug ? slugifyName(name) : f.slug,
                      company_short_name:
                        !editing && !f.company_short_name ? suggestCompanyShortName(name) : f.company_short_name,
                    }));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Company Short Name</Label>
                <Input
                  value={form.company_short_name}
                  onChange={(e) => setForm((f) => ({ ...f, company_short_name: e.target.value }))}
                  placeholder="Suggested from official name"
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  className="font-mono"
                  placeholder="Enter slug"
                  disabled={Boolean(editing)}
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  placeholder="https://"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact name</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact email</Label>
                <Input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact phone</Label>
                <Input
                  value={form.contact_phone}
                  onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label>Active</Label>
                  <p className="text-xs text-muted-foreground">Inactive clients are hidden from ticket create</p>
                </div>
                <Switch
                  checked={form.status === "active"}
                  onCheckedChange={(on) =>
                    setForm((f) => ({ ...f, status: on ? "active" : "inactive" }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={busy}>
                {editing ? "Save changes" : "Create client"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate client?</AlertDialogTitle>
              <AlertDialogDescription>
                This sets {deleteTarget?.name} ({deleteTarget?.slug}) to inactive. Existing tickets keep their
                client slug (`client_slug`).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Deactivate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </AppLayoutNew>
  );
}
