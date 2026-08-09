/**
 * Unit tests for every Metadata Platform engine (no DB).
 */
import { describe, expect, it } from "vitest";
import {
  validateFormDefinition,
  validateTicketDataAgainstSchema,
  evaluateCondition,
  FORM_FIELD_TYPES,
} from "../../src/platform/form-engine/index.js";
import {
  validateWorkflowDefinition,
  applyTransition,
  listAllowedTransitions,
} from "../../src/platform/workflow-engine/index.js";
import { previewEmailParse } from "../../src/platform/parser-engine/index.js";
import { simulateAutomation, applyFieldUpdateActions } from "../../src/platform/automation-engine/index.js";
import { renderNotification, shouldSend } from "../../src/platform/notification-engine/index.js";
import { resolveAssignee } from "../../src/platform/assignment-engine/index.js";
import { projectTickets, aggregateKpi } from "../../src/platform/report-engine/index.js";
import { bindDashboard } from "../../src/platform/dashboard-engine/index.js";
import { gateByConfidence } from "../../src/platform/ai-engine/index.js";
import { validateWebhook } from "../../src/platform/plugin-engine/index.js";
import { filterTicketsByQuery } from "../../src/platform/search-engine/index.js";
import { can, filterFieldsForRole } from "../../src/platform/permission-engine/index.js";
import { resolvePlatformMode, PLATFORM_MODES } from "../../src/platform/runtime/platformMode.js";

describe("form-engine", () => {
  it("validates schemas and conditional required data", () => {
    expect(FORM_FIELD_TYPES.length).toBeGreaterThan(40);
    const schema = {
      fields: [
        { internalName: "title", fieldType: "single_line_text", required: true },
        {
          internalName: "photo_note",
          fieldType: "paragraph",
          conditionalRequired: { field: "priority", equals: "HIGH" },
        },
        { internalName: "priority", fieldType: "dropdown" },
      ],
    };
    expect(validateFormDefinition(schema).ok).toBe(true);
    expect(validateTicketDataAgainstSchema(schema, { title: "x", priority: "LOW" }).ok).toBe(true);
    expect(validateTicketDataAgainstSchema(schema, { title: "x", priority: "HIGH" }).ok).toBe(false);
    expect(evaluateCondition({ field: "priority", equals: "HIGH" }, { priority: "HIGH" })).toBe(true);
  });
});

describe("workflow-engine", () => {
  const def = {
    initialState: "OPEN",
    states: [{ key: "OPEN" }, { key: "ASSIGNED" }, { key: "CLOSED" }],
    transitions: [
      { key: "assign", from: "OPEN", to: "ASSIGNED", roles: ["ADMIN"] },
      { key: "close", from: "ASSIGNED", to: "CLOSED", requirements: { requireComment: true } },
    ],
  };

  it("validates and applies transitions with requirements", () => {
    expect(validateWorkflowDefinition(def).ok).toBe(true);
    expect(listAllowedTransitions(def, "OPEN", "ADMIN")).toHaveLength(1);
    expect(applyTransition(def, { currentState: "OPEN", transitionKey: "assign", role: "ADMIN" }).ok).toBe(true);
    expect(
      applyTransition(def, {
        currentState: "ASSIGNED",
        transitionKey: "close",
        role: "ADMIN",
        context: {},
      }).ok
    ).toBe(false);
    expect(
      applyTransition(def, {
        currentState: "ASSIGNED",
        transitionKey: "close",
        role: "ADMIN",
        context: { comment: "done" },
      }).to
    ).toBe("CLOSED");
  });
});

describe("parser-engine", () => {
  it("extracts fields with confidence and review list", () => {
    const result = previewEmailParse(
      {
        confidenceThreshold: 85,
        mapSubjectToField: "title",
        keywordRules: [{ keyword: "URGENT", targetField: "priority", value: "HIGH", confidence: 92 }],
        regexRules: [{ pattern: "Loc:\\s*(.+)", targetField: "location", confidence: 70 }],
      },
      { subject: "URGENT issue", body: "Loc: Bay 4", from: "a@b.com" }
    );
    expect(result.ticketDraft.title).toContain("URGENT");
    expect(result.ticketDraft.priority).toBe("HIGH");
    expect(result.needsReview).toContain("location");
  });
});

