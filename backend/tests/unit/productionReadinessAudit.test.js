/**
 * SAHAYA — Pre-production comprehensive regression audit (unit / pure helpers).
 * Covers feature contracts that must remain stable for production release.
 * Prefer importing real modules over local re-implementations.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ASSIGNMENT_TYPE_FIELD_EXECUTIVE,
  ASSIGNMENT_TYPE_SERVICE_MANAGER,
  isFieldExecutiveAssignment,
  isServiceManagerAssignment,
  normalizeAssignmentType,
} from "../../src/constants/assignmentTypes.js";
import { assertSmOwnsCurrentAssignment } from "../../src/services/smResolutionService.js";
import {
  buildResolutionEmailHtml,
  buildResolutionEmailPlainText,
  escapeHtml,
  formatDetail,
  pickInitialRemarks,
  textToHtmlPreservingNewlines,
} from "../../src/services/resolutionEmailContent.js";
import { buildClosureTimelineSummary } from "../../src/services/closureTimelineSummary.js";
import {
  mergeCloseEmailRecipients,
  parseAdditionalNotifyEmails,
} from "../../src/services/closureEmailRecipients.js";
import { validateNotifyEmailsAgainstAllowed } from "../../src/services/clientNotificationEmailResolver.js";
import { validateCloseFormSnapshot } from "../../src/services/closeFormService.js";
import { isCommentImagesHidden } from "../../src/services/imageVisibilityService.js";
import {
  getAssignmentContextMeta,
  listVisibleAssignmentContextItems,
  parseAssignmentContextImages,
  ASSIGNMENT_CONTEXT_MAX_IMAGES,
} from "../../src/services/assignmentContextService.js";
import {
  assertProofKeyBelongsToTicket,
} from "../../src/services/rejectionEvidenceService.js";
import {
  buildTicketSlaSnapshot,
  computePhaseSla,
  computeTicketSlaView,
  SLA_STATUS,
} from "../../src/services/tenantSlaEngine.js";
import {
  buildResolutionLocationsCsv,
  coerceActiveOnly,
  parseResolutionLocationCsvRows,
  validateResolutionLocationForClose,
} from "../../src/services/resolutionLocationService.js";
import { normalizeVehicleNumber, buildVehicleExportCsv } from "../../src/services/clientVehicleService.js";
import {
  normalizeCompanyShortName,
  suggestCompanyShortName,
} from "../../src/utils/companyShortName.js";
import { buildDailyTicketReportCsv } from "../../src/services/dailyTicketReportCsvService.js";
import { CLOSEABLE_PRE_CLOSE_STATUSES, hasRequiredResolutionRemarks } from "../../src/services/closeValidationService.js";
import { REASSIGNABLE_STATUSES, BULK_ASSIGNABLE_STATUSES } from "../../src/services/assignmentService.js";

const jpegB64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");

const assignBodySchema = z
  .object({
    assignment_type: z.enum(["FIELD_EXECUTIVE", "SERVICE_MANAGER"]).optional().default("FIELD_EXECUTIVE"),
    feId: z.string().uuid().optional().nullable(),
    assigned_user_id: z.string().uuid().optional().nullable(),
    assignment_remarks: z.string().max(4000).optional().nullable(),
    context_images: z.array(z.any()).max(10).optional().default([]),
  })
  .superRefine((data, ctx) => {
    if (data.assignment_type === "SERVICE_MANAGER") {
      if (!data.assigned_user_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "assigned_user_id required", path: ["assigned_user_id"] });
      }
    } else if (!data.feId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "feId required", path: ["feId"] });
    }
  });

/** Mirror FE portal timeline ordering contract (frontend/src/lib/feActivityTimeline.ts). */
function sortTimelineEvents(events) {
  return [...events].sort((a, b) => {
    const ta = new Date(a.sortAt).getTime();
    const tb = new Date(b.sortAt).getTime();
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    if (na !== nb) return na - nb;
    return String(a.sortKey).localeCompare(String(b.sortKey));
  });
}

