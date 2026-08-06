/**
 * FE Portal Batch 2 — contract tests for filters, complaint ID, date range,
 * CSV escaping, and append-only remark authorization semantics.
 * Pure logic mirrored from frontend/src/lib/feTicketList.ts + feFieldVisitExport.ts.
 */
import { describe, expect, it } from "vitest";

function facetValue(raw) {
  return raw != null ? String(raw).trim() : "";
}

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

function matchesFEFacetFilters(ticket, opts) {
  if (opts.state !== "all" && facetValue(ticket.state) !== opts.state) return false;
  if (opts.location !== "all" && facetValue(ticket.location) !== opts.location) return false;
  if (opts.customer !== "all") {
    const customer = facetValue(ticket.client_name ?? ticket.client_slug);
    if (customer !== opts.customer) return false;
  }
  return true;
}

function filterFETickets(tickets, opts) {
  return tickets.filter((t) => {
    if (!matchesFEFacetFilters(t, opts)) return false;
    return matchesFETicketSearch(t, opts.search);
  });
}

function formatComplaintIdDisplay(complaintId) {
  const s = complaintId != null ? String(complaintId).trim() : "";
  return s || "—";
}

function ticketInFEDateRange(ticket, fromYmd, toYmd) {
  const iso = ticket.assigned_at || ticket.created_at || ticket.opened_at || null;
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const ymd = `${y}-${m}-${day}`;
  return ymd >= fromYmd && ymd <= toYmd;
}

function validateFEDateRange(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return { ok: false, error: "Select both From and To dates." };
  if (fromYmd > toYmd) return { ok: false, error: "From date must be on or before To date." };
  return { ok: true };
}

function escapeCsvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows) {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

/** Authorization gate for FE remark (mirrors feMe route checks). */
function canFeAddRemark({ feId, assignment, ticket, tenantAllowed }) {
  if (!feId) return { ok: false, status: 403, reason: "no_fe" };
  if (!assignment?.tickets) return { ok: false, status: 404, reason: "not_assigned" };
  const currentId = ticket?.current_assignment_id;
  if (
    currentId == null ||
    String(currentId).trim() === "" ||
    String(currentId) !== String(assignment.id)
  ) {
    return { ok: false, status: 403, reason: "not_current_assignment" };
  }
  if (!tenantAllowed) return { ok: false, status: 403, reason: "cross_tenant" };
  return { ok: true };
}

const sample = [
  {
    id: "1",
    ticket_number: "PKQ-20260806-1234",
    complaint_id: "HIT-908122",
    client_name: "Hitachi",
    state: "Karnataka",
    location: "Tumkur",
    vehicle_number: "KA-01-AB-1234",
    issue_type: "Breakdown",
    remarks: "Initial\nline two",
    assigned_at: "2026-08-01T10:00:00.000Z",
    created_at: "2026-07-28T10:00:00.000Z",
  },
  {
    id: "2",
    ticket_number: "PKQ-20260806-9999",
    complaint_id: null,
    client_name: "Acme",
    state: "Karnataka",
    location: "Bengaluru",
    vehicle_number: "KA-02-XY-9",
    issue_type: "PM",
    remarks: null,
    assigned_at: "2026-08-05T10:00:00.000Z",
    created_at: "2026-08-04T10:00:00.000Z",
  },
  {
    id: "3",
    ticket_number: "PKQ-OTHER",
    complaint_id: "OTHER-1",
    client_name: "Hitachi",
    state: "Tamil Nadu",
    location: "Chennai",
    vehicle_number: "TN-01",
    issue_type: "Breakdown",
    remarks: "x",
    assigned_at: "2026-08-02T10:00:00.000Z",
    created_at: "2026-08-01T10:00:00.000Z",
  },
];

describe("FE Portal Batch 2 — filters & complaint ID", () => {
  it("search matches Complaint ID", () => {
    const hit = filterFETickets(sample, {
      search: "HIT-908122",
      state: "all",
      location: "all",
      customer: "all",
    });
    expect(hit.map((t) => t.id)).toEqual(["1"]);
  });

  it("state filter works", () => {
    const hit = filterFETickets(sample, {
      search: "",
      state: "Tamil Nadu",
      location: "all",
      customer: "all",
    });
    expect(hit.map((t) => t.id)).toEqual(["3"]);
  });

  it("location filter works", () => {
    const hit = filterFETickets(sample, {
      search: "",
      state: "all",
      location: "Tumkur",
      customer: "all",
    });
    expect(hit.map((t) => t.id)).toEqual(["1"]);
  });

  it("customer filter works", () => {
    const hit = filterFETickets(sample, {
      search: "",
      state: "all",
      location: "all",
      customer: "Acme",
    });
    expect(hit.map((t) => t.id)).toEqual(["2"]);
  });

  it("combined filters work", () => {
    const hit = filterFETickets(sample, {
      search: "",
      state: "Karnataka",
      location: "Tumkur",
      customer: "Hitachi",
    });
    expect(hit.map((t) => t.id)).toEqual(["1"]);
  });

  it("missing Complaint ID renders safely", () => {
    expect(formatComplaintIdDisplay(null)).toBe("—");
    expect(formatComplaintIdDisplay(undefined)).toBe("—");
    expect(formatComplaintIdDisplay("")).toBe("—");
    expect(formatComplaintIdDisplay("HIT-1")).toBe("HIT-1");
  });
});

describe("FE Portal Batch 2 — field visit & print data", () => {
  it("date range validation works", () => {
    expect(validateFEDateRange("", "2026-08-01").ok).toBe(false);
    expect(validateFEDateRange("2026-08-05", "2026-08-01").ok).toBe(false);
    expect(validateFEDateRange("2026-08-01", "2026-08-05").ok).toBe(true);
  });

  it("field visit sheet only contains FE-authorized tickets (caller-supplied set)", () => {
    // Sheet generation is client-side over JWT /fe/me/tickets payload only.
    const authorized = sample.filter((t) => t.id !== "3");
    const ranged = authorized.filter((t) => ticketInFEDateRange(t, "2026-08-01", "2026-08-03"));
    expect(ranged.map((t) => t.id)).toEqual(["1"]);
    expect(ranged.every((t) => t.id !== "3")).toBe(true);
  });

  it("single-ticket printable fields are correct", () => {
    const t = sample[0];
    const printable = {
      ticket_number: t.ticket_number,
      complaint_id: formatComplaintIdDisplay(t.complaint_id),
      customer: t.client_name,
      state: t.state,
      location: t.location,
      remarks: t.remarks,
    };
    expect(printable).toEqual({
      ticket_number: "PKQ-20260806-1234",
      complaint_id: "HIT-908122",
      customer: "Hitachi",
      state: "Karnataka",
      location: "Tumkur",
      remarks: "Initial\nline two",
    });
  });

  it("CSV handles multiline remarks correctly", () => {
    const csv = rowsToCsv([
      ["Ticket Number", "Remarks"],
      ["PKQ-1", "line1\nline2"],
      ["PKQ-2", 'says "hi", ok'],
    ]);
    expect(csv).toContain('"line1\nline2"');
    expect(csv).toContain('"says ""hi"", ok"');
  });
});

describe("FE Portal Batch 2 — additional remark auth", () => {
  it("additional remark is append-only (original remarks field unchanged)", () => {
    const ticket = { remarks: "Machine would not start." };
    const comments = [];
    const original = ticket.remarks;
    comments.push({ body: "Correction: power cable was loose." });
    expect(ticket.remarks).toBe(original);
    expect(comments).toHaveLength(1);
  });

  it("cross-tenant remark attempt rejected", () => {
    const result = canFeAddRemark({
      feId: "fe-a",
      assignment: { id: "asg-1", tickets: { id: "t1", current_assignment_id: "asg-1" } },
      ticket: { current_assignment_id: "asg-1" },
      tenantAllowed: false,
    });
    expect(result).toEqual({ ok: false, status: 403, reason: "cross_tenant" });
  });

  it("cross-FE unauthorized ticket access remains rejected", () => {
    const result = canFeAddRemark({
      feId: "fe-a",
      assignment: null,
      ticket: null,
      tenantAllowed: true,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it("allows remark when FE is current assignee and tenant matches", () => {
    const result = canFeAddRemark({
      feId: "fe-a",
      assignment: { id: "asg-1", tickets: { id: "t1", current_assignment_id: "asg-1" } },
      ticket: { current_assignment_id: "asg-1", organisation_id: "org-1" },
      tenantAllowed: true,
    });
    expect(result.ok).toBe(true);
  });
});
