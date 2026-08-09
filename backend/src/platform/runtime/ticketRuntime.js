/**
 * Metadata ticket runtime — published artifacts ONLY.
 * Never accepts client formSchema / workflowDefinition / automations.
 */
import crypto from "crypto";
import { prisma } from "../../db/prisma.js";
import { validateTicketDataAgainstSchema, applyCalculatedFields } from "../form-engine/index.js";
import { applyTransition, validateWorkflowDefinition } from "../workflow-engine/index.js";
import { buildTicketSearchDocument } from "../search-engine/index.js";
import { simulateAutomation, applyFieldUpdateActions } from "../automation-engine/index.js";
import { writePlatformAudit, getPublishedSnapshot } from "../builders/versioning.js";
import {
  resolvePublishedForm,
  getRegistryCatalog,
  resolvePublishedWorkflow,
} from "../metadata-registry/index.js";

/**
 * Create ticket from published form/workflow versions only.
 * @param {object} input
 * @param {string} input.formVersionId — required (or formKey of published registry form)
 * @param {string} [input.formKey]
 * @param {string} [input.workflowVersionId]
 * @param {string} [input.workflowKey]
 * @param {object} input.data — ticket field values only
 */
export async function createPlatformTicket(organisationId, input = {}) {
  const {
    ticketNumber,
    formVersionId = null,
    formKey = null,
    workflowVersionId = null,
    workflowKey = null,
    statusKey = null,
    data = {},
    source = "manual",
    actorUserId = null,
  } = input;

  // Reject client metadata injection
  if (input.formSchema != null || input.workflowDefinition != null || input.automations != null) {
    return {
      data: null,
      error: new Error("Client metadata rejected. Send formVersionId/formKey and ticket data only."),
      code: "PLATFORM_CLIENT_METADATA_FORBIDDEN",
    };
  }

  if (!formVersionId && !formKey) {
    return {
      data: null,
      error: new Error("formVersionId or formKey required"),
      code: "PLATFORM_FORM_VERSION_REQUIRED",
    };
  }

  const formRes = await resolvePublishedForm(organisationId, { formVersionId, formKey });
  if (!formRes.ok) {
    return { data: null, error: formRes.error || new Error("published form not found"), code: "PLATFORM_FORM_NOT_PUBLISHED" };
  }

  const formSchema = formRes.schema;
  const resolvedFormVersionId = formRes.formVersionId || formVersionId;

  let workflowDefinition = null;
  let resolvedWorkflowVersionId = workflowVersionId;
  if (workflowKey || workflowVersionId) {
    const wfRes = await resolvePublishedWorkflow(organisationId, { workflowKey, workflowVersionId });
    if (wfRes.ok) {
      workflowDefinition = wfRes.definition;
    } else if (workflowVersionId) {
      const snap = await getPublishedSnapshot(organisationId, "workflow", String(workflowKey || "default"), null);
      // try artifact by loading from registry only
    }
  }
  if (!workflowDefinition && workflowKey) {
    const wfRes = await resolvePublishedWorkflow(organisationId, { workflowKey });
    if (wfRes.ok) workflowDefinition = wfRes.definition;
  }

  const check = validateTicketDataAgainstSchema(formSchema, data);
  if (!check.ok) {
    return { data: null, error: new Error(check.error || "validation failed"), validation: check };
  }

  let payload = applyCalculatedFields(formSchema, { ...(data || {}) });

  let initial = statusKey || "OPEN";
  if (workflowDefinition) {
    const wf = validateWorkflowDefinition(workflowDefinition);
    if (!wf.ok) return { data: null, error: new Error(wf.error), code: "PLATFORM_WORKFLOW_INVALID" };
    initial = statusKey || wf.initial;
  }

  // Load published automations from registry (never client)
  const catalog = await getRegistryCatalog(organisationId);
  const registryVersionId = catalog.data?.version || null;
  const automations = Object.values(catalog.data?.automations || {})
    .map((a) => a.snapshot?.definition || a.snapshot || a.definition)
    .filter(Boolean);

  for (const auto of automations) {
    const sim = simulateAutomation(auto, {
      event: "ticket.created",
      data: payload,
      ticketId: "pending",
    });
    if (sim.matched) payload = applyFieldUpdateActions(sim.plan, payload);
  }

  const id = crypto.randomUUID();
  const number =
    ticketNumber ||
    `MD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO platform_tickets
         (id, organisation_id, ticket_number, form_version_id, workflow_version_id, status_key, data_json, source, created_at, updated_at)
       VALUES (
         $1::uuid, $2::uuid, $3,
         NULLIF($4, '')::uuid,
         NULLIF($5, '')::uuid,
         $6, $7::jsonb, $8, NOW(), NOW()
       )`,
      id,
      String(organisationId),
      number,
      resolvedFormVersionId ? String(resolvedFormVersionId) : "",
      resolvedWorkflowVersionId ? String(resolvedWorkflowVersionId) : "",
      String(initial),
      JSON.stringify({
        ...payload,
        __meta: {
          registryVersionId,
          formVersion: formRes.version,
          formKey: formRes.formKey || formKey || null,
        },
      }),
      String(source || "manual")
    );

    const searchText = buildTicketSearchDocument(
      formSchema || { fields: [] },
      { ticket_number: number, status_key: initial },
      payload
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO platform_ticket_data
         (id, organisation_id, platform_ticket_id, form_version_id, data_json, search_text, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, NULLIF($4,'')::uuid, $5::jsonb, $6, NOW())
       ON CONFLICT (platform_ticket_id) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         search_text = EXCLUDED.search_text,
         updated_at = NOW()`,
      crypto.randomUUID(),
      String(organisationId),
      id,
      resolvedFormVersionId ? String(resolvedFormVersionId) : "",
      JSON.stringify(payload),
      searchText
    );

    await writePlatformAudit(organisationId, {
      actorUserId,
      action: "ticket.create",
      entityType: "platform_ticket",
      entityId: id,
      before: null,
      after: { ticket_number: number, registryVersionId, formVersionId: resolvedFormVersionId },
    });

    return {
      data: {
        id,
        ticket_number: number,
        status_key: initial,
        form_version_id: resolvedFormVersionId,
        workflow_version_id: resolvedWorkflowVersionId,
        registry_version_id: registryVersionId,
        data_json: payload,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function listPlatformTickets(organisationId, { limit = 50, offset = 0, statusKey, q } = {}) {
  try {
    const params = [String(organisationId), Number(limit), Number(offset)];
    let sql = `SELECT id, organisation_id, ticket_number, form_version_id, workflow_version_id,
                      status_key, data_json, source, created_at, updated_at
               FROM platform_tickets
               WHERE organisation_id = $1::uuid`;
    if (statusKey) {
      params.push(String(statusKey));
      sql += ` AND status_key = $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    let rows = await prisma.$queryRawUnsafe(sql, ...params);
    if (q && Array.isArray(rows)) {
      const needle = String(q).toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.ticket_number || "").toLowerCase().includes(needle) ||
          JSON.stringify(r.data_json || {}).toLowerCase().includes(needle)
      );
    }
    return { data: rows || [], error: null };
  } catch (err) {
    if (err?.code === "42P01") return { data: [], error: null };
    return { data: null, error: err };
  }
}

