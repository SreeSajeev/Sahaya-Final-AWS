/**
 * Security re-audit smoke after P0 hardening (unit-level, no live DB required for most).
 */
import { describe, expect, it } from "vitest";
import { assertSafeRegex } from "../../src/platform/parser-engine/safeRegex.js";
import { assertPlatformTable } from "../../src/platform/runtime/platformSqlAllowlist.js";
import { renderTemplateString, escapeUrl } from "../../src/platform/notification-engine/index.js";
import { assertPermission } from "../../src/platform/permission-engine/index.js";
import { simulateAutomation } from "../../src/platform/automation-engine/index.js";

describe("P0 security re-audit smoke", () => {
  it("SQL injection table names denied", () => {
    for (const t of ["tickets", "users", "platform_forms;drop", "pg_sleep(1)"]) {
      expect(() => assertPlatformTable(t)).toThrow();
    }
  });

  it("ReDoS patterns rejected", () => {
    expect(assertSafeRegex("(a+)+$").ok).toBe(false);
    expect(assertSafeRegex("(.*a){x}").ok).toBe(false);
  });

  it("stored XSS via templates escaped", () => {
    const out = renderTemplateString('<a href="{{u|url}}">{{n}}</a>', {
      u: "javascript:alert(1)",
      n: "<script>x</script>",
    });
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/<script>/i);
  });

  it("dangerous URL scheme stripped", () => {
    expect(escapeUrl("  DATA:text/html,<script>")).toBe("");
  });

  it("privilege escalation: empty grants deny", () => {
    expect(assertPermission([], "*", "*", { tenantId: "o", role: "CLIENT" }).ok).toBe(false);
  });

  it("automation recursion cannot infinite loop", () => {
    const nested = {
      id: "a",
      trigger: { type: "e" },
      actions: [{ type: "run_automation", config: { definition: null } }],
    };
    nested.actions[0].config.definition = nested;
    const r = simulateAutomation(nested, { event: "e", ticketId: "1" }, { recurse: true, maxDepth: 4 });
    expect(r.ok).toBe(false);
  });
});
