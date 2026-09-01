/**
 * Field Visit Sheet helpers for FE portal (client-side from JWT-scoped assigned tickets).
 */
import { createCSVDownload, rowsToCsv } from '@/lib/csvExport';
import ExcelJS from 'exceljs';
import { formatIST } from '@/lib/dateUtils';
import { extractProofImageSources } from '@/lib/extractProofAttachments';
import { formatStateDisplay } from '@/lib/indianStates';
import {
  formatComplaintIdDisplay,
  type FETicketRow,
} from '@/lib/feTicketList';
import { resolveTicketPriorityLevel } from '@/lib/priority';

export type FERemarkLine = {
  id?: string | null;
  at?: string | null;
  source?: string | null;
  author?: string | null;
  body: string;
  attachments?: Record<string, unknown> | null;
};

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

export function combineTicketRemarks(
  ticket: FETicketRow,
  extraRemarks: FERemarkLine[] = [],
): string {
  const parts: string[] = [];
  const initial = fmt(ticket.remarks);
  const description = fmt(ticket.short_description);
  if (initial) parts.push(initial);
  if (description && description !== initial) {
    parts.push(`Description: ${description}`);
  }
  for (const r of extraRemarks) {
    const body = fmt(r.body);
    if (!body) continue;
    const who = [r.author, r.at ? fmtDate(r.at) : null].filter(Boolean).join(' — ');
    const src = r.source != null ? String(r.source).toUpperCase() : '';
    if (src === 'FE') {
      parts.push(
        who
          ? `Additional Remark — ${who}:\n${body}`
          : `Additional Remark:\n${body}`,
      );
    } else {
      const meta = [r.at ? fmtDate(r.at) : null, r.source, r.author]
        .filter(Boolean)
        .join(' · ');
      parts.push(meta ? `${meta}\n${body}` : body);
    }
  }
  return parts.join('\n\n') || '—';
}

function commentIsHidden(remark: FERemarkLine): boolean {
  const att = remark.attachments;
  if (!att || typeof att !== 'object' || Array.isArray(att)) return false;
  const a = att as Record<string, unknown>;
  const visibility = a.image_visibility as { hidden_at?: unknown } | undefined;
  if (visibility?.hidden_at != null && String(visibility.hidden_at).trim() !== '') return true;
  const context = a.assignment_context as { deleted_at?: unknown } | undefined;
  return Boolean(context?.deleted_at != null && String(context.deleted_at).trim() !== '');
}

function visibleRemarks(remarks: FERemarkLine[]): FERemarkLine[] {
  return remarks.filter((remark) => !commentIsHidden(remark));
}

function latestRemark(
  remarks: FERemarkLine[],
  predicate: (remark: FERemarkLine) => boolean,
): string {
  const latest = [...visibleRemarks(remarks)]
    .filter(predicate)
    .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))[0];
  return latest ? fmt(latest.body) || '—' : '—';
}

function timelineSummary(ticket: FETicketRow, remarks: FERemarkLine[]): string {
  const initial = fmt(ticket.remarks);
  const lines = [
    initial ? `${fmtDate(ticket.opened_at || ticket.created_at)} · Initial remark: ${initial}` : '',
    ticket.assigned_at ? `${fmtDate(ticket.assigned_at)} · Assigned` : '',
    ...visibleRemarks(remarks)
      .filter((remark) => fmt(remark.body))
      .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')))
      .map((remark) => {
        const source = fmt(remark.source).toUpperCase() || 'COMMENT';
        return `${remark.at ? fmtDate(remark.at) : 'Date unavailable'} · ${source}: ${fmt(remark.body)}`;
      }),
  ].filter(Boolean);
  return lines.join('\n') || '—';
}

export function buildFieldVisitWorksheetRows(
  tickets: FETicketRow[],
  remarksByTicketId: Record<string, FERemarkLine[]> = {},
  assignedEngineer = '',
): string[][] {
  const header = [
    'Ticket Number', 'Complaint ID', 'Customer', 'Vehicle', 'Issue Type', 'Priority', 'State',
    'Address (location)', 'Contact Person', 'Contact Number', 'Reported Location',
    'Resolution Location', 'Assignment Remarks', 'Latest FE Remark', 'Latest Resolution Remark',
    'Timeline Summary', 'Assigned Engineer',
  ];
  return [
    header,
    ...tickets.map((ticket) => {
      const remarks = remarksByTicketId[ticket.id] ?? [];
      return [
        fmt(ticket.ticket_number),
        formatComplaintIdDisplay(ticket.complaint_id) === '—' ? '' : formatComplaintIdDisplay(ticket.complaint_id),
        fmt(ticket.client_name ?? ticket.client_slug),
        [ticket.vehicle_number, ticket.vehicle_name, ticket.vehicle_type].map(fmt).filter(Boolean).join(' · '),
        fmt(ticket.issue_type ?? ticket.category),
        resolveTicketPriorityLevel(ticket),
        formatStateDisplay(ticket.state),
        fmt(ticket.location),
        fmt(ticket.contact_person),
        fmt(ticket.contact_number),
        fmt(ticket.location),
        fmt(ticket.resolution_location_name),
        fmt(ticket.assignment_remarks),
        latestRemark(remarks, (remark) => fmt(remark.source).toUpperCase() === 'FE'),
        fmt(ticket.verification_remarks) ||
          latestRemark(remarks, (remark) => /resolution/i.test(fmt(remark.body))),
        timelineSummary(ticket, remarks),
        assignedEngineer,
      ];
    }),
  ];
}

