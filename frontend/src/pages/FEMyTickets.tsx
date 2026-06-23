import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { formatIST } from '@/lib/dateUtils';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ticket, TicketStatus } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusBadge } from '@/components/tickets/StatusBadge';
import { TicketPriorityBadge } from '@/components/tickets/TicketPriorityBadge';
import { priorityDisplayLabel, resolveTicketPriorityLevel } from '@/lib/priority';
import { toast } from '@/hooks/use-toast';
import { 
  Truck, 
  MapPin, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  LogOut,
  PlayCircle,
  Loader2,
  Ticket as TicketIcon,
  KeyRound,
  Lock,
  User,
  Search,
} from 'lucide-react';
import { fetchJson } from "@/lib/backendDataApi";

type FEActionTokenLite = {
  id: string;
  ticket_id: string;
  action_type: "ON_SITE" | "RESOLUTION";
  expires_at?: string;
};

type FETicketRow = Ticket & {
  client_name?: string | null;
  remarks?: string | null;
  /** Manager-selected due from ticket_assignments.assignment_due_at (optional). */
  assignment_due?: string | null;
  /** Who opened / reported the ticket (staff name + email when available). */
  reporter_display?: string | null;
  sla?: {
    assignment_deadline?: string | null;
    onsite_deadline?: string | null;
    resolution_deadline?: string | null;
    assignment_breached?: boolean | null;
    onsite_breached?: boolean | null;
    resolution_breached?: boolean | null;
  } | null;
  tokens?: {
    onSite?: {
      id: string;
      expires_at?: string;
      token_state?: string;
      used?: boolean;
      actionable?: boolean;
    } | null;
    resolution?: {
      id: string;
      expires_at?: string;
      token_state?: string;
      used?: boolean;
      actionable?: boolean;
    } | null;
  } | null;
  resolution_locked?: boolean;
  creator_display?: string | null;
  // Backward compatibility (older payload variants)
  active_fe_tokens?: FEActionTokenLite[];
};

/** Active work first; other statuses follow. */
const FE_TICKET_STATUS_ORDER: Partial<Record<TicketStatus, number>> = {
  ON_SITE: 0,
  EN_ROUTE: 1,
  ASSIGNED: 2,
  OPEN: 3,
};
const FE_TICKET_STATUS_ORDER_DEFAULT = 4;

const FE_STATUS_FILTERS: { id: 'all' | TicketStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'OPEN', label: 'Open' },
  { id: 'ASSIGNED', label: 'Assigned' },
  { id: 'EN_ROUTE', label: 'En Route' },
  { id: 'ON_SITE', label: 'On Site' },
  { id: 'RESOLVED_PENDING_VERIFICATION', label: 'Resolved Pending Verification' },
  { id: 'RESOLVED', label: 'Resolved' },
  { id: 'REOPENED', label: 'Reopened' },
  { id: 'FE_ATTEMPT_FAILED', label: 'Failed' },
];

function ticketRecencyMs(ticket: FETicketRow): number {
  const created = ticket.created_at ? new Date(ticket.created_at).getTime() : NaN;
  const updated = ticket.updated_at ? new Date(ticket.updated_at).getTime() : NaN;
  const c = Number.isFinite(created) ? created : 0;
  const u = Number.isFinite(updated) ? updated : 0;
  return Math.max(c, u);
}

function compareFETickets(a: FETicketRow, b: FETicketRow): number {
  const pa = FE_TICKET_STATUS_ORDER[a.status] ?? FE_TICKET_STATUS_ORDER_DEFAULT;
  const pb = FE_TICKET_STATUS_ORDER[b.status] ?? FE_TICKET_STATUS_ORDER_DEFAULT;
  if (pa !== pb) return pa - pb;
  return ticketRecencyMs(b) - ticketRecencyMs(a);
}

function matchesFETicketSearch(ticket: FETicketRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystacks = [
    ticket.ticket_number,
    ticket.vehicle_number,
    ticket.complaint_id,
    ticket.location,
  ];
  return haystacks.some((v) => v != null && String(v).toLowerCase().includes(q));
}