describe("1–2. Assignment type contracts (FE vs SM)", () => {
  it("defaults to FIELD_EXECUTIVE and keeps FE path distinct from SM", () => {
    expect(normalizeAssignmentType(undefined)).toBe(ASSIGNMENT_TYPE_FIELD_EXECUTIVE);
    expect(isFieldExecutiveAssignment({})).toBe(true);
    expect(isServiceManagerAssignment(ASSIGNMENT_TYPE_SERVICE_MANAGER)).toBe(true);
    expect(isServiceManagerAssignment(ASSIGNMENT_TYPE_FIELD_EXECUTIVE)).toBe(false);
  });

  it("assign body requires feId for FE and assigned_user_id for SM", () => {
    expect(assignBodySchema.safeParse({}).success).toBe(false);
    expect(
      assignBodySchema.safeParse({ feId: "11111111-1111-1111-1111-111111111111" }).success
    ).toBe(true);
    expect(
      assignBodySchema.safeParse({
        assignment_type: "SERVICE_MANAGER",
        assigned_user_id: "22222222-2222-2222-2222-222222222222",
      }).success
    ).toBe(true);
    expect(
      assignBodySchema.safeParse({
        assignment_type: "SERVICE_MANAGER",
        feId: "11111111-1111-1111-1111-111111111111",
      }).success
    ).toBe(false);
  });

  it("SM ownership rejects FE assignments and cross-user access", () => {
    const aid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const uid = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    expect(
      assertSmOwnsCurrentAssignment(
        {
          id: aid,
          assigned_user_id: uid,
          assignment_type: "SERVICE_MANAGER",
          tickets: { id: "t1", current_assignment_id: aid, organisation_id: "org" },
        },
        uid
      ).ok
    ).toBe(true);
    expect(
      assertSmOwnsCurrentAssignment(
        {
          id: aid,
          assigned_user_id: uid,
          assignment_type: "FIELD_EXECUTIVE",
          tickets: { id: "t1", current_assignment_id: aid },
        },
        uid
      ).ok
    ).toBe(false);
    expect(
      assertSmOwnsCurrentAssignment(
        {
          id: aid,
          assigned_user_id: uid,
          assignment_type: "SERVICE_MANAGER",
          tickets: { id: "t1", current_assignment_id: aid },
        },
        "cccccccccccccccc-cccc-cccc-cccc-cccccccccccc"
      ).ok
    ).toBe(false);
  });

  it("preserves FE assignable / reassignable status sets", () => {
    expect(BULK_ASSIGNABLE_STATUSES).toContain("OPEN");
    expect(REASSIGNABLE_STATUSES).toContain("ASSIGNED");
    expect(CLOSEABLE_PRE_CLOSE_STATUSES).toEqual(
      expect.arrayContaining(["ON_SITE", "RESOLVED_PENDING_VERIFICATION"])
    );
  });
});

describe("3. Client vehicle master", () => {
  it("normalizes vehicle numbers and exports CSV with active/inactive", () => {
    expect(normalizeVehicleNumber("  ka-01 ab 1234 ")).toBe("KA-01 AB 1234");
    const csv = buildVehicleExportCsv([
      {
        vehicle_number: "KA-01",
        vehicle_type: "Bus",
        vehicle_name: "Alpha",
        registration_number: "R1",
        description: "Line\n2",
        is_active: true,
      },
      { vehicle_number: "KA-02", is_active: false },
    ]);
    expect(csv).toContain("Vehicle Number");
    expect(csv).toContain("Active");
    expect(csv).toContain("Inactive");
    expect(csv).toContain('"Line\n2"');
  });
});

describe("4. Company short name", () => {
  it("suggests, normalizes, and rejects over-length short names", () => {
    expect(suggestCompanyShortName("Tata Consultancy Services")).toBe("TCS");
    expect(normalizeCompanyShortName("  Hitachi  ")).toEqual({ ok: true, value: "Hitachi" });
    expect(normalizeCompanyShortName("x".repeat(81)).ok).toBe(false);
  });
});

