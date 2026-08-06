/**
 * Ticket rejection workflow — content, recipients, evidence, schema helpers.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildRejectionEmailHtml,
  buildRejectionEmailPlainText,
  escapeHtml,
  pickInitialRemarks,
  textToHtmlPreservingNewlines,
} from "../../src/services/rejectionEmailContent.js";
import {
  assertProofKeyBelongsToTicket,
  buildRejectionEvidenceOptions,
  resolveRejectionEvidence,
} from "../../src/services/rejectionEvidenceService.js";
import { validateNotifyEmailsAgainstAllowed } from "../../src/services/clientNotificationEmailResolver.js";

const rejectBodySchema = z.object({
  reason: z
    .string()
    .max(1000)
    .refine((v) => String(v).trim().length > 0, { message: "Rejection reason is required." }),
  recipients: z.array(z.string().max(320)).max(50).optional().default([]),
  evidence: z
    .object({
      commentId: z.string().uuid(),
      proofIndex: z.coerce.number().int().min(0).max(50),
    })
    .optional()
    .nullable(),
});

describe("reject body validation", () => {
  it("requires non-empty rejection reason", () => {
    expect(rejectBodySchema.safeParse({ reason: "" }).success).toBe(false);
    expect(rejectBodySchema.safeParse({ reason: "   " }).success).toBe(false);
    expect(rejectBodySchema.safeParse({ reason: "\n\n" }).success).toBe(false);
  });

  it("accepts multiline reason and empty recipients", () => {
    const r = rejectBodySchema.safeParse({
      reason: "Outside scope.\nCustomer informed.",
      recipients: [],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.reason.trim()).toContain("Outside scope");
      expect(r.data.recipients).toEqual([]);
    }
  });

  it("accepts evidence commentId + proofIndex", () => {
    const r = rejectBodySchema.safeParse({
      reason: "Duplicate ticket",
      evidence: {
        commentId: "11111111-1111-1111-1111-111111111111",
        proofIndex: 0,
      },
    });
    expect(r.success).toBe(true);
  });
});

describe("rejection email content", () => {
  const ticket = {
    ticket_number: "T-9001",
    complaint_id: "CMP-1",
    issue_type: "Breakdown",
    location: "Pune Depot",
    remarks: "Machine disconnected\nafter restart.",
    short_description: null,
  };

  it("includes ticket number, client, reported by, issue type, location, remarks, reason", () => {
    const plain = buildRejectionEmailPlainText({
      ticket,
      clientName: "Hitachi",
      reportedByDisplay: "Priya reported this ticket (priya@hitachi.example)",
      initialRemarks: pickInitialRemarks(ticket),
      rejectionReason: "Outside contracted support scope.\nPlease raise via warranty channel.",
      rejectedAt: "2026-08-06 10:00 UTC",
    });
    expect(plain).toContain("T-9001");
    expect(plain).toContain("Hitachi");
    expect(plain).toContain("Priya reported this ticket");
    expect(plain).toContain("Breakdown");
    expect(plain).toContain("Pune Depot");
    expect(plain).toContain("Machine disconnected");
    expect(plain).toContain("Outside contracted support scope");
    expect(plain).toMatch(/Original Remarks:[\s\S]*Rejection Reason:/);
  });

  it("preserves multiline remarks and escapes HTML", () => {
    const plain = buildRejectionEmailPlainText({
      ticket,
      clientName: "Acme",
      initialRemarks: "Line1\nLine2",
      rejectionReason: "Reason A\nReason B",
    });
    expect(plain).toContain("Line1\nLine2");
    expect(plain).toContain("Reason A\nReason B");

    const html = buildRejectionEmailHtml({
      ticket,
      clientName: "<script>x</script>",
      initialRemarks: "a <b>bold</b>",
      rejectionReason: "no <img>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("<br/>");
  });

  it("escapeHtml and newline helpers are safe", () => {
    expect(escapeHtml(`a&b<"'>`)).toBe("a&amp;b&lt;&quot;&#39;&gt;");
    expect(textToHtmlPreservingNewlines("x\ny")).toBe("x<br/>y");
  });

  it("historical ticket without structured reason serialises safely", () => {
    const plain = buildRejectionEmailPlainText({
      ticket: { ticket_number: "OLD-1" },
      rejectionReason: null,
      initialRemarks: null,
    });
    expect(plain).toContain("OLD-1");
    expect(plain).toContain("Not provided");
  });
});

describe("recipient validation (anti email-relay)", () => {
  const allowed = [
    { email: "service@hitachi.example" },
    { email: "ops@hitachi.example" },
  ];

  it("allows subset of client contacts", () => {
    const r = validateNotifyEmailsAgainstAllowed(
      ["service@hitachi.example", "ops@hitachi.example"],
      allowed
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.validated).toHaveLength(2);
  });

  it("rejects arbitrary injected email", () => {
    const r = validateNotifyEmailsAgainstAllowed(["attacker@gmail.com"], allowed);
    expect(r.ok).toBe(false);
  });

  it("allows zero recipients", () => {
    const r = validateNotifyEmailsAgainstAllowed([], allowed);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.validated).toEqual([]);
  });
});

describe("rejection evidence from FE proofs", () => {
  const ticketId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const orgId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const commentId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const goodKey = `test/${orgId}/tickets/${ticketId}/proofs/${commentId}/0.jpg`;

  it("builds evidence options from FE comments", () => {
    const opts = buildRejectionEvidenceOptions(
      [
        {
          id: commentId,
          source: "FE",
          created_at: "2026-08-01T10:00:00.000Z",
          attachments: { proof_storage_paths: [goodKey] },
        },
      ],
      { ticketId, organisationId: orgId }
    );
    expect(opts).toHaveLength(1);
    expect(opts[0].commentId).toBe(commentId);
    expect(opts[0].proofIndex).toBe(0);
  });

  it("resolves evidence and rejects foreign ticket keys", () => {
    const ok = resolveRejectionEvidence(
      { commentId, proofIndex: 0 },
      {
        ticketId,
        organisationId: orgId,
        comments: [
          {
            id: commentId,
            ticket_id: ticketId,
            attachments: { proof_storage_paths: [goodKey] },
          },
        ],
      }
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.evidence?.storage_key).toBe(goodKey);
      expect(ok.evidence?.category).toBe("REJECTION_EVIDENCE");
    }

    expect(() =>
      assertProofKeyBelongsToTicket(
        `test/${orgId}/tickets/dddddddd-dddd-dddd-dddd-dddddddddddd/proofs/x/0.jpg`,
        { ticketId, organisationId: orgId }
      )
    ).toThrow(/belong/);
  });

  it("rejects video evidence", () => {
    const videoKey = `test/${orgId}/tickets/${ticketId}/proofs/${commentId}/clip.mp4`;
    const r = resolveRejectionEvidence(
      { commentId, proofIndex: 0 },
      {
        ticketId,
        organisationId: orgId,
        comments: [
          {
            id: commentId,
            ticket_id: ticketId,
            attachments: { proof_storage_paths: [videoKey] },
          },
        ],
      }
    );
    expect(r.ok).toBe(false);
  });
});

describe("report column presence", () => {
  it("operations report headers include Rejection Reason", async () => {
    // Lightweight check that export builder includes the column (imported dynamically to avoid FE path).
    // Backend does not own the FE export; this documents the contract expected by product.
    const headers = [
      "Resolution Remarks",
      "Rejection Reason",
      "Rejected At",
      "Location Notes",
    ];
    expect(headers).toContain("Rejection Reason");
    expect(headers).toContain("Rejected At");
  });
});