export default function FEMyTickets() {
  const { user, userProfile, signOut, isFieldExecutive, isClient, session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');

  // Redirect non-FE users once profile is available.
  useEffect(() => {
    if (!userProfile || isFieldExecutive) return;
    navigate(isClient ? "/app/client" : "/app", { replace: true });
  }, [userProfile, isFieldExecutive, isClient, navigate]);

  // Fetch FE's assigned tickets using email match to field_executives
  const {
    data: tickets,
    isLoading: ticketsLoading,
    isError: ticketsError,
    error: ticketsErrorObj,
  } = useQuery({
    queryKey: ['fe-my-tickets', user?.email],
    queryFn: async () => {
      const res = await fetchJson<{ items: FETicketRow[] }>(`/fe/me/tickets`);
      return (res.items ?? []) as FETicketRow[];
    },
    // Wait for profile, role, and access token so we do not call CRM with no Authorization (401 → UI looked like "no tickets").
    enabled: Boolean(
      userProfile?.id && isFieldExecutive && session?.access_token
    ),
  });

  const displayedTickets = useMemo(() => {
    const list = tickets ?? [];
    const filtered = list.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      return matchesFETicketSearch(t, searchQuery);
    });
    return [...filtered].sort(compareFETickets);
  }, [tickets, searchQuery, statusFilter]);

  // Mutation to update ticket status
  const updateStatus = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: TicketStatus }) => {
      const action =
        status === "ON_SITE"
          ? "MARK_ON_SITE"
          : status === ("RESOLVED_PENDING_VERIFICATION" as TicketStatus)
            ? "MARK_WORK_COMPLETE"
            : null;
      if (!action) throw new Error("Unsupported status action");
      return await fetchJson<Ticket>(`/fe/tickets/${encodeURIComponent(ticketId)}/status-action`, {
        method: "POST",
        body: { action },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fe-my-tickets'] });
      toast({
        title: 'Status updated',
        description: 'The ticket status has been updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update status. Please try again.',
        variant: 'destructive',
      });
      console.error('Update status error:', error);
    },
  });

  const handleAcknowledge = (ticketId: string) => {
    updateStatus.mutate({ ticketId, status: 'ON_SITE' });
  };

  const handleMarkComplete = (ticketId: string) => {
    updateStatus.mutate({ ticketId, status: 'RESOLVED_PENDING_VERIFICATION' as TicketStatus });
  };

  const getActionButton = (ticket: FETicketRow) => {
    switch (ticket.status) {
      case 'ASSIGNED':
        return (
          <Button 
            onClick={() => handleAcknowledge(ticket.id)}
            disabled={updateStatus.isPending}
            className="w-full"
          >
            {updateStatus.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 h-4 w-4" />
            )}
            Mark as On Site
          </Button>
        );
      case 'ON_SITE':
        return (
          <Button 
            onClick={() => handleMarkComplete(ticket.id)}
            disabled={updateStatus.isPending}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {updateStatus.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Mark Work Complete
          </Button>
        );
      case 'RESOLVED_PENDING_VERIFICATION':
        return (
          <Badge variant="outline" className="w-full justify-center py-2 border-amber-500 text-amber-600">
            <Clock className="mr-2 h-4 w-4" />
            Awaiting Service Manager Verification
          </Badge>
        );
      default:
        return null;
    }
  };

  const fmtMaybe = (v?: string | null) => (v && String(v).trim() ? String(v) : "Not provided");
  const fmtDeadline = (iso?: string | null) => {
    if (!iso) return "Not provided";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Not provided";
    return d.toLocaleString();
  };

  if (!isFieldExecutive && userProfile) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: 'hsl(285 45% 12%)' }}>
      {/* Header */}
      <header className="border-b px-3 md:px-6 py-4" style={{ borderColor: 'hsl(285 35% 20%)', background: 'hsl(285 45% 16%)' }}>
        <div className="w-full md:max-w-4xl md:mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <img
                  src="/sahaya-logo.png"
                  alt="Sahaya"
                  className="h-9 w-auto object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
                <div
                  className="hidden h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg, hsl(32 95% 48%), hsl(32 95% 55%))" }}
                >
                  S
                </div>
                <div className="leading-none">
                  <h1 className="text-base font-extrabold text-white">Sahaya</h1>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">By Pariskq</p>
                </div>
              </div>
              <p className="mt-1 text-xs text-white/60">Field Executive Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-white">{userProfile?.name || user?.email}</p>
              <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                <Truck className="mr-1 h-3 w-3" />
                Field Executive
              </Badge>
            </div>
            <Button variant="ghost" size="icon" asChild className="text-white/70 hover:text-white hover:bg-white/10">
              <Link to="/change-password" title="Change password">
                <KeyRound className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} className="text-white/70 hover:text-white hover:bg-white/10">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full md:max-w-4xl md:mx-auto px-3 md:px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">My Assigned Tickets</h2>
          <p className="text-white/60">
            Open each ticket to see full details. Use the On-Site and Resolution links to upload proof — that is the
            supported workflow.
          </p>
        </div>

        {/* Info Alert */}
        <Alert className="mb-6 border-primary/30 bg-primary/10">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <AlertDescription className="text-white/80">
            <strong>Workflow:</strong> Use the <strong>On-Site</strong> and <strong>Resolution</strong> links below (or
            from your assignment email) to upload proof. Resolution stays locked until on-site proof is completed. If
            links are missing, contact your supervisor — direct status shortcuts are only shown when no action tokens are
            available.
          </AlertDescription>
        </Alert>

        {/* Tickets Grid */}
        {ticketsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : ticketsError ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Could not load assigned tickets.{' '}
              {ticketsErrorObj instanceof Error ? ticketsErrorObj.message : 'Request failed.'}{' '}
              If this persists, open Network → find <span className="font-mono">fe/me/tickets</span> and
              check status (401 = missing session token; wrong host = update VITE_CRM_API_URL / CSP).
            </AlertDescription>
          </Alert>
        ) : !tickets?.length ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <TicketIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Assigned Tickets</h3>
              <p className="text-muted-foreground max-w-sm">
                You don't have any tickets assigned to you yet. Check back later or contact your supervisor.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-6 space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ticket number, vehicle, complaint ID, location…"
                  className="pl-9 bg-white/95 border-white/20"
                  aria-label="Search tickets"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {FE_STATUS_FILTERS.map((f) => {
                  const active = statusFilter === f.id;
                  return (
                    <Button
                      key={f.id}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      className={
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white'
                      }
                      onClick={() => setStatusFilter(f.id)}
                    >
                      {f.label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-white/60">
                Showing {displayedTickets.length} of {tickets.length} ticket
                {tickets.length === 1 ? '' : 's'}
                {statusFilter !== 'all' || searchQuery.trim()
                  ? ' (filtered — active work listed first)'
                  : ' (active work listed first)'}
              </p>
            </div>

            {displayedTickets.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <h3 className="text-lg font-semibold mb-2">No matching tickets</h3>
                  <p className="text-muted-foreground max-w-sm text-sm">
                    Try a different search or status filter.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                  >
                    Clear filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
          <div className="grid gap-4">
            {displayedTickets.map((ticket) => (
              <Card key={ticket.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Button variant="link" className="h-auto p-0 font-mono text-lg text-left" asChild>
                        <Link to={`/fe/ticket/${encodeURIComponent(ticket.id)}`}>{ticket.ticket_number}</Link>
                      </Button>
                      <p className="text-sm text-muted-foreground mt-1">
                        Created {formatIST(ticket.created_at, 'PPp')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <TicketPriorityBadge
                            priority={ticket.priority}
                            priority_level={ticket.priority_level}
                          />
                          {priorityDisplayLabel(resolveTicketPriorityLevel(ticket))}
                        </span>
                        <Badge variant="secondary">
                          Client: {fmtMaybe(ticket.client_name ?? ticket.client_slug)}
                        </Badge>
                      </div>
                    </div>
                    <StatusBadge status={ticket.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Work-order details */}
                  <div className="grid gap-3 text-sm">
                    {ticket.reporter_display && String(ticket.reporter_display).trim() !== "" && (
                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-muted-foreground">Reported by</p>
                          <p className="font-medium break-words">{ticket.reporter_display}</p>
                        </div>
                      </div>
                    )}
                    {ticket.creator_display && String(ticket.creator_display).trim() !== "" && (
                      <div className="flex items-start gap-2">
                        <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-muted-foreground">Created / opened by</p>
                          <p className="font-medium break-words">{ticket.creator_display}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-muted-foreground">Issue</p>
                        <p className="font-medium break-words">
                          {fmtMaybe(ticket.category)}{ticket.issue_type ? ` · ${ticket.issue_type}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-muted-foreground">Location / Address</p>
                        <p className="font-medium break-words">{fmtMaybe(ticket.location)}</p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm text-muted-foreground">Vehicle / Device</p>
                      <p className="font-mono font-semibold break-words">{fmtMaybe(ticket.vehicle_number)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm text-muted-foreground">Remarks / Description</p>
                      <p className="text-sm whitespace-pre-wrap break-words">{fmtMaybe(ticket.remarks)}</p>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                      <p className="text-sm font-medium">Assignment &amp; SLA</p>
                      {ticket.assignment_due && String(ticket.assignment_due).trim() !== "" ? (
                        <p className="text-xs text-muted-foreground">
                          Manager-set assignment due: {fmtDeadline(ticket.assignment_due)}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Assignment (SLA): {fmtDeadline(ticket.sla?.assignment_deadline)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        On-Site: {fmtDeadline(ticket.sla?.onsite_deadline)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Resolution: {fmtDeadline(ticket.sla?.resolution_deadline)}
                      </p>
                    </div>
                  </div>

                  {/* Token-first actions + optional legacy fallback */}
                  <div className="pt-2 space-y-3">
                    {(() => {
                      const legacyToks = ticket.active_fe_tokens ?? [];
                      const onSiteTok = ticket.tokens?.onSite;
                      const resTok = ticket.tokens?.resolution;
                      const onSiteId =
                        onSiteTok?.id ?? legacyToks.find((x) => x.action_type === "ON_SITE")?.id ?? null;
                      const resolutionId =
                        resTok?.id ?? legacyToks.find((x) => x.action_type === "RESOLUTION")?.id ?? null;
                      const onSiteActionable = Boolean(onSiteId && onSiteTok?.actionable !== false);
                      const resolutionActionable = Boolean(
                        resolutionId &&
                          resTok?.actionable !== false &&
                          !ticket.resolution_locked
                      );
                      const hasTokenLinks = Boolean(onSiteId || resolutionId);
                      const hasAnyTokenWorkflow =
                        hasTokenLinks || legacyToks.some((x) => Boolean(x?.id));

                      return (
                        <>
                          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
                            <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                              On-Site &amp; Resolution (token workflow)
                            </p>
                            {onSiteId ? (
                              <Button
                                type="button"
                                disabled={!onSiteActionable}
                                onClick={() => {
                                  if (!onSiteActionable) return;
                                  navigate(`/fe/action/${onSiteId}`);
                                }}
                                className="w-full bg-primary hover:bg-primary/90 font-semibold disabled:opacity-60"
                              >
                                {onSiteActionable
                                  ? "On-Site — open proof page"
                                  : "On-site (submitted or link expired)"}
                              </Button>
                            ) : (
                              <p className="text-xs text-muted-foreground">On-site token not available for this ticket.</p>
                            )}

                            {resolutionId ? (
                              <>
                                <Button
                                  type="button"
                                  onClick={() => {
                                    if (!resolutionActionable) return;
                                    navigate(`/fe/action/${resolutionId}`);
                                  }}
                                  disabled={!resolutionActionable}
                                  variant={!resolutionActionable ? "secondary" : "default"}
                                  className="w-full font-semibold disabled:opacity-60"
                                >
                                  {!resolutionActionable ? (
                                    <span className="inline-flex items-center justify-center gap-2">
                                      <Lock className="h-4 w-4" aria-hidden />
                                      {ticket.resolution_locked
                                        ? "Resolution locked"
                                        : "Resolution (unavailable)"}
                                    </span>
                                  ) : (
                                    "Resolution — open proof page"
                                  )}
                                </Button>
                                <p className="text-[11px] text-muted-foreground">
                                  {ticket.resolution_locked
                                    ? "Complete on-site proof first; then this link unlocks."
                                    : resTok?.used
                                      ? "This resolution token was already used."
                                      : "Unlocked — you can open the resolution proof page."}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground">Resolution token not available yet.</p>
                            )}
                          </div>

                          {!hasAnyTokenWorkflow && (
                            <Alert className="border-amber-500/50 bg-amber-500/10">
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                              <AlertDescription className="text-sm text-amber-950 dark:text-amber-100">
                                No action tokens were returned for this ticket. Check your assignment email for links, or
                                use the actions below if your tenant still allows direct status updates.
                              </AlertDescription>
                            </Alert>
                          )}

                          {legacyToks
                            .filter((tok) => tok.id && tok.id !== onSiteId && tok.id !== resolutionId)
                            .map((tok) => (
                              <Button
                                key={tok.id}
                                type="button"
                                variant="outline"
                                onClick={() => navigate(`/fe/action/${tok.id}`)}
                                className="w-full"
                              >
                                {tok.action_type === "ON_SITE" ? "On-Site" : "Resolution"} proof link
                              </Button>
                            ))}

                          {!hasAnyTokenWorkflow ? getActionButton(ticket) : null}
                          {hasAnyTokenWorkflow ? (
                            <p className="text-[11px] text-muted-foreground text-center">
                              Direct “Mark as On Site / Work Complete” shortcuts are hidden while action tokens exist — use
                              the links above.
                            </p>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>

                </CardContent>
              </Card>
            ))}
          </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
