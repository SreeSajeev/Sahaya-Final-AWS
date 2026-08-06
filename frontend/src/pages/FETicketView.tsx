import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useTicketComments } from "@/hooks/useTickets";
import { useFeMeTicketDetail } from "@/hooks/useFeMeTicketDetail";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { formatIST } from "@/lib/dateUtils";
import { StatusBadge } from "@/components/tickets/StatusBadge";
import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import type { TicketComment, TicketStatus } from "@/lib/types";
import { formatComplaintIdDisplay, type FETicketRow } from "@/lib/feTicketList";
import { openFETicketPrintWindow } from "@/lib/feTicketPrint";
import { fetchJson } from "@/lib/backendDataApi";
import { formatStateDisplay } from "@/lib/indianStates";
import { ArrowLeft, Lock, MapPin, Truck, FileText, Clock, User, Printer } from "lucide-react";

function fmtMaybe(v: unknown) {
  if (v == null) return "Not provided";
  const s = String(v).trim();
  return s === "" ? "Not provided" : s;
}

function fmtDeadline(iso: unknown) {
  if (iso == null || String(iso).trim() === "") return "Not provided";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "Not provided";
  return d.toLocaleString();
}

function commentLabel(c: TicketComment): string {
  const parts = [
    c.created_at ? formatIST(String(c.created_at), "p") : null,
    c.source || null,
  ].filter(Boolean);
  return parts.join(" — ") || "Remark";
}