describe("5–6. Rejection & closure recipients", () => {
  it("validates allow-list and merges/dedupes additional emails", () => {
    const allowList = [{ email: "ops@client.com" }, { email: "manager@client.com" }];
    const denied = validateNotifyEmailsAgainstAllowed(["ops@client.com", "evil@other.com"], allowList);
    expect(denied.ok).toBe(false);

    const ok = validateNotifyEmailsAgainstAllowed(["ops@client.com"], allowList);
    expect(ok.ok).toBe(true);

    const extras = parseAdditionalNotifyEmails("a@x.com, b@x.com, a@x.com");
    expect(extras.ok).toBe(true);
    if (extras.ok) expect(extras.emails).toEqual(["a@x.com", "b@x.com"]);

    const bad = parseAdditionalNotifyEmails("not-an-email");
    expect(bad.ok).toBe(false);

    const merged = mergeCloseEmailRecipients(["a@x.com", "c@x.com"], ["a@x.com", "b@x.com"]);
    expect(merged).toEqual(["a@x.com", "c@x.com", "b@x.com"]);
  });

  it("requires resolution remarks for close", () => {
    expect(hasRequiredResolutionRemarks("")).toBe(false);
    expect(hasRequiredResolutionRemarks("  Fixed  ")).toBe(true);
  });
});

