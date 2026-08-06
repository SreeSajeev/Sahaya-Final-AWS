import { useState } from "react";
import { Link } from "react-router-dom";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader, typography } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { OrganisationEmailArraysEditor } from "@/components/organisations/OrganisationEmailArraysEditor";
import { EditOrganisationModal } from "@/components/organisations/EditOrganisationModal";
import { useOrganisationsTable, useCreateOrganisation } from "@/hooks/useOrganisationsTable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Building2, Ticket, Users, Truck, UserCheck, ChevronRight, Plus, UserPlus, Pencil } from "lucide-react";
import { Organisation } from "@/lib/types";
import { fetchJson } from "@/lib/backendDataApi";
import { createAdminUser } from "@/lib/createAdminUser";

/**
 * Organisations list — Super Admin only.
 * Cards with org name, status, tickets, FEs, users, distinct clients.
 * Click → /app/tenant/:orgId
 */
export default function Organisations() {
  const { userProfile, signUp, session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createShortName, setCreateShortName] = useState("");
  const [createIncomingEmails, setCreateIncomingEmails] = useState<string[]>([""]);
  const [createOutgoingEmails, setCreateOutgoingEmails] = useState<string[]>([""]);
  const [orgSearch, setOrgSearch] = useState("");

  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [createAdminOrgId, setCreateAdminOrgId] = useState<string | null>(null);
  const [createAdminName, setCreateAdminName] = useState("");
  const [createAdminEmail, setCreateAdminEmail] = useState("");
  const [createAdminPassword, setCreateAdminPassword] = useState("");
  const [createAdminSubmitting, setCreateAdminSubmitting] = useState(false);

  const [editOrg, setEditOrg] = useState<Organisation | null>(null);

  const { data: organisations = [], isLoading: orgsLoading } = useOrganisationsTable();
  const createOrgMutation = useCreateOrganisation();
  const isSuperAdmin = userProfile?.role === "SUPER_ADMIN";

  const { data: perOrgStats, isLoading: statsLoading } = useQuery({
    queryKey: ["organisations-stats", (organisations as Organisation[]).map((o) => `${o.id}:${o.slug}`).join(",")],
    enabled: organisations.length > 0 && Boolean(session?.access_token),
    queryFn: async (): Promise<
      Record<
        string,
        {
          totalTickets: number;
          openTickets: number;
          feCount: number;
          userCount: number;
          distinctClients: number;
          slaBreached: number;
        }
      >
    > => {
      const orgsList = organisations as Organisation[];
      const res = await fetchJson<{
        items: Record<
          string,
          {
            totalTickets: number;
            openTickets: number;
            feCount: number;
            userCount: number;
            distinctClients: number;
            slaBreached: number;
          }
        >;
      }>(`/data/organisations/stats`);
      const items = res.items ?? {};
      const out: Record<
        string,
        {
          totalTickets: number;
          openTickets: number;
          feCount: number;
          userCount: number;
          distinctClients: number;
          slaBreached: number;
        }
      > = {};
      for (const org of orgsList) {
        const row = items[org.id];
        out[org.id] = {
          totalTickets: row?.totalTickets ?? 0,
          openTickets: row?.openTickets ?? 0,
          feCount: row?.feCount ?? 0,
          userCount: row?.userCount ?? 0,
          distinctClients: row?.distinctClients ?? 0,
          slaBreached: row?.slaBreached ?? 0,
        };
      }
      return out;
    },
  });

  if (orgsLoading) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <p className="text-sm text-muted-foreground">Loading tenants…</p>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  const filteredOrgs = (organisations as Organisation[]).filter((org) => {
    const q = orgSearch.trim().toLowerCase();
    if (!q) return true;
    return [org.name, org.short_name, org.slug]
      .some((v) => v != null && String(v).toLowerCase().includes(q));
  });

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-8">
          <PageHeader
            title="Tenants"
            description="Tenant cards. Click to open tenant view."
            icon={Building2}
            actions={
              isSuperAdmin ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Tenant
                </Button>
              ) : undefined
            }
          />

          <div className="max-w-md">
            <Label htmlFor="org-search" className="sr-only">
              Search tenants
            </Label>
            <Input
              id="org-search"
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              placeholder="Search by name, short name, or slug…"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredOrgs.map((org) => {
              const s = statsLoading ? null : perOrgStats?.[org.id];
              const short = org.short_name != null ? String(org.short_name).trim() : "";
              return (
                <Card key={org.id} className="h-full border-border/60 shadow-sm transition-shadow hover:shadow-md flex flex-col">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="min-w-0 pr-2">
                      <CardTitle className={typography.sectionTitle}>
                        {short ? `${short}` : org.name}
                      </CardTitle>
                      {short ? (
                        <p className="mt-1 text-xs text-muted-foreground truncate" title={org.name}>
                          {org.name}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-muted-foreground/80 font-mono truncate">
                        {org.slug}
                      </p>
                    </div>
                    <Badge variant={org.status === "active" ? "default" : "secondary"}>
                      {org.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-2 flex-1 flex flex-col">
                    <div className={`flex items-center gap-2 ${typography.body}`}>
                      <Ticket className="h-4 w-4" />
                      <span>{s?.totalTickets ?? "—"} tickets</span>
                      {s != null && s.openTickets > 0 && (
                        <span className="text-amber-600">({s.openTickets} open)</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-2 ${typography.body}`}>
                      <Truck className="h-4 w-4" />
                      <span>{s?.feCount ?? "—"} FEs</span>
                    </div>
                    <div className={`flex items-center gap-2 ${typography.body}`}>
                      <Users className="h-4 w-4" />
                      <span>{s?.userCount ?? "—"} users</span>
                    </div>
                    <div className={`flex items-center gap-2 ${typography.body}`}>
                      <UserCheck className="h-4 w-4" />
                      <span>{s?.distinctClients ?? "—"} clients</span>
                    </div>
                    {s != null && s.slaBreached > 0 && (
                      <p className="text-xs text-destructive font-medium">
                        {s.slaBreached} SLA breached
                      </p>
                    )}
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          setEditOrg(org);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit Tenant
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          setCreateAdminOrgId(org.id);
                          setCreateAdminOpen(true);
                        }}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        Create Admin
                      </Button>
                      <Link
                        to={`/app/tenant/${encodeURIComponent(org.id)}`}
                        className="inline-flex items-center gap-1 text-primary text-sm font-medium hover:underline"
                      >
                        Tenant view <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredOrgs.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {organisations.length === 0 ? "No tenants yet." : "No tenants match this search."}
              </CardContent>
            </Card>
          )}
        </div>

        <EditOrganisationModal
          open={editOrg !== null}
          onOpenChange={(o) => {
            if (!o) setEditOrg(null);
          }}
          organisation={editOrg}
        />

        <Dialog open={createOpen} onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) {
            setCreateIncomingEmails([""]);
            setCreateOutgoingEmails([""]);
            setCreateShortName("");
          }
        }}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Tenant</DialogTitle>
              <DialogDescription>
                Official name and slug are required. Short Name is an optional operator-friendly label (separate from the slug).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="org-name">Official company name</Label>
                <Input
                  id="org-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Hitachi Payment Services Private Limited"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="org-short-name">Short Name</Label>
                <Input
                  id="org-short-name"
                  value={createShortName}
                  onChange={(e) => setCreateShortName(e.target.value)}
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
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value.replace(/\s+/g, "-").toLowerCase())}
                  placeholder="hitachi-payment-services"
                />
                <p className="text-xs text-muted-foreground">
                  Unique URL/key identifier (lowercase, hyphens). Not the same as Short Name.
                </p>
              </div>
              <OrganisationEmailArraysEditor
                incomingEmails={createIncomingEmails}
                outgoingEmails={createOutgoingEmails}
                onIncomingChange={setCreateIncomingEmails}
                onOutgoingChange={setCreateOutgoingEmails}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!createName.trim() || !createSlug.trim() || createOrgMutation.isPending}
                onClick={async () => {
                  const name = createName.trim();
                  const slug = createSlug.trim().toLowerCase().replace(/\s+/g, "-");
                  const short_name = createShortName.trim() || null;
                  if (!name || !slug) return;
                  try {
                    await createOrgMutation.mutateAsync({
                      name,
                      slug,
                      short_name,
                      incoming_emails: createIncomingEmails,
                      outgoing_emails: createOutgoingEmails,
                    });
                    toast({ title: "Tenant created", description: `${name} is now available. You can assign an admin next.` });
                    setCreateOpen(false);
                    setCreateName("");
                    setCreateSlug("");
                    setCreateShortName("");
                    setCreateIncomingEmails([""]);
                    setCreateOutgoingEmails([""]);
                  } catch (err) {
                    toast({
                      title: "Failed to create tenant",
                      description: err instanceof Error ? err.message : "Something went wrong",
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

        {/* Create Admin for organisation */}
        <Dialog
          open={createAdminOpen}
          onOpenChange={(open) => {
            setCreateAdminOpen(open);
            if (!open) {
              setCreateAdminOrgId(null);
              setCreateAdminName("");
              setCreateAdminEmail("");
              setCreateAdminPassword("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Tenant Admin</DialogTitle>
              <DialogDescription>
                Create an admin user for this tenant. They will manage only this tenant (tickets, users, field executives).
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
              {createAdminOrgId && (
                <p className="text-xs text-muted-foreground">
                  Tenant: {(organisations as Organisation[]).find((o) => o.id === createAdminOrgId)?.name ?? createAdminOrgId}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateAdminOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !createAdminName.trim() ||
                  !createAdminEmail.trim() ||
                  !createAdminPassword ||
                  !createAdminOrgId ||
                  createAdminSubmitting
                }
                onClick={async () => {
                  if (!createAdminOrgId) return;
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
                      toast({
                        title: "Failed to create admin",
                        description: error.message,
                        variant: "destructive",
                      });
                      return;
                    }
                    queryClient.invalidateQueries({ queryKey: ["users"] });
                    queryClient.invalidateQueries({ queryKey: ["organisations-stats"] });
                    toast({
                      title: "Tenant Admin created",
                      description: "They can sign in with the email and password.",
                    });
                    setCreateAdminOpen(false);
                    setCreateAdminOrgId(null);
                    setCreateAdminName("");
                    setCreateAdminEmail("");
                    setCreateAdminPassword("");
                  } catch (err) {
                    toast({
                      title: "Failed to create admin",
                      description: err instanceof Error ? err.message : "Something went wrong",
                      variant: "destructive",
                    });
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
      </PageContainer>
    </AppLayoutNew>
  );
}
