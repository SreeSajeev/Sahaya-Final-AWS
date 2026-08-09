/**
 * P0 production hardening — unit coverage for all seven P0 fixes.
 */
import { describe, expect, it, afterEach, vi } from "vitest";
import { assertSafeRegex, safeRegexMatch, MAX_REGEX_PATTERN_LENGTH } from "../../src/platform/parser-engine/safeRegex.js";
import { previewEmailParse, validateParserConfig } from "../../src/platform/parser-engine/index.js";
import {
  can,
  filterFieldsForRole,
  assertPermission,
  assertBuilderAccess,
} from "../../src/platform/permission-engine/index.js";
import {
  assertPlatformTable,
  assertPlatformColumn,
} from "../../src/platform/runtime/platformSqlAllowlist.js";
import { listByOrg } from "../../src/platform/runtime/platformCrud.js";
import {
  escapeHtml,
  escapeAttr,
  escapeUrl,
  escapeMarkdown,
  renderTemplateString,
  renderNotification,
} from "../../src/platform/notification-engine/index.js";
import {
  simulateAutomation,
  createExecutionBudget,
  AUTOMATION_DEFAULTS,
} from "../../src/platform/automation-engine/index.js";
import {
  isPlatformCompatibilityModeEnabled,
  describeRuntimePolicy,
} from "../../src/platform/runtime/exclusiveRuntimeGate.js";