describe("automation-engine", () => {
  it("simulates trigger match and field updates", () => {
    const sim = simulateAutomation(
      {
        trigger: { type: "ticket.created" },
        condition: { field: "priority", equals: "HIGH" },
        actions: [{ type: "field_update", config: { field: "queue", value: "P1" } }],
      },
      { event: "ticket.created", data: { priority: "HIGH" } }
    );
    expect(sim.matched).toBe(true);
    expect(applyFieldUpdateActions(sim.plan, { priority: "HIGH" }).queue).toBe("P1");
  });
});

describe("notification-engine", () => {
  it("renders variables and respects conditions", () => {
    const rendered = renderNotification(
      {
        channel: "email",
        subject: "Ticket {{ticket.number}}",
        body_text: "Hello {{customer}}",
      },
      { ticket: { number: "MD-1" }, customer: "Acme" }
    );
    expect(rendered.ok).toBe(true);
    expect(rendered.subject).toBe("Ticket MD-1");
    expect(shouldSend({ event: "assigned" }, { event: "created" })).toBe(false);
  });
});

describe("assignment-engine", () => {
  it("resolves least loaded and skill based assignees", () => {
    const candidates = [
      { id: "a", load: 5, skills: ["pump"] },
      { id: "b", load: 1, skills: ["electrical"] },
    ];
    expect(
      resolveAssignee(
        { rules: [{ strategy: "least_loaded", priority: 1 }] },
        {},
        candidates
      ).assigneeId
    ).toBe("b");
    expect(
      resolveAssignee(
        { rules: [{ strategy: "skill_based", config: { skill: "pump" }, priority: 1 }] },
        {},
        candidates
      ).assigneeId
    ).toBe("a");
  });
});

describe("report + dashboard engines", () => {
  it("projects rows and binds KPI widgets", () => {
    const tickets = [
      { ticket_number: "MD-1", status_key: "OPEN", data_json: { city: "BLR" } },
      { ticket_number: "MD-2", status_key: "CLOSED", data_json: { city: "MUM" } },
    ];
    const report = projectTickets(
      { columns: [{ field_key: "city", label: "City" }] },
      tickets
    );
    expect(report.rows).toHaveLength(2);
    const kpi = aggregateKpi({}, tickets);
    const dash = bindDashboard({ widgets: [{ type: "kpi", title: "Total" }] }, kpi);
    expect(dash.ok).toBe(true);
    expect(dash.widgets[0].data.total).toBe(2);
  });
});

describe("ai + plugin + search + permission", () => {
  it("gates confidence, validates webhooks, searches, and filters fields", () => {
    const gated = gateByConfidence(
      { a: { confidence: 90 }, b: { confidence: 40 } },
      80
    );
    expect(Object.keys(gated.accepted)).toEqual(["a"]);
    expect(validateWebhook({ url: "https://example.com/hook" }).ok).toBe(true);
    expect(validateWebhook({ url: "ftp://x" }).ok).toBe(false);
    expect(
      filterTicketsByQuery([{ ticket_number: "MD-9", data_json: { title: "pump" } }], "pump")
    ).toHaveLength(1);
    expect(can([{ resource: "form", action: "read" }], "form", "read")).toBe(true);
    expect(
      filterFieldsForRole(
        [{ internalName: "secret" }, { internalName: "title" }],
        [{ resource: "field:title", action: "read" }]
      ).map((f) => f.internalName)
    ).toEqual(["title"]);
  });
});

describe("coexistence mode default", () => {
  it("defaults to LEGACY with zero metadata activation", () => {
    expect(resolvePlatformMode(null)).toBe(PLATFORM_MODES.LEGACY);
  });
});