export default function FETicketView() {
  const params = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const ticketId = params.ticketId ?? "";
  const { userProfile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const detailQuery = useFeMeTicketDetail(ticketId);
  const commentsQuery = useTicketComments(ticketId);

  const [remarkText, setRemarkText] = useState("");
  const [remarkBusy, setRemarkBusy] = useState(false);

  const comments = useMemo(
    () => (commentsQuery.data ?? []) as TicketComment[],
    [commentsQuery.data],
  );

  if (!ticketId) {
    return <div className="p-6 text-red-600">Invalid ticket.</div>;
  }

  if (detailQuery.isLoading) {
    return <div className="p-6">Loading…</div>;
  }

  if (!detailQuery.data) {
    return (
      <div className="p-6 space-y-4 max-w-lg mx-auto">
        <p className="text-red-600">Ticket not found or not assigned to you.</p>
        <Button variant="outline" asChild>
          <Link to="/fe">Back to My Tickets</Link>
        </Button>
      </div>
    );
  }

  const t = detailQuery.data;
  const onSiteTok = t.tokens?.onSite;
  const resTok = t.tokens?.resolution;
  const onSiteId = onSiteTok?.id ?? null;
  const resolutionId = resTok?.id ?? null;
  const resolutionLocked = Boolean(t.resolution_locked);
  const onSiteActionable = Boolean(onSiteId && onSiteTok?.actionable !== false);
  const resolutionActionable = Boolean(
    resolutionId && resTok?.actionable !== false && !resolutionLocked
  );

  const handlePrint = () => {
    openFETicketPrintWindow({
      ticket: t as unknown as FETicketRow,
      feName: userProfile?.name || user?.email,
      comments: comments.map((c) => ({
        at: c.created_at,
        source: c.source,
        author: c.author_id,
        body: c.body ?? "",
      })),
    });
  };

  const submitAdditionalRemark = async () => {
    const body = remarkText.trim();
    if (!body) {
      toast({ title: "Enter a remark", variant: "destructive" });
      return;
    }
    setRemarkBusy(true);
    try {
      await fetchJson(`/fe/me/tickets/${encodeURIComponent(ticketId)}/remarks`, {
        method: "POST",
        body: { body },
      });
      setRemarkText("");
      await queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      toast({ title: "Remark added", description: "Previous remarks are preserved." });
    } catch (err) {
      toast({
        title: "Could not add remark",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setRemarkBusy(false);
    }
  };

  return (
    <div className="p-6 w-full md:max-w-2xl md:mx-auto space-y-6">
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 print:hidden">
        <img
          src="/sahaya-logo.png"
          alt="Sahaya"
          className="h-8 w-auto object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        <div
          className="hidden h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, hsl(32 95% 48%), hsl(32 95% 55%))" }}
        >
          S
        </div>
        <div className="leading-none">
          <p className="text-sm font-extrabold text-foreground">Sahaya</p>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">By Pariskq</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/fe" className="inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            My tickets
          </Link>
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          Print / Download Ticket
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="font-mono text-xl">{fmtMaybe(t.ticket_number)}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Complaint ID:{" "}
                <span className="font-mono text-foreground">
                  {formatComplaintIdDisplay(t.complaint_id)}
                </span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Created {t.created_at ? formatIST(String(t.created_at), "PPp") : "—"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <TicketPriorityBadge priority={t.priority} priority_level={t.priority_level} />
                <Badge variant="secondary">Client: {fmtMaybe(t.client_name ?? t.client_slug)}</Badge>
              </div>
            </div>
            {t.status ? <StatusBadge status={t.status as TicketStatus} /> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-2">
            {t.reporter_display && String(t.reporter_display).trim() !== "" && (
              <p className="flex items-start gap-2">
                <User className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                <span>
                  <span className="text-muted-foreground">Reported by</span>
                  <br />
                  <span className="font-medium break-words">{String(t.reporter_display)}</span>
                </span>
              </p>
            )}
            {t.creator_display && String(t.creator_display).trim() !== "" && (
              <p className="flex items-start gap-2">
                <User className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                <span>
                  <span className="text-muted-foreground">Created / opened by</span>
                  <br />
                  <span className="font-medium break-words">{String(t.creator_display)}</span>
                </span>
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Category</span>
              <br />
              <span className="font-medium">{fmtMaybe(t.category)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Issue Type</span>
              <br />
              <span className="font-medium">{fmtMaybe(t.issue_type)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">State</span>
              <br />
              <span className="font-medium">{formatStateDisplay(t.state)}</span>
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
              <span>
                <span className="text-muted-foreground">Location</span>
                <br />
                <span className="font-medium break-words">{fmtMaybe(t.location)}</span>
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Vehicle / Device</span>
              <br />
              <span className="font-mono font-semibold">{fmtMaybe(t.vehicle_number)}</span>
            </p>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-muted-foreground text-xs flex items-center gap-1">
                <FileText className="h-3 w-3" /> Description
              </p>
              <p className="whitespace-pre-wrap break-words mt-1">
                {fmtMaybe(t.short_description)}
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-muted-foreground text-xs flex items-center gap-1">
                <FileText className="h-3 w-3" /> Initial Remarks
              </p>
              <p className="whitespace-pre-wrap break-words mt-1">{fmtMaybe(t.remarks)}</p>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" /> Assignment & SLA
            </p>
            <p className="text-xs text-muted-foreground">
              Assigned: {fmtDeadline(t.assigned_at)}
            </p>
            <p className="text-xs text-muted-foreground">
              Manager assignment due: {fmtDeadline(t.assignment_due)}
            </p>
            <p className="text-xs text-muted-foreground">
              Assignment SLA: {fmtDeadline((t.sla as { assignment_deadline?: string } | null)?.assignment_deadline)}
            </p>
            <p className="text-xs text-muted-foreground">
              On-Site SLA: {fmtDeadline((t.sla as { onsite_deadline?: string } | null)?.onsite_deadline)}
            </p>
            <p className="text-xs text-muted-foreground">
              Resolution SLA: {fmtDeadline((t.sla as { resolution_deadline?: string } | null)?.resolution_deadline)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5 print:hidden">
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Token workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {onSiteId ? (
            <Button
              type="button"
              className="w-full disabled:opacity-60"
              disabled={!onSiteActionable}
              onClick={() => {
                if (!onSiteActionable) return;
                navigate(`/fe/action/${onSiteId}`);
              }}
            >
              {onSiteActionable ? "On-Site — open proof page" : "On-site (submitted or link expired)"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">On-site token not available.</p>
          )}
          {resolutionId ? (
            <>
              <Button
                type="button"
                className="w-full disabled:opacity-60"
                variant={!resolutionActionable ? "secondary" : "default"}
                disabled={!resolutionActionable}
                onClick={() => {
                  if (!resolutionActionable) return;
                  navigate(`/fe/action/${resolutionId}`);
                }}
              >
                {!resolutionActionable ? (
                  <span className="inline-flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    {resolutionLocked ? "Resolution locked" : "Resolution (unavailable)"}
                  </span>
                ) : (
                  "Resolution — open proof page"
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {resolutionLocked
                  ? "Complete on-site proof first; then this link unlocks."
                  : resTok?.used
                    ? "This resolution token was already used."
                    : "Resolution proof is available."}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Resolution token not available.</p>
          )}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader className="py-3">
          <CardTitle className="text-base">Add Additional Remark</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Adds a new remark. Previous remarks are preserved.
          </p>
          <Textarea
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            placeholder="Correction or additional site note…"
            rows={4}
            className="whitespace-pre-wrap"
          />
          <Button
            type="button"
            disabled={remarkBusy || !remarkText.trim()}
            onClick={() => void submitAdditionalRemark()}
          >
            {remarkBusy ? "Saving…" : "Add Remark"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="font-semibold">Remarks & Activity</h3>
        {comments.length ? (
          comments.map((c) => (
            <div key={c.id} className="border-b py-2 text-sm">
              <p className="text-xs text-muted-foreground font-medium">{commentLabel(c)}</p>
              <p className="whitespace-pre-wrap break-words mt-1">{c.body || "—"}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No additional remarks yet.</p>
        )}
      </div>
    </div>
  );
}