describe("P0#1 safe regex / ReDoS", () => {
  it("rejects classic catastrophic nested quantifiers", () => {
    const gate = assertSafeRegex("(a+)+$");
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe("REGEX_UNSAFE");
  });

  it("rejects overlong patterns", () => {
    expect(assertSafeRegex("a".repeat(MAX_REGEX_PATTERN_LENGTH + 1)).code).toBe("REGEX_TOO_LONG");
  });

  it("preview never executes unsafe regex (returns error, no hang)", () => {
    const started = Date.now();
    const result = previewEmailParse(
      { regexRules: [{ pattern: "(a+)+$", targetField: "x" }] },
      { body: "a".repeat(30) + "!" }
    );
    expect(result.error).toMatch(/unsafe regex|catastrophic/i);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("allows simple safe patterns", () => {
    expect(assertSafeRegex("Loc:\\s*(.+)", "im").ok).toBe(true);
    const m = safeRegexMatch("Loc:\\s*(.+)", "im", "Loc: Bay 4");
    expect(m.ok).toBe(true);
    expect(m.match?.[1]).toBe("Bay 4");
  });

  it("fuzz: random nested quantifier variants are rejected or compile-safe", () => {
    const samples = ["(a*)*", "(a+)*", "(a|a)+$", "((a+)+)+", "(.*)*.*", "(\\w+)+$", "(a+){1,}"];
    for (const p of samples) {
      const gate = assertSafeRegex(p);
      // Must not throw; unsafe ones rejected
      if (gate.ok) {
        const t0 = Date.now();
        safeRegexMatch(p, "i", "a".repeat(40));
        expect(Date.now() - t0).toBeLessThan(200);
      } else {
        expect(["REGEX_UNSAFE", "REGEX_COMPLEX", "REGEX_INVALID"]).toContain(gate.code);
      }
    }
  });

  it("validateParserConfig rejects unsafe rules before save", () => {
    expect(validateParserConfig({ fieldMappings: [{ targetField: "t" }], regexRules: [{ pattern: "(a+)+$" }] }).ok).toBe(
      false
    );
  });
});

describe("P0#2 permission deny-by-default", () => {
  it("empty permissions deny", () => {
    expect(can([], "form", "read")).toBe(false);
    expect(can(null, "form", "read")).toBe(false);
    expect(assertPermission([], "form", "read", { tenantId: "t", role: "CLIENT" }).ok).toBe(false);
  });

  it("missing resource/action/role/tenant deny", () => {
    expect(can([{ resource: "form", action: "read" }], "", "read")).toBe(false);
    expect(assertPermission([{ resource: "form", action: "read" }], "form", "read", {}).ok).toBe(false);
    expect(
      assertPermission([{ resource: "form", action: "read" }], "form", "read", { tenantId: "t" }).code
    ).toBe("PLATFORM_NO_ROLE");
    expect(
      assertPermission([{ resource: "form", action: "read" }], "unknown", "read", { tenantId: "t", role: "X" }).ok
    ).toBe(false);
  });

  it("filterFieldsForRole returns empty without grants", () => {
    expect(filterFieldsForRole([{ internalName: "a" }], []).length).toBe(0);
  });

  it("non-admin without grants denied by assertBuilderAccess", () => {
    const r = assertBuilderAccess(
      { tenantRole: "CLIENT", platformOrganisationId: "org", platformPermissions: [] },
      "form",
      "read"
    );
    expect(r.ok).toBe(false);
  });

  it("ADMIN may access builders without explicit grants", () => {
    expect(assertBuilderAccess({ tenantRole: "ADMIN", platformOrganisationId: "org" }, "form", "read").ok).toBe(
      true
    );
  });
});

describe("P0#3 exclusive runtime policy", () => {
  afterEach(() => {
    delete process.env.PLATFORM_COMPATIBILITY_MODE;
  });

  it("compatibility mode defaults OFF", () => {
    expect(isPlatformCompatibilityModeEnabled()).toBe(false);
    expect(describeRuntimePolicy().exclusive).toBe(true);
  });

  it("compatibility mode can be enabled explicitly", () => {
    process.env.PLATFORM_COMPATIBILITY_MODE = "true";
    expect(isPlatformCompatibilityModeEnabled()).toBe(true);
  });
});

describe("P0#4 SQL allowlist", () => {
  it("rejects unknown tables and columns", () => {
    expect(() => assertPlatformTable("tickets")).toThrow(/Unknown platform table/);
    expect(() => assertPlatformTable("platform_forms; DROP TABLE tickets")).toThrow();
    expect(() => assertPlatformColumn("evil")).toThrow(/Unknown platform column/);
  });

  it("listByOrg denies injection table names", async () => {
    const { error } = await listByOrg("tickets;--", "00000000-0000-0000-0000-000000000001");
    expect(error?.code).toBe("PLATFORM_SQL_TABLE_DENIED");
  });
});

describe("P0#5 notification XSS escaping", () => {
  const owasp = [
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "javascript:alert(1)",
    "<svg/onload=alert(1)>",
    "{{constructor.constructor('alert(1)')()}}",
  ];

  it("escapes HTML body variables", () => {
    for (const payload of owasp.slice(0, 4)) {
      const html = renderTemplateString("Hi {{name}}", { name: payload }, "html");
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<img/i);
      expect(html).not.toMatch(/<svg/i);
      // Attribute breakouts neutralized — angle brackets escaped
      expect(html).not.toContain("<");
      expect(html).toContain(escapeHtml(payload).slice(0, 10));
    }
  });

  it("blocks javascript: URLs", () => {
    expect(escapeUrl("javascript:alert(1)")).toBe("");
    expect(escapeUrl("https://ok.example/a")).toContain("https://ok.example/a");
  });

  it("escapes markdown and attributes", () => {
    expect(escapeMarkdown("<b>x</b>")).not.toContain("<b>");
    expect(escapeAttr('a"b')).toContain("&quot;");
  });

  it("renderNotification escapes subject and html", () => {
    const r = renderNotification(
      { channel: "email", subject: "S {{x}}", body_html: "<p>{{x}}</p>", body_text: "{{x}}" },
      { x: "<script>alert(1)</script>" }
    );
    expect(r.bodyHtml).not.toMatch(/<script>/i);
    expect(r.subject).not.toMatch(/<script>/i);
  });
});

describe("P0#6 automation loop protection", () => {
  it("detects recursive run_automation cycles", () => {
    const def = {
      id: "loop",
      trigger: { type: "ticket.created" },
      actions: [
        {
          type: "run_automation",
          config: {
            definition: {
              id: "loop",
              trigger: { type: "ticket.created" },
              actions: [{ type: "field_update", config: { field: "a", value: 1 } }],
            },
          },
        },
      ],
    };
    const result = simulateAutomation(def, { event: "ticket.created", ticketId: "t1", data: {} }, {
      recurse: true,
      maxDepth: 3,
    });
    expect(result.ok).toBe(false);
    expect(["AUTOMATION_LOOP", "AUTOMATION_CYCLE", "AUTOMATION_MAX_DEPTH"]).toContain(result.code);
  });

  it("enforces max depth", () => {
    const budget = createExecutionBudget({ maxDepth: 1 });
    const def = { id: "d", trigger: { type: "*" }, actions: [{ type: "noop" }] };
    expect(budget.enter(def, { event: "x", ticketId: "1" }, 0).ok).toBe(true);
    expect(budget.enter(def, { event: "x", ticketId: "1" }, 2).code).toBe("AUTOMATION_MAX_DEPTH");
  });

  it("enforces action budget", () => {
    const many = {
      trigger: { type: "e" },
      actions: Array.from({ length: AUTOMATION_DEFAULTS.maxActionsPerRun + 1 }, () => ({
        type: "field_update",
        config: { field: "a", value: 1 },
      })),
    };
    expect(simulateAutomation(many, { event: "e" }).ok).toBe(false);
  });
});

describe("P0#7 production boot split", () => {
  afterEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env.LEGACY_PROOF_STORAGE_STRICT;
    delete process.env.METADATA_PLATFORM_STRICT_BOOT;
    vi.resetModules();
  });

  it("legacy boot does not throw when S3 disabled (warn path)", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_ACCESS_SECRET = "x".repeat(32);
    process.env.DATABASE_URL = "postgres://x";
    process.env.POSTMARK_SERVER_TOKEN = "tok";
    process.env.FROM_EMAIL = "a@b.com";
    process.env.S3_FE_PROOFS_ENABLED = "false";
    process.env.PASSWORD_RESET_DRY_RUN = "false";
    process.env.ENFORCE_TENANT_GUARD = "true";
    vi.resetModules();
    const { assertProductionConfig, assertLegacyProofStorageConfig } = await import(
      "../../src/config/productionConfig.js"
    );
    expect(() => assertProductionConfig()).not.toThrow();
    expect(assertLegacyProofStorageConfig().warnings.length).toBeGreaterThan(0);
  });

  it("still fails when JWT missing", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_ACCESS_SECRET = "";
    process.env.DATABASE_URL = "postgres://x";
    process.env.POSTMARK_SERVER_TOKEN = "tok";
    process.env.FROM_EMAIL = "a@b.com";
    process.env.ENFORCE_TENANT_GUARD = "true";
    vi.resetModules();
    const { assertProductionConfig } = await import("../../src/config/productionConfig.js");
    expect(() => assertProductionConfig()).toThrow(/Legacy production config invalid/);
  });
});
