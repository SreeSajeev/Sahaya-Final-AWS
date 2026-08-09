/** API client for /platform/* — never used by legacy Sahaya pages. */
import { fetchJson } from "@/lib/backendDataApi";

export async function fetchPlatformSettings(organisationId?: string) {
  const q = organisationId ? `?organisationId=${encodeURIComponent(organisationId)}` : "";
  return fetchJson(`/platform/settings${q}`);
}

export async function updatePlatformSettings(body: Record<string, unknown>) {
  return fetchJson("/platform/settings", { method: "PUT", body });
}

export async function fetchPlatformForms() {
  return fetchJson("/platform/forms");
}

export async function savePlatformForm(body: { key: string; name: string; description?: string; status?: string }) {
  return fetchJson("/platform/forms", { method: "POST", body });
}

export async function publishPlatformForm(formId: string, body: { schema: unknown; layout?: unknown }) {
  return fetchJson(`/platform/forms/${formId}/publish`, { method: "POST", body });
}

export async function fetchFormVersions(formId: string) {
  return fetchJson(`/platform/forms/${formId}/versions`);
}

export async function fetchPlatformRuntimeTickets(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return fetchJson(`/platform/runtime/tickets${qs}`);
}

export async function createPlatformRuntimeTicket(body: Record<string, unknown>) {
  return fetchJson("/platform/runtime/tickets", { method: "POST", body });
}

export async function previewEmailParser(config: unknown, email: unknown) {
  return fetchJson("/platform/engines/email-parser/preview", {
    method: "POST",
    body: { config, email },
  });
}

export async function validateWorkflowDefinition(definition: unknown) {
  return fetchJson("/platform/engines/workflows/validate", { method: "POST", body: { definition } });
}

export async function analyzeWorkflow(definition: unknown) {
  return fetchJson("/platform/engines/workflows/analyze", { method: "POST", body: { definition } });
}

export async function simulateAutomation(definition: unknown, context: unknown) {
  return fetchJson("/platform/engines/automations/simulate", {
    method: "POST",
    body: { definition, context },
  });
}

export async function runPlatformReport(definition: unknown) {
  return fetchJson("/platform/engines/reports/run", { method: "POST", body: { definition } });
}

export async function bindPlatformDashboard(layout: unknown, definition?: unknown) {
  return fetchJson("/platform/engines/dashboards/bind", {
    method: "POST",
    body: { layout, definition },
  });
}

export async function fetchFieldTypeCatalog() {
  return fetchJson("/platform/catalog/field-types");
}

export async function fetchFormTemplates() {
  return fetchJson("/platform/catalog/form-templates");
}

export async function fetchRegistryCatalog() {
  return fetchJson("/platform/registry");
}

export async function evaluatePlatformFormula(formula: string, data: Record<string, unknown>) {
  return fetchJson("/platform/engines/forms/formula", { method: "POST", body: { formula, data } });
}

export async function validateFormSchema(schema: unknown, layout?: unknown) {
  return fetchJson("/platform/engines/forms/validate", { method: "POST", body: { schema, layout } });
}

export async function renderNotificationPreview(template: unknown, vars: unknown, trigger?: unknown, context?: unknown) {
  return fetchJson("/platform/engines/notifications/render", {
    method: "POST",
    body: { template, vars, trigger, context },
  });
}

export async function resolveAssignment(rules: unknown, data: unknown, candidates: unknown[]) {
  return fetchJson("/platform/engines/assignments/resolve", {
    method: "POST",
    body: { rules, data, candidates },
  });
}

export async function validateWebhookConfig(body: Record<string, unknown>) {
  return fetchJson("/platform/engines/webhooks/validate", { method: "POST", body });
}

export async function listBuilderArtifacts(path: string) {
  return fetchJson(`/platform/${path}`);
}

export async function upsertBuilderArtifact(path: string, body: Record<string, unknown>) {
  return fetchJson(`/platform/${path}`, { method: "POST", body });
}

export async function publishArtifactVersion(
  type: string,
  key: string,
  snapshot: unknown
) {
  return fetchJson(`/platform/versions/${encodeURIComponent(type)}/${encodeURIComponent(key)}/publish`, {
    method: "POST",
    body: { snapshot },
  });
}

export async function fetchPublishedArtifact(type: string, key: string, version?: number) {
  const q = version != null ? `?version=${version}` : "";
  return fetchJson(`/platform/versions/${encodeURIComponent(type)}/${encodeURIComponent(key)}/published${q}`);
}

export async function listArtifactVersions(type: string, key: string) {
  return fetchJson(`/platform/versions/${encodeURIComponent(type)}/${encodeURIComponent(key)}`);
}

export async function rollbackArtifact(type: string, key: string, toVersion: number) {
  return fetchJson(`/platform/versions/${encodeURIComponent(type)}/${encodeURIComponent(key)}/rollback`, {
    method: "POST",
    body: { toVersion },
  });
}

export async function cloneArtifact(type: string, key: string, newKey: string) {
  return fetchJson(`/platform/versions/${encodeURIComponent(type)}/${encodeURIComponent(key)}/clone`, {
    method: "POST",
    body: { newKey },
  });
}

export async function compareArtifactVersions(
  type: string,
  key: string,
  leftVersion: number,
  rightVersion: number
) {
  return fetchJson(`/platform/versions/compare`, {
    method: "POST",
    body: { type, key, leftVersion, rightVersion },
  });
}

export async function saveEmailParser(body: { key: string; name: string; status?: string; config?: unknown }) {
  return fetchJson("/platform/email-parser", { method: "POST", body });
}
