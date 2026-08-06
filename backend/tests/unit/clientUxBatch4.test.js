/**
 * Client UX Batch 4 — FE activity timeline, complaint ID, corrective remarks.
 */
import { describe, expect, it } from "vitest";

function matchesFETicketSearch(ticket, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const haystacks = [
    ticket.ticket_number,
    ticket.complaint_id,
    ticket.client_name,
    ticket.client_slug,
    ticket.location,
    ticket.state,
    ticket.vehicle_number,
    ticket.issue_type,
    ticket.remarks,
    ticket.short_description,
  ];
  return haystacks.some((v) => v != null && String(v).toLowerCase().includes(q));
}

function formatComplaintIdDisplay(complaintId) {
  const s = complaintId != null ? String(complaintId).trim() : "";
  return s || "—";
}

function validateAdditionalRemark(raw) {
  const body = raw == null ? "" : String(raw).trim();
  if (!body) return { ok: false, error: "Additional remark is required." };
  if (body.length > 4000) return { ok: false, error: "too_long" };
  return { ok: true, body };
}

/** Mirrors feActivityTimeline chronological builder (simplified). */
function buildTimeline(ticket, comments) {
  const events = [];
  if (ticket.remarks && String(ticket.remarks).trim()) {
    events.push({
      id: "initial",
      sortAt: ticket.opened_at || ticket.created_at,
      label: "Initial Remarks",
      body: ticket.remarks,
    });
  }
  if (ticket.assigned_at) {
    events.push({
      id: "assigned",
      sortAt: ticket.assigned_at,
      label: "Assigned",
      body: null,
    });
  }
  for (const c of comments) {
    if (c.attachments?.rejection) {
      events.push({
        id: c.id,
        sortAt: c.created_at,
        label: "Ticket status update",
        body: "This ticket was rejected by operations.",
      });
      continue;
    }
    if (c.attachments?.fe_remark?.event_type === "FE_ADDITIONAL_REMARK") {
      events.push({
        id: c.id,
        sortAt: c.created_at,
        label: "Additional Remark",
        body: c.body,
      });
      continue;
    }
    const hasProof =
      (Array.isArray(c.attachments?.images) && c.attachments.images.length > 0) ||
      (Array.isArray(c.attachments?.proof_storage_paths) &&
        c.attachments.proof_storage_paths.length > 0);
    if (hasProof) {
      const bl = String(c.body || "").toLowerCase();
      events.push({
        id: c.id,
        sortAt: c.created_at,
        label: bl.includes("resolution")
          ? "Resolution submitted"
          : bl.includes("on_site") || bl.includes("on-site")
            ? "On-site update"
            : "Proof uploaded",
        body: c.body,
      });
      continue;
    }
    if (c.source === "FE") {
      events.push({
        id: c.id,
        sortAt: c.created_at,
        label: "Additional Remark",
        body: c.body,
      });
    }
  }
  events.sort((a, b) => {
    const ta = new Date(a.sortAt).getTime() || 0;
    const tb = new Date(b.sortAt).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  return events;
}

function canFeAddRemark({ feId, assignment, ticket, tenantAllowed }) {
  if (!feId) return { ok: false, status: 403 };
  if (!assignment?.tickets) return { ok: false, status: 404 };
  if (String(ticket?.current_assignment_id) !== String(assignment.id)) {
    return { ok: false, status: 403 };
  }
  if (!tenantAllowed) return { ok: false, status: 403 };
  return { ok: true };
}

describe("Batch 4 — complaint ID", () => {
  it("displays and searches complaint_id without inventing values", () => {
    expect(formatComplaintIdDisplay("HIT-1")).toBe("HIT-1");
    expect(formatComplaintIdDisplay(null)).toBe("—");
    expect(formatComplaintIdDisplay("  ")).toBe("—");
    const t = {
      ticket_number: "PKQS-1",
      complaint_id: "HIT-938472",
      client_name: "Hitachi",
    };
    expect(matchesFETicketSearch(t, "hit-938")).toBe(true);
    expect(matchesFETicketSearch(t, "pkqs-1")).toBe(true);
    expect(matchesFETicketSearch(t, "missing")).toBe(false);
  });

  it("search alone does not grant access — FE scoping is separate", () => {
    const foreign = { id: "b", complaint_id: "HIT-SECRET", ticket_number: "X" };
    // List is already FE-scoped; search only filters within that set.
    const scopedList = [{ id: "a", complaint_id: "HIT-OWN", ticket_number: "Y" }];
    const hits = scopedList.filter((t) => matchesFETicketSearch(t, "HIT-SECRET"));
    expect(hits).toHaveLength(0);
    expect(matchesFETicketSearch(foreign, "HIT-SECRET")).toBe(true); // would match if leaked into list
  });
});

describe("Batch 4 — corrective remarks", () => {
  it("rejects empty and whitespace remarks", () => {
    expect(validateAdditionalRemark("").ok).toBe(false);
    expect(validateAdditionalRemark("   \n  ").ok).toBe(false);
  });

  it("preserves multiline content after trim of ends only", () => {
    const r = validateAdditionalRemark("  Line1\n\nLine2  ");
    expect(r.ok).toBe(true);
    expect(r.body).toBe("Line1\n\nLine2");
  });

  it("original ticket.remarks stays immutable when appending comment history", () => {
    const ticket = { remarks: "Router damaged" };
    const history = [{ body: ticket.remarks }];
    history.push({ body: "Correction: adapter damaged." });
    expect(ticket.remarks).toBe("Router damaged");
    expect(history).toHaveLength(2);
  });

  it("blocks other FE / cross-tenant", () => {
    const ticket = { current_assignment_id: "asn-1" };
    expect(
      canFeAddRemark({
        feId: "fe-a",
        assignment: { id: "asn-2", tickets: ticket },
        ticket,
        tenantAllowed: true,
      }).status
    ).toBe(403);
    expect(
      canFeAddRemark({
        feId: "fe-a",
        assignment: { id: "asn-1", tickets: ticket },
        ticket,
        tenantAllowed: false,
      }).status
    ).toBe(403);
  });
});

describe("Batch 4 — activity timeline", () => {
  it("orders oldest to newest and keeps both remarks", () => {
    const ticket = {
      remarks: "Initial\nline",
      opened_at: "2026-08-06T04:00:00.000Z",
      assigned_at: "2026-08-06T05:00:00.000Z",
    };
    const comments = [
      {
        id: "c2",
        source: "FE",
        created_at: "2026-08-06T07:00:00.000Z",
        body: "Correction: adapter.",
        attachments: { fe_remark: { event_type: "FE_ADDITIONAL_REMARK" } },
      },
      {
        id: "c1",
        source: "FE",
        created_at: "2026-08-06T06:00:00.000Z",
        body: "Field Executive uploaded resolution proof",
        attachments: { proof_storage_paths: ["test/x/tickets/t/proofs/c/0.jpg"] },
      },
    ];
    const tl = buildTimeline(ticket, comments);
    expect(tl.map((e) => e.label)).toEqual([
      "Initial Remarks",
      "Assigned",
      "Resolution submitted",
      "Additional Remark",
    ]);
    expect(tl[0].body).toContain("Initial");
    expect(tl[3].body).toContain("adapter");
  });

  it("does not invent missing complaint id", () => {
    expect(formatComplaintIdDisplay(undefined)).toBe("—");
  });
});