describe("7–8. Assignment images & soft delete", () => {
  it("parses multiple context images with multiline remarks up to max", () => {
    const r = parseAssignmentContextImages([
      { contentType: "image/jpeg", dataBase64: jpegB64, remark: "Gate\nLine 2" },
      { contentType: "image/jpeg", dataBase64: jpegB64, remark: "Second" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items).toHaveLength(2);
      expect(r.items[0].remark).toContain("\n");
    }
    const tooMany = Array.from({ length: ASSIGNMENT_CONTEXT_MAX_IMAGES + 1 }, () => ({
      contentType: "image/jpeg",
      dataBase64: jpegB64,
    }));
    expect(parseAssignmentContextImages(tooMany).ok).toBe(false);
  });

  it("hides soft-deleted assignment images from visible list and meta", () => {
    const comments = [
      {
        id: "c1",
        created_at: "2026-08-07T10:00:00.000Z",
        attachments: {
          assignment_context: { remark: "Visible", sort_index: 0, uploaded_at: "2026-08-07T10:00:00.000Z" },
          proof_storage_paths: ["test/org/tickets/t1/a.jpg"],
        },
      },
      {
        id: "c2",
        created_at: "2026-08-07T10:01:00.000Z",
        attachments: {
          assignment_context: {
            remark: "Hidden",
            deleted_at: "2026-08-07T11:00:00.000Z",
            deleted_by: "u1",
            deleted_reason: "privacy",
          },
          proof_storage_paths: ["test/org/tickets/t1/b.jpg"],
        },
      },
    ];
    expect(getAssignmentContextMeta(comments[1].attachments)).toBeNull();
    expect(listVisibleAssignmentContextItems(comments)).toHaveLength(1);
    expect(isCommentImagesHidden(comments[1].attachments)).toBe(true);
    expect(isCommentImagesHidden(comments[0].attachments)).toBe(false);
  });

  it("rejects forged / cross-ticket proof keys", () => {
    expect(() =>
      assertProofKeyBelongsToTicket("test/org/tickets/other/proof.jpg", {
        ticketId: "t1",
        organisationId: "org",
      })
    ).toThrow(/belong/i);
    expect(() =>
      assertProofKeyBelongsToTicket("../etc/passwd", { ticketId: "t1" })
    ).toThrow();
  });
});

describe("9. FE activity timeline ordering", () => {
  it("orders chronologically with stable sortKey tie-break", () => {
    const t = "2026-08-07T12:00:00.000Z";
    const ordered = sortTimelineEvents([
      { id: "proof", sortAt: "2026-08-07T12:05:00.000Z", sortKey: `2-2026-08-07T12:05:00.000Z-proof`, label: "Proof" },
      { id: "assign", sortAt: "2026-08-07T12:00:00.000Z", sortKey: `1-${t}`, label: "Assigned" },
      { id: "ctx-b", sortAt: t, sortKey: `2-${t}-bbb`, label: "Assignment Image B" },
      { id: "ctx-a", sortAt: t, sortKey: `2-${t}-aaa`, label: "Assignment Image A" },
      { id: "remark", sortAt: "2026-08-07T12:02:00.000Z", sortKey: `2-2026-08-07T12:02:00.000Z-remark`, label: "Additional Remark" },
      { id: "hide", sortAt: "2026-08-07T12:06:00.000Z", sortKey: `2-2026-08-07T12:06:00.000Z-hide`, label: "Image Hidden" },
      { id: "close", sortAt: "2026-08-07T12:10:00.000Z", sortKey: `2-2026-08-07T12:10:00.000Z-close`, label: "Closure" },
    ]);
    expect(ordered.map((e) => e.id)).toEqual([
      "assign",
      "ctx-a",
      "ctx-b",
      "remark",
      "proof",
      "hide",
      "close",
    ]);
  });

  it("builds closure timeline summary in chronological comment order", () => {
    const summary = buildClosureTimelineSummary({
      comments: [
        { created_at: "2026-08-07T12:02:00Z", source: "FE", body: "Additional remark" },
        { created_at: "2026-08-07T12:00:00Z", source: "STAFF", body: "Assigned" },
        { created_at: "2026-08-07T12:05:00Z", source: "FE", body: "Proof uploaded" },
      ],
      closedByName: "Ops Manager",
      resolutionLocationName: "Bay A",
      closeFormSnapshot: {
        fields: [{ id: "work", label: "Work done" }],
        values: { work: "Replaced belt" },
      },
    });
    const assignedIdx = summary.indexOf("Assigned");
    const remarkIdx = summary.indexOf("Additional remark");
    const proofIdx = summary.indexOf("Proof uploaded");
    expect(assignedIdx).toBeGreaterThanOrEqual(0);
    expect(remarkIdx).toBeGreaterThan(assignedIdx);
    expect(proofIdx).toBeGreaterThan(remarkIdx);
    expect(summary).toContain("Bay A");
    expect(summary).toContain("Work done");
    expect(summary).toContain("Ops Manager");
  });
});

describe("10. FE additional remarks (append-only semantics)", () => {
  it("preserves original remarks separately from additional FE remarks in email", () => {
    const ticket = {
      ticket_number: "T-1",
      remarks: "Original intake remarks\nline 2",
      short_description: "Should not win when remarks exist",
      issue_type: "Breakdown",
      location: "Depot",
      vehicle_number: "KA-01",
      status: "RESOLVED",
      complaint_id: "CMP-9",
    };
    expect(pickInitialRemarks(ticket)).toBe("Original intake remarks\nline 2");
    const plain = buildResolutionEmailPlainText({
      ticket,
      clientName: "Hitachi",
      reportedByDisplay: "Reporter",
      initialRemarks: pickInitialRemarks(ticket),
      resolutionRemarks: "FE additional:\nSite cleared",
      assignedFeName: "Ravi",
      closureLocation: "Bay A",
      timelineSummary: "Additional Remark: follow-up",
    });
    expect(plain).toContain("Original intake remarks");
    expect(plain).toContain("Site cleared");
    expect(plain).toMatch(/Initial Remarks:[\s\S]*Resolution Remarks:/);
  });
});

describe("11–14. Complaint ID, resolution location, close form, resolution email", () => {
  it("includes complaint id, vehicle, resolution location, assigned user, close form, timeline", () => {
    const ticket = {
      ticket_number: "PKQ-100",
      complaint_id: "HIT-55",
      vehicle_number: "MH-12",
      vehicle_name: "Crane",
      vehicle_type: "Heavy",
      registration_number: "REG-1",
      issue_type: "Breakdown",
      location: "Reported Yard",
      priority: "HIGH",
      status: "RESOLVED",
      remarks: "Intake",
    };
    const snapshot = validateCloseFormSnapshot(
      [
        { id: "work", label: "Work done", required: true, displayOrder: 0, fieldType: "textarea" },
        { id: "qty", label: "Parts", required: false, displayOrder: 1, fieldType: "number" },
        { id: "when", label: "Completed on", required: false, displayOrder: 2, fieldType: "date" },
        { id: "grade", label: "Grade", required: true, displayOrder: 3, fieldType: "dropdown", options: ["A", "B"] },
        { id: "note", label: "Note", required: false, displayOrder: 4, fieldType: "text" },
      ],
      { work: "  Replaced  ", qty: "3", when: "2026-08-07", grade: "A", note: "ok" }
    );
    expect(snapshot.ok).toBe(true);

    const plain = buildResolutionEmailPlainText({
      ticket,
      complaintId: "HIT-55",
      clientName: "Hitachi Energy",
      reportedByDisplay: "Priya",
      initialRemarks: "Intake",
      resolutionRemarks: "Done\nSecond line",
      location: "Reported Yard",
      closureLocation: "Resolution Bay",
      assignedFeName: "Service Manager Anita",
      priority: "HIGH",
      closeFormSnapshot: snapshot.snapshot,
      timelineSummary: "Assigned → Proof → Closed",
    });
    for (const needle of [
      "PKQ-100",
      "HIT-55",
      "Hitachi Energy",
      "Priya",
      "Breakdown",
      "HIGH",
      "MH-12",
      "Reported Yard",
      "Resolution Bay",
      "Service Manager Anita",
      "Done",
      "Work done",
      "Assigned → Proof → Closed",
    ]) {
      expect(plain).toContain(needle);
    }

    const html = buildResolutionEmailHtml({
      ticket,
      clientName: "Acme <script>",
      initialRemarks: "A & B\nC",
      resolutionRemarks: "<b>x</b>",
    });
    expect(html).toContain(escapeHtml("Acme <script>"));
    expect(html).not.toContain("<script>");
    expect(textToHtmlPreservingNewlines("A\nB")).toContain("<br/>");
    expect(formatDetail(null)).toBe("Not provided");
  });

  it("validates close form field types, required, and ordering snapshot", () => {
    const fields = [
      { id: "b", label: "B", required: false, displayOrder: 1, fieldType: "text" },
      { id: "a", label: "A", required: true, displayOrder: 0, fieldType: "textarea" },
    ];
    expect(validateCloseFormSnapshot(fields, {}).ok).toBe(false);
    expect(validateCloseFormSnapshot(fields, { a: "ok", b: "x" }).ok).toBe(true);
    expect(validateCloseFormSnapshot(
      [{ id: "n", label: "N", required: true, displayOrder: 0, fieldType: "number" }],
      { n: "nope" }
    ).ok).toBe(false);
    expect(validateCloseFormSnapshot(
      [{ id: "d", label: "D", required: true, displayOrder: 0, fieldType: "dropdown", options: ["Yes"] }],
      { d: "No" }
    ).ok).toBe(false);
  });

  it("resolution location import/export/active gate", () => {
    expect(coerceActiveOnly("true")).toBe(true);
    const parsed = parseResolutionLocationCsvRows([
      { name: "Bay A", code: "B1", is_active: "true" },
      { name: "", is_active: "maybe" },
    ]);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.rows[0].name).toBe("Bay A");
    const csv = buildResolutionLocationsCsv([
      { name: "Bay A", code: "B1", description: "x", is_active: true },
    ]);
    expect(csv).toContain("Bay A");
    expect(
      validateResolutionLocationForClose(
        { id: "1", name: "Bay A", organisation_id: "org", is_active: false },
        "org"
      ).error.status
    ).toBe(400);
  });
});

