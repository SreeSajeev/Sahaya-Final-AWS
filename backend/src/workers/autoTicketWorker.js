import {
  fetchPendingRawEmails,
  updateRawEmailStatus,
  claimRawEmailForProcessing,
  requeueStaleProcessingRawEmails,
} from '../repositories/rawEmailsRepo.js';
import {
  insertParsedEmail,
  markParsedAsTicketed,
} from '../repositories/parsedEmailsRepo.js';
import {
  findTicketByComplaintId,
  findTicketByTicketNumber,
  updateTicketStatus,
  updateTicketFields,
} from '../repositories/ticketsRepo.js';
import { parseEmail, parseEmailFromText, sanitizeParsedLocation, normalizeParsedTicket } from '../services/parsingService.js';
import { calculateConfidence } from '../services/confidenceService.js';
import { addEmailComment } from '../services/commentService.js';
import { createTicket, hasRequiredFieldsForOpen, countStructuredComplaintFields, mergeParsedIntoTicket } from '../services/ticketService.js';
import { classifyEmail } from '../services/emailClassificationService.js';
import { validateRequiredFields } from '../services/requiredFieldValidator.js';
import { getEmailText } from '../utils/emailParser.js';
import { listOrganisationIds } from '../repositories/organisationRepository.js';
import { insertAuditLog } from '../services/auditLogService.js';
import { hasPublicColumn } from '../services/schemaCompatService.js';
import { WORKER_TENANT_ISOLATION_ENABLED } from '../config/appConfig.js';

const TICKET_ID_REGEX = /\[Ticket\s+ID:\s*([^\]]+)\]/i;

const QUOTE_STOP_PATTERNS = [/^\s*On\s+/i, /^\s*From:\s*/i, /^\s*Sent:\s*/i];

function lineStopsQuote(line) {
  return QUOTE_STOP_PATTERNS.some((p) => p.test(line));
}

