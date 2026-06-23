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
import {
  normalizeOrgSlug,
  fetchTicketStubsForOrganisationSlugs,
  aggregateTicketCountsByNormalizedSlug,
  fetchBreachedTicketIds,
} from "@/lib/tenantTicketsSupabase";
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
  const [createIncomingEmails, setCreateIncomingEmails] = useState<string[]>([""]);
  const [createOutgoingEmails, setCreateOutgoingEmails] = useState<string[]>([""]);

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
      let legacy: Record<
        string,
        {
          totalTickets?: number;
          openTickets?: number;
          feCount: number;
          userCount: number;
          distinctClients: number;
          slaBreached?: number;
        }
      > = {};
      try {
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
        legacy = res.items ?? {};
      } catch {
        /* optional: FE / user counts from API */
      }

      try {
        const stubs = await fetchTicketStubsForOrganisationSlugs(orgsList.map((o) => o.slug));
        const bySlug = aggregateTicketCountsByNormalizedSlug(stubs);
        const breachIds = await fetchBreachedTicketIds(stubs.map((s) => s.id));

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
          const slugKey = normalizeOrgSlug(org.slug);
          const legacyRow = legacy[org.id];
          const b = slugKey ? bySlug[slugKey] : undefined;
          let slaBreached = 0;
          if (b) {
            for (const tid of b.ticketIds) {
              if (breachIds.has(tid)) slaBreached += 1;
            }
          }

          const distinctClients =
            (b?.distinctClientSlugs.size ?? 0) > 0
              ? b!.distinctClientSlugs.size
              : (legacyRow?.distinctClients ?? 0);

          out[org.id] = {
            totalTickets: b?.total ?? legacyRow?.totalTickets ?? 0,
            openTickets: b?.open ?? legacyRow?.openTickets ?? 0,
            feCount: legacyRow?.feCount ?? 0,
            userCount: legacyRow?.userCount ?? 0,
            distinctClients,
            slaBreached: slaBreached,
          };
        }

        if (import.meta.env.DEV) {
          const sample = orgsList[0];
          if (sample) {
            const b0 = bySlug[normalizeOrgSlug(sample.slug)];
            // eslint-disable-next-line no-console
            console.info("[OrganisationsTicketStats]", "sample org.slug:", sample.slug, "matched tickets:", b0?.total ?? 0);
          }
        }

        return out;
      } catch (err) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error("[OrganisationsTicketStats] Supabase aggregation failed:", err instanceof Error ? err.message : err);
        }
        const fallback: Record<
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
          const row = legacy[org.id];
          fallback[org.id] = {
            totalTickets: row?.totalTickets ?? 0,
            openTickets: row?.openTickets ?? 0,
            feCount: row?.feCount ?? 0,
            userCount: row?.userCount ?? 0,
            distinctClients: row?.distinctClients ?? 0,
            slaBreached: row?.slaBreached ?? 0,
          };
        }
        return fallback;
      }
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(organisations as Organisation[]).map((org) => {
              const s = statsLoading ? null : perOrgStats?.[org.id];
              return (
                <Card key={org.id} className="h-full border-border/60 shadow-sm transition-shadow hover:shadow-md flex flex-col">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <CardTitle className={typography.sectionTitle}>{org.name}</CardTitle>
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

          {organisations.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No tenants yet.
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
          }
        }}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Tenant</DialogTitle>
              <DialogDescription>
                Add a new tenant. Name and Short Name are required. Short Name will be stored lowercase with spaces replaced by hyphens.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="org-name">Tenant name</Label>
                <Input
                  id="org-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Acme Corp"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="org-slug">Short Name</Label>
                <Input
                  id="org-slug"
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value.replace(/\s+/g, "-").toLowerCase())}
                  placeholder="Enter short name"
                />
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
                  if (!name || !slug) return;
                  try {
                    await createOrgMutation.mutateAsync({
                      name,
                      slug,
                      incoming_emails: createIncomingEmails,
                      outgoing_emails: createOutgoingEmails,
                    });
                    toast({ title: "Tenant created", description: `${name} is now available. You can assign an admin next.` });
                    setCreateOpen(false);
                    setCreateName("");
                    setCreateSlug("");
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