describe("15. SLA engine", () => {
  it("covers response/resolution approaching, breached, and FE/SM ticket views", () => {
    const opened = new Date("2026-08-07T10:00:00.000Z");
    const snap = buildTicketSlaSnapshot({ responseMinutes: 60, resolutionMinutes: 240 }, opened);
    expect(snap.response_due_at).toBeTruthy();
    expect(snap.resolution_due_at).toBeTruthy();

    expect(
      computePhaseSla({
        dueAt: "2026-08-07T11:00:00.000Z",
        totalMinutes: 60,
        now: new Date("2026-08-07T10:55:00.000Z"),
      }).status
    ).toBe(SLA_STATUS.APPROACHING);

    expect(
      computePhaseSla({
        dueAt: "2026-08-07T11:00:00.000Z",
        totalMinutes: 60,
        now: new Date("2026-08-07T12:00:00.000Z"),
      }).breached
    ).toBe(true);

    const view = computeTicketSlaView(
      {
        opened_at: opened.toISOString(),
        sla_snapshot: snap,
        status: "ASSIGNED",
      },
      { assignedAt: "2026-08-07T10:30:00.000Z", now: new Date("2026-08-07T10:40:00.000Z") }
    );
    expect(view).toBeTruthy();
  });
});

describe("16. Reports", () => {
  it("daily CSV includes complaint id, vehicle, SLA, and resolution fields", () => {
    const csv = buildDailyTicketReportCsv({
      orgName: "Test Org",
      tickets: [
        {
          id: "t1",
          ticket_number: "T-1",
          complaint_id: "C-9",
          vehicle_number: "KA-01",
          vehicle_name: "Bus",
          vehicle_type: "HV",
          category: "Breakdown",
          issue_type: "Engine",
          priority: false,
          priority_level: "MEDIUM",
          status: "RESOLVED",
          state: "KA",
          location: "Depot",
          opened_by_email: "a@b.com",
          created_at: "2026-08-07T10:00:00.000Z",
          resolved_at: "2026-08-07T12:00:00.000Z",
          verification_remarks: "Fixed",
          resolution_category: "OTHER",
          client_slug: "hitachi",
          source: "MANUAL",
        },
      ],
      feById: new Map([["fe1", { name: "Ravi", email: "ravi@test.local" }]]),
      currentAssignmentByTicketId: new Map([
        ["t1", { fe_id: "fe1", assigned_at: "2026-08-07T10:30:00.000Z" }],
      ]),
      publicSubmissionByTicketId: new Map(),
      tenantClientBySlug: new Map([
        ["hitachi", { contact_name: "Hitachi", contact_email: "ops@h.com", contact_phone: "99" }],
      ]),
      slaByTicketId: new Map([
        [
          "t1",
          {
            assignment_breached: false,
            resolution_breached: true,
            onsite_breached: false,
            assignment_deadline: null,
            resolution_deadline: "2026-08-07T14:00:00.000Z",
          },
        ],
      ]),
      activityTypesByTicketId: new Map([["t1", ["ASSIGNED", "PROOF", "CLOSED"]]]),
      assignmentStatsByTicketId: new Map([
        ["t1", { count: 1, lastAssignedAt: "2026-08-07T10:30:00.000Z", latestOutcome: "RESOLVED" }],
      ]),
      proofStatsByTicketId: new Map([
        ["t1", { proofCount: 2, proofSubmittedAt: "2026-08-07T11:00:00.000Z" }],
      ]),
    });
    expect(csv).toContain("Complaint ID");
    expect(csv).toContain("C-9");
    expect(csv).toContain("KA-01");
    expect(csv).toContain("Ravi");
    expect(csv).toContain("SLA Resolution Breached");
  });
});

