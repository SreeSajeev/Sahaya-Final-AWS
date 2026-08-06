/**
 * Single-ticket printable document for Field Executives (browser Print / Save as PDF).
 */
import { formatIST } from '@/lib/dateUtils';
import { formatStateDisplay } from '@/lib/indianStates';
import {
  formatComplaintIdDisplay,
  type FETicketRow,
} from '@/lib/feTicketList';
import { resolveTicketPriorityLevel } from '@/lib/priority';
import type { FERemarkLine } from '@/lib/feFieldVisitExport';

function fmt(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

function fmtDash(v: unknown): string {
  return fmt(v) || '—';
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return formatIST(iso, 'PPp');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function block(label: string, value: string): string {
  return `<div class="field"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

export type FETicketPrintInput = {
  ticket: FETicketRow;
  feName?: string | null;
  comments?: FERemarkLine[];
};

export function buildFETicketPrintHtml(input: FETicketPrintInput): string {
  const t = input.ticket;
  const priority = resolveTicketPriorityLevel(t);
  const description = fmt(t.short_description) || '—';
  const initialRemarks = fmt(t.remarks) || '—';

  const additional =
    (input.comments ?? [])
      .map((c) => {
        const head = [c.at ? fmtDate(c.at) : null, c.source, c.author]
          .filter(Boolean)
          .join(' · ');
        const body = fmt(c.body) || '—';
        return `<div class="remark"><div class="remark-meta">${escapeHtml(head || 'Remark')}</div><div class="value">${escapeHtml(body)}</div></div>`;
      })
      .join('\n') || '<p class="muted">None</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Ticket ${escapeHtml(fmtDash(t.ticket_number))}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; font-size: 11pt; line-height: 1.4; }
    h1 { font-size: 18pt; margin: 0 0 2px; letter-spacing: 0.06em; }
    .sub { color: #555; font-size: 10pt; margin-bottom: 18px; }
    h2 { font-size: 12pt; border-bottom: 1px solid #333; padding-bottom: 4px; margin: 18px 0 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
    .field { margin: 0 0 6px; }
    .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    .value { white-space: pre-wrap; word-break: break-word; }
    .remark { margin: 0 0 10px; padding-bottom: 8px; border-bottom: 1px dotted #ccc; }
    .remark-meta { font-size: 9pt; color: #444; margin-bottom: 2px; }
    .muted { color: #666; }
    .toolbar { margin-bottom: 14px; }
    @media print { .toolbar { display: none !important; } }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <h1>SAHAYA</h1>
  <div class="sub">Field ticket record</div>

  <div class="grid">
    ${block('Ticket Number', fmtDash(t.ticket_number))}
    ${block('Complaint ID', formatComplaintIdDisplay(t.complaint_id))}
    ${block('Status', fmtDash(t.status))}
    ${block('Priority', priority)}
    ${block('Issue Type', fmtDash(t.issue_type ?? t.category))}
    ${block('Customer', fmtDash(t.client_name ?? t.client_slug))}
    ${block('Vehicle Number', fmtDash(t.vehicle_number))}
    ${block('State', formatStateDisplay(t.state))}
    ${block('Location', fmtDash(t.location))}
    ${block('Created Date', fmtDate(t.created_at || t.opened_at))}
    ${block('Assigned Date', fmtDate(t.assigned_at))}
    ${block('Field Executive', fmtDash(input.feName))}
  </div>

  <h2>Ticket Description</h2>
  ${block('Description', description)}

  <h2>Initial Remarks</h2>
  ${block('Remarks', initialRemarks)}

  <h2>Additional Remarks / Comments</h2>
  ${additional}

  <h2>Assignment</h2>
  <div class="grid">
    ${block('Manager assignment due', fmtDate(t.assignment_due))}
  </div>
</body>
</html>`;
}

export function openFETicketPrintWindow(input: FETicketPrintInput): void {
  const html = buildFETicketPrintHtml(input);
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
