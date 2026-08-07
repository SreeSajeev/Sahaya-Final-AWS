/**
 * Client UX Batch 3 — shortName, resolution remarks, email semantics, escaping.
 */
import { describe, expect, it } from "vitest";
import {
  normalizeOrganisationShortName,
  ORG_SHORT_NAME_MAX_LEN,
} from "../../src/utils/organisationShortName.js";
import {
  buildResolutionEmailPlainText,
  escapeHtml,
  pickInitialRemarks,
  textToHtmlPreservingNewlines,
} from "../../src/services/resolutionEmailContent.js";

function hasRequiredResolutionRemarks(verification_remarks) {
  return verification_remarks != null && String(verification_remarks).trim() !== "";
}

describe("organisation shortName normalization", () => {
  it("trims and accepts shortName", () => {
    expect(normalizeOrganisationShortName("  Hitachi  ")).toEqual({
      ok: true,
      value: "Hitachi",
    });
  });

  it("blank becomes null", () => {
    expect(normalizeOrganisationShortName("")).toEqual({ ok: true, value: null });
    expect(normalizeOrganisationShortName("   ")).toEqual({ ok: true, value: null });
    expect(normalizeOrganisationShortName(null)).toEqual({ ok: true, value: null });
  });

  it("rejects overlong shortName", () => {
    const tooLong = "x".repeat(ORG_SHORT_NAME_MAX_LEN + 1);
    const r = normalizeOrganisationShortName(tooLong);
    expect(r.ok).toBe(false);
  });

  it("null shortName remains valid for historical orgs", () => {
    expect(normalizeOrganisationShortName(undefined)).toEqual({ ok: true, value: null });
  });
});

describe("resolution remarks required", () => {
  it("rejects empty / whitespace", () => {
    expect(hasRequiredResolutionRemarks("")).toBe(false);
    expect(hasRequiredResolutionRemarks("   ")).toBe(false);
    expect(hasRequiredResolutionRemarks("\n\n")).toBe(false);
    expect(hasRequiredResolutionRemarks(null)).toBe(false);
  });

  it("accepts multiline resolution remarks", () => {
    expect(hasRequiredResolutionRemarks("Fixed fuse.\nRetested.")).toBe(true);
  });
});

describe("resolution email field semantics", () => {
  it("uses client name and reported by, includes initial + resolution remarks", () => {
    const plain = buildResolutionEmailPlainText({
      ticket: {
        ticket_number: "PKQ-1",
        status: "RESOLVED",
        issue_type: "Breakdown",
        location: "Tumkur",
        remarks: "Machine would not start.\nLine 2",
      },
      clientName: "Hitachi Payment Services",
      reportedByDisplay: "Jane Reporter (jane@example.com)",
      initialRemarks: "Machine would not start.\nLine 2",
      resolutionRemarks: "Replaced cable.\nVerified OK",
      resolutionCategory: "Power Issue",
      location: "Tumkur",
    });
    expect(plain).toContain("Client: Hitachi Payment Services");
    expect(plain).toContain("Reported By: Jane Reporter (jane@example.com)");
    expect(plain).toContain("Initial Remarks:");
    expect(plain).toContain("Machine would not start.\nLine 2");
    expect(plain).toContain("Resolution Remarks:");
    expect(plain).toContain("Replaced cable.\nVerified OK");
    expect(plain).toContain("Issue Type: Power Issue");
    expect(plain).toContain("Location: Tumkur");
    expect(plain).not.toContain("deriveClientName");
  });

  it("degrades gracefully when client/reporter missing", () => {
    const plain = buildResolutionEmailPlainText({
      ticket: { ticket_number: "PKQ-2", status: "RESOLVED" },
      clientName: null,
      reportedByDisplay: null,
      initialRemarks: null,
      resolutionRemarks: "Done",
    });
    expect(plain).toContain("Client: Not provided");
    expect(plain).toContain("Reported By: Not provided");
    expect(plain).toContain("Resolution Remarks:\nDone");
  });

  it("preserves multiline and escapes HTML injection", () => {
    const evil = 'Hello <script>alert("x")</script>\nSecond';
    expect(escapeHtml(evil)).toContain("&lt;script&gt;");
    expect(escapeHtml(evil)).not.toContain("<script>");
    const html = textToHtmlPreservingNewlines(evil);
    expect(html).toContain("<br/>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("pickInitialRemarks prefers remarks over short_description", () => {
    expect(
      pickInitialRemarks({ remarks: "A\nB", short_description: "short" })
    ).toBe("A\nB");
    expect(pickInitialRemarks({ remarks: null, short_description: "short" })).toBe("short");
    expect(pickInitialRemarks({})).toBe(null);
  });

  it("includes closure location notes from review_notes without renaming DB field", () => {
    const plain = buildResolutionEmailPlainText({
      ticket: { ticket_number: "PKQ-3", location: "Depot A" },
      location: "Depot A",
      closureLocation: "Bay 4 reconnect",
      resolutionRemarks: "OK",
    });
    expect(plain).toContain("Reported Location: Depot A");
    expect(plain).toContain("Resolution Location: Bay 4 reconnect");
  });
});
