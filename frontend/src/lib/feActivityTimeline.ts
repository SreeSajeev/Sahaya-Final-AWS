/**
 * Build chronological FE-visible activity timeline entries from ticket + comments.
 * Does not invent historical events — only derives labels from existing data.
 */

import type { TicketComment } from "@/lib/types";
import { extractProofImageSources } from "@/lib/extractProofAttachments";

export type FeTimelineEventType =
  | "ASSIGNED"
  | "INITIAL_REMARKS"
  | "FE_REMARK"
  | "FE_ADDITIONAL_REMARK"
  | "PROOF_UPLOADED"
  | "ONSITE_PROOF"
  | "RESOLUTION_PROOF"
  | "EMAIL"
  | "STATUS_NOTE";

export type FeTimelineEvent = {
  id: string;
  sortAt: string;
  sortKey: string;
  eventType: FeTimelineEventType;
  label: string;
  body: string | null;
  actor: string | null;
  commentId: string | null;
  proofSources: string[];
  proofStoragePathCount: number;
  attachments: unknown;
};

function attObj(attachments: unknown): Record<string, unknown> {
  if (attachments && typeof attachments === "object" && !Array.isArray(attachments)) {
    return attachments as Record<string, unknown>;
  }
  return {};
}

function proofPathCount(attachments: unknown): number {
  const a = attObj(attachments);
  return Array.isArray(a.proof_storage_paths) ? a.proof_storage_paths.length : 0;
}

function hasProofMedia(attachments: unknown): boolean {
  if (extractProofImageSources(attachments).length > 0) return true;
  return proofPathCount(attachments) > 0;
}

function classifyFeComment(c: TicketComment): {
  eventType: FeTimelineEventType;
  label: string;
  body: string | null;
  hide: boolean;
} {
  const a = attObj(c.attachments);
  const rejection = a.rejection;
  if (rejection != null && typeof rejection === "object") {
    // Internal rejection metadata is manager-oriented; FE sees a short status note only.
    return {
      eventType: "STATUS_NOTE",
      label: "Ticket status update",
      body: "This ticket was rejected by operations.",
      hide: false,
    };
  }

  const feRemark = a.fe_remark;
  if (feRemark && typeof feRemark === "object") {
    const et = String((feRemark as { event_type?: string }).event_type || "");
    if (et === "FE_ADDITIONAL_REMARK") {
      return {
        eventType: "FE_ADDITIONAL_REMARK",
        label: "Additional Remark",
        body: c.body ?? null,
        hide: false,
      };
    }
  }

  const source = String(c.source || "").toUpperCase();
  const body = c.body != null ? String(c.body) : "";
  const bodyLower = body.toLowerCase();
  const proof = hasProofMedia(c.attachments);

  if (source === "EMAIL") {
    return { eventType: "EMAIL", label: "Email note", body: c.body ?? null, hide: false };
  }

  if (source === "STAFF") {
    // Generic staff comments: show body without exposing privileged attachment metadata.
    if (!body.trim()) return { eventType: "STATUS_NOTE", label: "Staff note", body: null, hide: true };
    return {
      eventType: "STATUS_NOTE",
      label: "Operations note",
      body: c.body ?? null,
      hide: false,
    };
  }

  if (proof) {
    if (bodyLower.includes("resolution")) {
      return {
        eventType: "RESOLUTION_PROOF",
        label: "Resolution submitted",
        body: body.trim() ? body : null,
        hide: false,
      };
    }
    if (bodyLower.includes("on_site") || bodyLower.includes("on-site") || bodyLower.includes("onsite")) {
      return {
        eventType: "ONSITE_PROOF",
        label: "On-site update",
        body: body.trim() ? body : null,
        hide: false,
      };
    }
    return {
      eventType: "PROOF_UPLOADED",
      label: "Proof uploaded",
      body: body.trim() ? body : null,
      hide: false,
    };
  }

  if (source === "FE") {
    // Legacy FE remarks without fe_remark metadata — still additional history.
    return {
      eventType: "FE_ADDITIONAL_REMARK",
      label: "Additional Remark",
      body: c.body ?? null,
      hide: false,
    };
  }

  return {
    eventType: "FE_REMARK",
    label: "Remark",
    body: c.body ?? null,
    hide: false,
  };
}

/**
 * Oldest → newest. Secondary sort by id for stability.
 */
export function buildFeActivityTimeline(opts: {
  ticket: {
    id?: string;
    remarks?: string | null;
    opened_at?: string | null;
    created_at?: string | null;
    assigned_at?: string | null;
  };
  comments: TicketComment[];
  assignedToName?: string | null;
}): FeTimelineEvent[] {
  const events: FeTimelineEvent[] = [];
  const t = opts.ticket;

  const initial = t.remarks != null ? String(t.remarks).trim() : "";
  if (initial) {
    const at = t.opened_at || t.created_at || new Date(0).toISOString();
    events.push({
      id: `initial-remarks-${t.id ?? "ticket"}`,
      sortAt: String(at),
      sortKey: `0-${String(at)}`,
      eventType: "INITIAL_REMARKS",
      label: "Initial Remarks",
      body: String(t.remarks),
      actor: null,
      commentId: null,
      proofSources: [],
      proofStoragePathCount: 0,
      attachments: null,
    });
  }

  if (t.assigned_at) {
    const name = opts.assignedToName?.trim() || null;
    events.push({
      id: `assigned-${t.id ?? "ticket"}-${t.assigned_at}`,
      sortAt: String(t.assigned_at),
      sortKey: `1-${String(t.assigned_at)}`,
      eventType: "ASSIGNED",
      label: name ? `Assigned to ${name}` : "Assigned",
      body: null,
      actor: name,
      commentId: null,
      proofSources: [],
      proofStoragePathCount: 0,
      attachments: null,
    });
  }

  for (const c of opts.comments ?? []) {
    const classified = classifyFeComment(c);
    if (classified.hide) continue;
    const created = c.created_at ? String(c.created_at) : "";
    events.push({
      id: c.id,
      sortAt: created,
      sortKey: `2-${created}-${c.id}`,
      eventType: classified.eventType,
      label: classified.label,
      body: classified.body,
      actor: null,
      commentId: c.id,
      proofSources: extractProofImageSources(c.attachments),
      proofStoragePathCount: proofPathCount(c.attachments),
      attachments: c.attachments,
    });
  }

  events.sort((a, b) => {
    const ta = new Date(a.sortAt).getTime();
    const tb = new Date(b.sortAt).getTime();
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    if (na !== nb) return na - nb;
    return a.sortKey.localeCompare(b.sortKey);
  });

  return events;
}
