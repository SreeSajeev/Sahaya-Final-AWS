/**
 * Ticket closure (Verify & Close) — recipient selection, merge, validation.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateNotifyEmailsAgainstAllowed } from "../../src/services/clientNotificationEmailResolver.js";
import {
  parseAdditionalNotifyEmails,
  mergeCloseEmailRecipients,
  mapNotificationEmailsForContext,
} from "../../src/services/closureEmailRecipients.js";

const closeBodySchema = z.object({
  verification_remarks: z
    .string()
    .max(12000)
    .refine((v) => String(v).trim().length > 0, { message: "Resolution remarks are required." }),
  review_notes: z.string().max(12000).optional().nullable(),
  resolution_category: z.string().max(500).optional().nullable(),
  resolution_other_details: z.string().max(12000).optional().nullable(),
  recipients: z.array(z.string().max(320)).max(50).optional().default([]),
  notification_email: z.string().max(2000).optional().nullable(),
});

describe("close body validation", () => {
  it("requires resolution remarks", () => {
    expect(closeBodySchema.safeParse({ verification_remarks: "" }).success).toBe(false);
    expect(closeBodySchema.safeParse({ verification_remarks: "   " }).success).toBe(false);
  });

  it("accepts recipients array and empty selection", () => {
    const r = closeBodySchema.safeParse({
      verification_remarks: "Fixed on site",
      recipients: [],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.recipients).toEqual([]);
  });

  it("accepts multiple recipients", () => {
    const r = closeBodySchema.safeParse({
      verification_remarks: "Done",
      recipients: ["a@co.com", "b@co.com"],
      notification_email: "extra@co.com",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.recipients).toHaveLength(2);
      expect(r.data.notification_email).toBe("extra@co.com");
    }
  });

  it("backward compatible: notification_email only (no recipients field)", () => {
    const r = closeBodySchema.safeParse({
      verification_remarks: "Legacy close",
      notification_email: "ops@client.example",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.recipients).toEqual([]);
      expect(r.data.notification_email).toBe("ops@client.example");
    }
  });
});

describe("recipient loading (context mapping)", () => {
  it("maps aggregated notification emails for UI checkboxes", () => {
    const mapped = mapNotificationEmailsForContext(
      [
        { email: "abc@company.com", source: "contact_email" },
        { email: "manager@company.com", source: "notification_email" },
        { email: "spoc@company.com", source: "org_spoc" },
      ],
      { name: "Acme Logistics" }
    );
    expect(mapped).toHaveLength(3);
    expect(mapped[0]).toMatchObject({
      id: "abc@company.com",
      email: "abc@company.com",
      name: "Acme Logistics",
      source: "contact_email",
    });
    expect(mapped[1].name).toBeNull();
    expect(mapped[2].source).toBe("org_spoc");
  });
});

describe("recipient selection / deselection merge", () => {
  const allowed = [
    { email: "abc@company.com" },
    { email: "manager@company.com" },
    { email: "finance@company.com" },
    { email: "service@company.com" },
  ];

  it("keeps only selected subset (deselection)", () => {
    const selected = ["abc@company.com", "manager@company.com", "service@company.com"];
    const check = validateNotifyEmailsAgainstAllowed(selected, allowed);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    const merged = mergeCloseEmailRecipients(check.validated, []);
    expect(merged).toEqual([
      "abc@company.com",
      "manager@company.com",
      "service@company.com",
    ]);
    expect(merged).not.toContain("finance@company.com");
  });

  it("allows no recipients selected", () => {
    const check = validateNotifyEmailsAgainstAllowed([], allowed);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(mergeCloseEmailRecipients(check.validated, [])).toEqual([]);
  });

  it("merges additional emails with selected and removes duplicates", () => {
    const check = validateNotifyEmailsAgainstAllowed(
      ["abc@company.com", "service@company.com"],
      allowed
    );
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    const add = parseAdditionalNotifyEmails("ABC@company.com; new@partner.example, service@company.com");
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    const merged = mergeCloseEmailRecipients(check.validated, add.emails);
    expect(merged).toEqual(["abc@company.com", "service@company.com", "new@partner.example"]);
  });

  it("ignores blank additional emails", () => {
    expect(parseAdditionalNotifyEmails("  ")).toEqual({ ok: true, emails: [] });
    expect(parseAdditionalNotifyEmails(null)).toEqual({ ok: true, emails: [] });
    expect(parseAdditionalNotifyEmails(",, ; ")).toEqual({ ok: true, emails: [] });
  });
});

describe("additional email format validation", () => {
  it("rejects invalid email tokens", () => {
    const r = parseAdditionalNotifyEmails("good@co.com, not-an-email");
    expect(r.ok).toBe(false);
  });

  it("accepts comma and semicolon separated valid emails", () => {
    const r = parseAdditionalNotifyEmails("a@x.com; b@y.com, c@z.com");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.emails).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
  });
});

describe("tenant isolation / anti email-relay (selected recipients)", () => {
  const tenantA = [
    { email: "ops@tenant-a.example" },
    { email: "billing@tenant-a.example" },
  ];

  it("rejects cross-tenant / arbitrary injected selected email", () => {
    const r = validateNotifyEmailsAgainstAllowed(["ops@tenant-b.example"], tenantA);
    expect(r.ok).toBe(false);
  });

  it("rejects attacker email not on allow-list", () => {
    const r = validateNotifyEmailsAgainstAllowed(["attacker@gmail.com"], tenantA);
    expect(r.ok).toBe(false);
  });

  it("allows only tenant-owned contacts", () => {
    const r = validateNotifyEmailsAgainstAllowed(["ops@tenant-a.example"], tenantA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.validated).toEqual(["ops@tenant-a.example"]);
  });
});

describe("end-to-end recipient resolution scenarios", () => {
  const allowed = [
    { email: "one@client.example" },
    { email: "two@client.example" },
  ];

  function resolve(selected, additionalRaw) {
    const check = validateNotifyEmailsAgainstAllowed(selected, allowed);
    if (!check.ok) return { ok: false, error: check.error };
    const add = parseAdditionalNotifyEmails(additionalRaw);
    if (!add.ok) return { ok: false, error: add.error };
    return { ok: true, recipients: mergeCloseEmailRecipients(check.validated, add.emails) };
  }

  it("multiple recipients only", () => {
    const r = resolve(["one@client.example", "two@client.example"], null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recipients).toHaveLength(2);
  });

  it("no recipients selected and no additional → empty send list", () => {
    const r = resolve([], "");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recipients).toEqual([]);
  });

  it("backward compatible: additional only (legacy notification_email)", () => {
    const r = resolve([], "legacy@client.example");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recipients).toEqual(["legacy@client.example"]);
  });

  it("does not auto-include unselected allow-list contacts", () => {
    const r = resolve(["one@client.example"], null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recipients).toEqual(["one@client.example"]);
      expect(r.recipients).not.toContain("two@client.example");
    }
  });
});