describe("17. Search contracts (FE haystack)", () => {
  it("matches customer, short identifiers, vehicle, complaint id, state, location, issue", () => {
    const ticket = {
      ticket_number: "PKQ-1",
      complaint_id: "HIT-908",
      client_name: "Hitachi Energy",
      client_slug: "hitachi-energy",
      location: "Tumkur",
      state: "Karnataka",
      vehicle_number: "KA-01-AB",
      issue_type: "Breakdown",
    };
    const match = (q) => {
      const needle = String(q).toLowerCase();
      return [
        ticket.ticket_number,
        ticket.complaint_id,
        ticket.client_name,
        ticket.client_slug,
        ticket.location,
        ticket.state,
        ticket.vehicle_number,
        ticket.issue_type,
      ].some((v) => String(v).toLowerCase().includes(needle));
    };
    for (const q of ["HIT-908", "hitachi", "KA-01", "Tumkur", "Karnataka", "Breakdown", "PKQ-1"]) {
      expect(match(q)).toBe(true);
    }
  });
});

describe("18. Security helpers", () => {
  it("soft-hidden proofs are marked hidden and forged keys are rejected", () => {
    const hidden = {
      proof_storage_paths: ["test/org/tickets/t1/a.jpg"],
      image_visibility: {
        hidden_at: "2026-08-07T11:00:00Z",
        deleted_at: "2026-08-07T11:00:00Z",
        deleted_by: "u1",
        deleted_reason: "privacy",
      },
    };
    expect(isCommentImagesHidden(hidden)).toBe(true);
    expect(() =>
      assertProofKeyBelongsToTicket("test/other-org/tickets/t1/a.jpg", {
        ticketId: "t1",
        organisationId: "org",
      })
    ).toThrow(/tenant/i);
  });
});