export async function downloadFieldVisitExcel(
  tickets: FETicketRow[],
  fromYmd: string,
  toYmd: string,
  remarksByTicketId: Record<string, FERemarkLine[]> = {},
  assignedEngineer = '',
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('FE Worksheet');
  const rows = buildFieldVisitWorksheetRows(tickets, remarksByTicketId, assignedEngineer);
  rows.forEach((values, index) => {
    const row = sheet.addRow(values);
    row.alignment = { vertical: 'top', wrapText: true };
    if (index === 0) {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    }
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: { row: rows.length, column: rows[0].length } };
  sheet.columns.forEach((column) => {
    let width = 12;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      width = Math.max(width, Math.min(String(cell.value ?? '').length + 2, 45));
    });
    column.width = width;
  });
  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `fe-worksheet-${fromYmd}-to-${toYmd}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildFieldVisitCsvRows(
  tickets: FETicketRow[],
  remarksByTicketId: Record<string, FERemarkLine[]> = {},
): (string | number | null | undefined)[][] {
  const header = [
    'Ticket Number',
    'Complaint ID',
    'Customer',
    'Vehicle Number',
    'Vehicle Name',
    'Vehicle Type',
    'State',
    'Location',
    'Issue Type',
    'Incident Title',
    'Priority',
    'Status',
    'Created Date',
    'Assigned Date',
    'Remarks',
  ];
  const rows: (string | number | null | undefined)[][] = [header];
  for (const t of tickets) {
    const priority = resolveTicketPriorityLevel(t);
    rows.push([
      fmt(t.ticket_number),
      formatComplaintIdDisplay(t.complaint_id) === '—' ? '' : formatComplaintIdDisplay(t.complaint_id),
      fmt(t.client_name ?? t.client_slug),
      fmt(t.vehicle_number),
      fmt(t.vehicle_name),
      fmt(t.vehicle_type),
      formatStateDisplay(t.state),
      fmt(t.location),
      fmt(t.issue_type ?? t.category),
      fmt(t.incident_title),
      priority,
      fmt(t.status),
      fmtDate(t.created_at || t.opened_at),
      fmtDate(t.assigned_at),
      combineTicketRemarks(t, remarksByTicketId[t.id] ?? []),
    ]);
  }
  return rows;
}

export function downloadFieldVisitCsv(
  tickets: FETicketRow[],
  fromYmd: string,
  toYmd: string,
  remarksByTicketId: Record<string, FERemarkLine[]> = {},
): void {
  const rows = buildFieldVisitCsvRows(tickets, remarksByTicketId);
  createCSVDownload(rows, `fe-field-visit-${fromYmd}-to-${toYmd}.csv`);
}

/** Exported for tests — CSV string with multiline remarks escaped. */
export function fieldVisitCsvString(
  tickets: FETicketRow[],
  remarksByTicketId: Record<string, FERemarkLine[]> = {},
): string {
  return rowsToCsv(buildFieldVisitCsvRows(tickets, remarksByTicketId));
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

async function toDataUrl(source: string): Promise<string | null> {
  const trimmed = source.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;
  try {
    const res = await fetch(trimmed, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Resolve proof sources (data URLs or http(s)/signed URLs) into embeddable data URLs for print/PDF.
 * Also fetches short-lived signed URLs when only S3 storage paths exist on the comment.
 */
export async function resolveWorksheetImageDataUrls(
  tickets: FETicketRow[],
  remarksByTicketId: Record<string, FERemarkLine[]>,
  opts: {
    fetchSignedUrl?: (ticketId: string, commentId: string, index: number) => Promise<string | null>;
  } = {},
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const ticket of tickets) {
    const resolved: string[] = [];
    for (const remark of visibleRemarks(remarksByTicketId[ticket.id] ?? [])) {
      const inline = extractProofImageSources(remark.attachments);
      if (inline.length > 0) {
        for (const source of inline) {
          const dataUrl = await toDataUrl(source);
          if (dataUrl) resolved.push(dataUrl);
        }
        continue;
      }
      if (!opts.fetchSignedUrl || !remark.id) continue;
      const att = remark.attachments;
      const paths =
        att && typeof att === 'object' && !Array.isArray(att)
          ? (att as { proof_storage_paths?: unknown }).proof_storage_paths
          : null;
      const count = Array.isArray(paths) ? paths.length : 0;
      for (let i = 0; i < count; i += 1) {
        const url = await opts.fetchSignedUrl(ticket.id, String(remark.id), i);
        if (!url) continue;
        const dataUrl = await toDataUrl(url);
        if (dataUrl) resolved.push(dataUrl);
      }
    }
    out[ticket.id] = resolved;
  }
  return out;
}

export async function openFieldVisitPrintWindow(
  tickets: FETicketRow[],
  fromYmd: string,
  toYmd: string,
  opts: {
    feName?: string | null;
    remarksByTicketId?: Record<string, FERemarkLine[]>;
    imagesByTicketId?: Record<string, string[]>;
  } = {},
): Promise<void> {
  const remarksByTicketId = opts.remarksByTicketId ?? {};
  const imagesByTicketId =
    opts.imagesByTicketId ??
    (await resolveWorksheetImageDataUrls(tickets, remarksByTicketId));
  const ticketBlocks = tickets
    .map((t) => {
      const priority = resolveTicketPriorityLevel(t);
      const ticketRemarks = remarksByTicketId[t.id] ?? [];
      const remarks = combineTicketRemarks(t, ticketRemarks);
      const timeline = timelineSummary(t, ticketRemarks);
      const images = imagesByTicketId[t.id] ?? [];
      return `
      <section class="ticket">
        <h2>${escapeHtml(fmtDash(t.ticket_number))}</h2>
        ${block('Complaint ID', formatComplaintIdDisplay(t.complaint_id))}
        ${block('Customer', fmtDash(t.client_name ?? t.client_slug))}
        ${block('Vehicle', fmtDash(
          [t.vehicle_number, t.vehicle_name, t.vehicle_type].map(fmt).filter(Boolean).join(' · ') || t.vehicle_number,
        ))}
        ${block('State', formatStateDisplay(t.state))}
        ${block('Address (Reported Location)', fmtDash(t.location))}
        ${block('Contact Person', fmtDash(t.contact_person))}
        ${block('Contact Number', fmtDash(t.contact_number))}
        ${block('Resolution Location', fmtDash(t.resolution_location_name))}
        ${block('Issue Type', fmtDash(t.issue_type ?? t.category))}
        ${block('Incident Title', fmtDash(t.incident_title))}
        ${block('Priority', priority)}
        ${block('Status', fmtDash(t.status))}
        ${block('Created Date', fmtDate(t.created_at || t.opened_at))}
        ${block('Assigned Date', fmtDate(t.assigned_at))}
        ${block('Assignment Remarks', fmtDash(t.assignment_remarks))}
        ${block('Remarks / Timeline', remarks)}
        ${block('Resolution Remarks', fmtDash(t.verification_remarks))}
        ${block('Timeline Summary', timeline)}
        ${images.length ? `<div class="images">${images.map((source) => `<img src="${escapeHtml(source)}" alt="Ticket proof" loading="lazy" />`).join('')}</div>` : ''}
      </section>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Field Visit Sheet ${escapeHtml(fromYmd)} – ${escapeHtml(toYmd)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; font-size: 11pt; line-height: 1.35; }
    h1 { font-size: 16pt; margin: 0 0 4px; }
    .meta { color: #444; font-size: 10pt; margin-bottom: 16px; }
    .ticket { break-inside: avoid; page-break-inside: avoid; border-top: 1px solid #333; padding: 12px 0 16px; margin-bottom: 8px; }
    .ticket h2 { font-size: 13pt; margin: 0 0 8px; font-family: ui-monospace, monospace; }
    .field { margin: 4px 0 6px; }
    .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    .value { white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
    .images { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; break-inside: avoid; }
    .images img { max-width: 48%; max-height: 190px; object-fit: contain; border: 1px solid #bbb; }
    .toolbar { margin-bottom: 12px; }
    @media print {
      .toolbar { display: none !important; }
      .ticket { page-break-after: auto; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <h1>SAHAYA — Field Visit Sheet</h1>
  <div class="meta">
    Date range: ${escapeHtml(fromYmd)} → ${escapeHtml(toYmd)}
    ${opts.feName ? `<br/>Field Executive: ${escapeHtml(String(opts.feName))}` : ''}
    <br/>Tickets: ${tickets.length}
  </div>
  ${ticketBlocks || '<p>No assigned tickets found for this date range.</p>'}
  <script>window.addEventListener('load', () => { /* ready for print */ });</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