function extractNewReplyContent(rawEmailPayload) {
  try {
    if (!rawEmailPayload || typeof rawEmailPayload !== 'object') return null;
    const text = getEmailText(rawEmailPayload);
    if (!text || typeof text !== 'string') return null;

    const lines = text.split(/\r?\n/);
    const collected = [];
    for (const line of lines) {
      if (lineStopsQuote(line)) break;
      if (/^\s*>/.test(line)) continue;
      collected.push(line);
    }
    const result = collected.join('\n').replace(/\n+/g, '\n').trim();
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

function extractTicketNumberFromSubject(subject) {
  if (subject == null || typeof subject !== 'string') return null;
  const match = subject.match(TICKET_ID_REGEX);
  return match ? match[1].trim() : null;
}

async function handleReplyFlow(raw, ticket) {
  const content = extractNewReplyContent(raw);
  if (content) {
    const { error: commentError } = await addEmailComment(ticket.id, content);
    if (commentError) {
      console.error(`[REPLY] addEmailComment failed ticket ${ticket.id}`, commentError.message);
    }
  }

  let mergedTicket = { ...ticket };
  if (content) {
    try {
      const replyParsed = parseEmailFromText(content);
      const merge = mergeParsedIntoTicket(ticket, replyParsed);
      if (Object.keys(merge).length > 0) {
      const result = await updateTicketFields(ticket.id, merge, raw.organisation_id ?? null);
        if (result.error) {
          console.error(`[REPLY] updateTicketFields failed ticket ${ticket.id}`, result.error.message, merge);
        } else {
          mergedTicket = { ...ticket, ...merge };
        }
      }
    } catch (err) {
      console.error(`[REPLY] parse/merge failed ticket ${ticket.id}`, err.message);
    }
  }

  void insertAuditLog({
    entity_type: 'ticket',
    entity_id: ticket.id,
    action: 'client_provided_additional_details',
    organisation_id: raw.organisation_id ?? ticket.organisation_id ?? null,
    metadata: { raw_email_id: raw.id, ticket_number: ticket.ticket_number ?? null },
  });

  if (ticket.status === 'NEEDS_REVIEW' && hasRequiredFieldsForOpen(mergedTicket)) {
    const { error: updateErr } = await updateTicketStatus(ticket.id, 'OPEN', raw.organisation_id ?? null);
    if (updateErr) {
      console.error(`[REPLY] updateTicketStatus failed ticket ${ticket.id}`, updateErr.message);
    }
  }

  await updateRawEmailStatus(raw.id, 'PROCESSED_REPLY', {
    linked_ticket_id: ticket.id,
    organisation_id: raw.organisation_id ?? null,
  });
}

async function getWorkerTenantScopes() {
  if (!WORKER_TENANT_ISOLATION_ENABLED) return [null];
  const hasOrgOnRawEmails = await hasPublicColumn("raw_emails", "organisation_id");
  if (!hasOrgOnRawEmails) return [null];
  const { data: orgRows } = await listOrganisationIds();
  const tenantIds = Array.isArray(orgRows) ? orgRows.map((r) => r.id).filter(Boolean) : [];
  return [null, ...tenantIds];
}

async function runAutoTicketWorkerForScope(tenantId = null) {
  await requeueStaleProcessingRawEmails();

  const { data: rawEmails, error } = await fetchPendingRawEmails(10, tenantId);

  if (error) {
    const msg = error.message || '';
    if (msg.includes('525') || msg.includes('SSL handshake') || msg.trimStart().startsWith('<!')) {
      console.error('Failed to fetch pending raw emails: database unreachable. Check network and DATABASE_URL.');
    } else {
      console.error('Failed to fetch pending raw emails:', msg);
    }
    return;
  }

  for (const raw of rawEmails || []) {
    try {
      const scopedTenantId = raw.organisation_id ?? tenantId ?? null;

      const { claimed, row: claimedRow } = await claimRawEmailForProcessing(raw.id, scopedTenantId);
      if (!claimed || !claimedRow) {
        continue;
      }
      const activeRaw = claimedRow;

      console.log(JSON.stringify({
        worker: "autoTicketWorker",
        tenantId: scopedTenantId,
        jobId: activeRaw.id,
        event: "processing_raw_email",
      }));
      if (activeRaw.processing_status === 'PROCESSED_REPLY') continue;

      const ticketNumber = extractTicketNumberFromSubject(activeRaw.subject);
      if (ticketNumber) {
        const ticket = await findTicketByTicketNumber(ticketNumber, scopedTenantId);
        if (ticket) {
          await handleReplyFlow(activeRaw, ticket);
          continue;
        }
      }

      const classification = classifyEmail(activeRaw);

      if (classification.type !== 'COMPLAINT') {
        const statusMap = {
          PROMOTIONAL: 'IGNORED_PROMOTIONAL',
          AUTO_REPLY: 'IGNORED_AUTO_REPLY',
          UNKNOWN: 'IGNORED_UNKNOWN',
        };
        await updateRawEmailStatus(
          activeRaw.id,
          statusMap[classification.type] || 'IGNORED_UNKNOWN'
        );
        continue;
      }

      let parsed = parseEmail(activeRaw);
      parsed = normalizeParsedTicket(parsed, activeRaw);
      parsed = sanitizeParsedLocation(parsed);

      if (countStructuredComplaintFields(parsed) < 2) {
        await updateRawEmailStatus(activeRaw.id, 'IGNORED_INSUFFICIENT_DATA', {
          organisation_id: scopedTenantId,
        });
        continue;
      }

      const validation = validateRequiredFields(parsed);
      const confidence = calculateConfidence(parsed);

      const { data: parsedRow, error: parsedError } = await insertParsedEmail({
        raw_email_id: activeRaw.id,
        ...parsed,
        confidence_score: confidence,
        needs_review: confidence < 95,
        ticket_created: false,
      }, scopedTenantId);

      if (parsedError || !parsedRow) {
        await updateRawEmailStatus(activeRaw.id, 'ERROR', {
          processing_error: 'Parsed email insert failed',
          organisation_id: scopedTenantId,
        });
        continue;
      }

      if (parsed.complaint_id) {
        const existing = await findTicketByComplaintId(parsed.complaint_id, scopedTenantId);
        if (existing) {
          const { error: commentError } = await addEmailComment(
            existing.id,
            parsed.remarks || activeRaw.subject
          );
          if (commentError) {
            console.error(`addEmailComment failed ticket ${existing.id}`, commentError.message);
          }
          await updateRawEmailStatus(activeRaw.id, 'COMMENT_ADDED', {
            linked_ticket_id: existing.id,
            organisation_id: scopedTenantId,
          });
          await markParsedAsTicketed(parsedRow.id, scopedTenantId);
          continue;
        }
      }

      await createTicket(
        {
          ...parsed,
          confidence_score: confidence,
          needs_review: confidence < 95,
        },
        activeRaw,
        { requiredComplete: validation.isComplete, organisationId: scopedTenantId }
      );

      await updateRawEmailStatus(activeRaw.id, 'TICKET_CREATED', { organisation_id: scopedTenantId });
      await markParsedAsTicketed(parsedRow.id, scopedTenantId);
    } catch (err) {
      const failId = typeof raw?.id !== 'undefined' ? raw.id : 'unknown';
      console.error(`Worker failed raw_email ${failId}`, err.message);
      if (raw?.id) {
        await updateRawEmailStatus(raw.id, 'ERROR', {
          processing_error: err.message,
          organisation_id: raw.organisation_id ?? tenantId ?? null,
        });
      }
    }
  }
}

export async function runAutoTicketWorker() {
  const scopes = await getWorkerTenantScopes();
  for (const tenantId of scopes) {
    await runAutoTicketWorkerForScope(tenantId);
  }
}