export async function getPlatformTicket(organisationId, id) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM platform_tickets
       WHERE organisation_id = $1::uuid AND id = $2::uuid LIMIT 1`,
      String(organisationId),
      String(id)
    );
    return { data: rows?.[0] || null, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function transitionPlatformTicket(organisationId, ticketId, {
  toStatus,
  transitionKey,
  role,
  payload = {},
  actorUserId = null,
  context = {},
  workflowKey = null,
}) {
  // Reject client workflowDefinition
  if (arguments[2]?.workflowDefinition != null) {
    return {
      data: null,
      error: new Error("Client workflowDefinition rejected"),
      code: "PLATFORM_CLIENT_METADATA_FORBIDDEN",
    };
  }

  const ticketRes = await getPlatformTicket(organisationId, ticketId);
  if (!ticketRes.data) return { data: null, error: new Error("Not found") };
  const ticket = ticketRes.data;

  let definition = null;
  const key = workflowKey || ticket.data_json?.__meta?.workflowKey;
  if (key) {
    const wf = await resolvePublishedWorkflow(organisationId, { workflowKey: key });
    if (wf.ok) definition = wf.definition;
  }
  if (!definition) {
    // fallback: allow transition by status only if no workflow bound
    if (toStatus) {
      await prisma.$executeRawUnsafe(
        `UPDATE platform_tickets SET status_key = $1, updated_at = NOW()
         WHERE organisation_id = $2::uuid AND id = $3::uuid AND status_key = $4`,
        String(toStatus),
        String(organisationId),
        String(ticketId),
        String(ticket.status_key)
      );
      return { data: { ...ticket, status_key: toStatus }, error: null };
    }
    return { data: null, error: new Error("published workflow required"), code: "PLATFORM_WORKFLOW_REQUIRED" };
  }

  const result = applyTransition(definition, {
    currentState: ticket.status_key,
    transitionKey: transitionKey || toStatus,
    role,
    context: { ...context, data: { ...(ticket.data_json || {}), ...payload } },
  });
  if (!result.ok) return { data: null, error: new Error(result.error), code: result.code };

  const updated = await prisma.$executeRawUnsafe(
    `UPDATE platform_tickets SET status_key = $1, updated_at = NOW()
     WHERE organisation_id = $2::uuid AND id = $3::uuid AND status_key = $4`,
    String(result.to),
    String(organisationId),
    String(ticketId),
    String(ticket.status_key)
  );

  await writePlatformAudit(organisationId, {
    actorUserId,
    action: "ticket.transition",
    entityType: "platform_ticket",
    entityId: ticketId,
    before: { status: ticket.status_key },
    after: { status: result.to },
  });

  return { data: { ...ticket, status_key: result.to, updateCount: updated }, error: null };
}