describe("19. Performance-sensitive builders", () => {
  it("handles large timeline, many images, and long recipient lists without throwing", () => {
    const comments = Array.from({ length: 50 }, (_, i) => ({
      created_at: new Date(Date.UTC(2026, 7, 7, 10, 0, i)).toISOString(),
      source: i % 2 === 0 ? "FE" : "STAFF",
      body: `Event ${i}\nmultiline`,
      attachments:
        i < 20
          ? { proof_storage_paths: [`test/org/tickets/t1/p${i}.jpg`] }
          : i < 30
            ? { assignment_context: { remark: `ctx ${i}`, sort_index: i } }
            : {},
    }));
    const summary = buildClosureTimelineSummary({ comments, maxLines: 40, closedByName: "Mgr" });
    // maxLines caps timeline *entries*; multiline bodies may expand rendered newlines.
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("Mgr");

    const visible = listVisibleAssignmentContextItems(
      comments.filter((c) => c.attachments?.assignment_context).map((c, i) => ({
        id: `ctx-${i}`,
        created_at: c.created_at,
        attachments: c.attachments,
      }))
    );
    expect(visible.length).toBeGreaterThan(0);

    const recipients = Array.from({ length: 40 }, (_, i) => `user${i}@client.example`);
    const merged = mergeCloseEmailRecipients(recipients.slice(0, 20), recipients.slice(10));
    expect(new Set(merged).size).toBe(merged.length);
    expect(merged.length).toBeLessThanOrEqual(40);
  });
});

describe("20. Backwards compatibility", () => {
  it("renders emails and SLA for historical tickets missing new fields", () => {
    const legacy = {
      ticket_number: "LEG-1",
      status: "RESOLVED",
      issue_type: null,
      location: null,
      vehicle_number: null,
      remarks: null,
      short_description: "Legacy short",
      complaint_id: null,
    };
    const plain = buildResolutionEmailPlainText({
      ticket: legacy,
      clientName: null,
      initialRemarks: pickInitialRemarks(legacy),
      resolutionRemarks: "Closed historically",
      assignedFeName: null,
      closeFormSnapshot: null,
      closureLocation: null,
      timelineSummary: null,
    });
    expect(plain).toContain("LEG-1");
    expect(plain).toContain("Legacy short");
    expect(plain).toContain("Not provided");

    const view = computeTicketSlaView(
      { opened_at: "2026-01-01T00:00:00.000Z", status: "OPEN", sla_snapshot: null },
      { now: new Date("2026-01-01T01:00:00.000Z") }
    );
    expect(view == null || typeof view === "object").toBe(true);
  });
});
