import { memo, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatIST } from '@/lib/dateUtils';
import { Ticket } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from './StatusBadge';
import { ConfidenceScore } from './ConfidenceScore';
import { TicketPriorityBadge } from './TicketPriorityBadge';
import { getDisplayConfidenceScore } from '@/lib/confidence';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink, MapPin, ChevronRight, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatStateDisplay } from '@/lib/indianStates';
import {
  TicketNumberDisplay,
  dataTableHeadClassName,
  dataTableHeadDenseClassName,
  dataTableCellDenseClassName,
  typography,
} from '@/components/common';

import { TicketRowSupplement } from '@/hooks/useTicketListSupplement';
import { isTicketBulkAssignable } from '@/hooks/useTickets';

/** Tickets without `client_slug` may only be opened by Service Manager (STAFF) to set it. */
function canOpenTicketDetail(clientSlug: string | null | undefined, role: string | undefined) {
  if (clientSlug?.trim()) return true;
  return role === 'STAFF';
}

function isInteractiveRowTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('a, button, input, label, [role="checkbox"], [data-radix-collection-item]'),
  );
}

/** Fixed widths used only for sticky left offset math. */
const ALL_TICKETS_COL = {
  checkbox: '2.5rem',
  ticket: '7.25rem',
} as const;

function allTicketsStickyLeft(selectable: boolean) {
  if (selectable) {
    return {
      checkbox: '0px',
      ticket: ALL_TICKETS_COL.checkbox,
    };
  }
  return {
    ticket: '0px',
  };
}

const STICKY_HEAD_ROW = 'sticky top-0 z-10 bg-card';
const STICKY_HEAD_CORNER = 'sticky top-0 z-20 bg-card';
const STICKY_BODY = 'sticky z-20';

export const TICKETS_TABLE_EMPTY_COPY = {
  filtered: {
    title: 'No tickets match your filters',
    description:
      'Try different keywords, clear the search box, or change status/confidence filters.',
  },
  default: {
    title: 'No tickets found',
    description: 'Tickets will appear here when support emails are received and processed.',
  },
} as const;

export const TICKETS_TABLE_LOADING_LABEL = 'Loading tickets...';

/** Build a standard empty state node for `DataTableShell`. */
export function TicketsTableEmptyState({ filterEmpty = false }: { filterEmpty?: boolean }) {
  const copy = filterEmpty ? TICKETS_TABLE_EMPTY_COPY.filtered : TICKETS_TABLE_EMPTY_COPY.default;
  return (
    <div className="flex h-48 flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <span className="text-2xl" aria-hidden>
          📭
        </span>
      </div>
      <h3 className={typography.sectionTitle}>{copy.title}</h3>
      <p className={cn(typography.body, 'mt-1 max-w-sm text-muted-foreground')}>{copy.description}</p>
    </div>
  );
}

interface TicketsTableProps {
  tickets: Ticket[];
  /**
   * @deprecated Parent should pass `loading` to `DataTableShell`. When true, this component renders nothing.
   */
  loading?: boolean;
  compact?: boolean;
  /** All Tickets page layout — dense columns, sticky identifiers, row navigation. */
  layout?: 'default' | 'allTickets';
  /** True when filters/search returned zero rows (vs truly no tickets in system) */
  filterEmpty?: boolean;
  /** Optional per-id rows from supplementary fetch (assignment / SLA); missing keys render as — */
  rowExtra?: Record<string, TicketRowSupplement>;
  /** Bulk assign: opt-in only (TicketsList). Default false preserves existing table everywhere. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleTicket?: (ticketId: string, checked: boolean) => void;
  onTogglePage?: (ticketIds: string[], checked: boolean) => void;
}

function headClass(extra?: string, dense = false) {
  return cn(dense ? dataTableHeadDenseClassName : dataTableHeadClassName, extra);
}

function cellClass(extra?: string, dense = false) {
  return cn(dense ? dataTableCellDenseClassName : undefined, extra);
}

const STICKY_EDGE = '';

function stickyHeadClass(extra?: string, corner = false) {
  return cn(
    STICKY_HEAD_ROW,
    corner ? STICKY_HEAD_CORNER : '',
    corner && STICKY_EDGE,
    extra,
  );
}

function stickyBodyClass(rowBg: string, extra?: string) {
  return cn(STICKY_BODY, rowBg, extra);
}

function AllTicketsTable({
  tickets,
  rowExtra,
  selectable,
  selectedIds,
  onToggleTicket,
  onTogglePage,
  userRole,
}: {
  tickets: Ticket[];
  rowExtra: Record<string, TicketRowSupplement>;
  selectable: boolean;
  selectedIds: Set<string>;
  onToggleTicket?: (ticketId: string, checked: boolean) => void;
  onTogglePage?: (ticketIds: string[], checked: boolean) => void;
  userRole: string | undefined;
}) {
  const navigate = useNavigate();
  const stickyLeft = allTicketsStickyLeft(selectable);

  const assignableOnPage = selectable
    ? tickets.filter((t) => isTicketBulkAssignable(t.status))
    : [];
  const pageAssignableIds = assignableOnPage.map((t) => t.id);
  const pageSelectedCount = pageAssignableIds.filter((id) => selectedIds.has(id)).length;
  const pageAllSelected =
    pageAssignableIds.length > 0 && pageSelectedCount === pageAssignableIds.length;
  const pageSomeSelected = pageSelectedCount > 0 && !pageAllSelected;

  const openRow = (ticketId: string) => {
    navigate(`/app/tickets/${ticketId}`);
  };

  const handleRowClick = (ticketId: string, openDetail: boolean, e: MouseEvent<HTMLTableRowElement>) => {
    if (!openDetail || isInteractiveRowTarget(e.target)) return;
    openRow(ticketId);
  };

  const handleRowKeyDown = (
    ticketId: string,
    openDetail: boolean,
    e: KeyboardEvent<HTMLTableRowElement>,
  ) => {
    if (!openDetail) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openRow(ticketId);
    }
  };

  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <table className="w-full min-w-[1200px] caption-bottom text-sm">
        <colgroup>
          {selectable && <col style={{ width: ALL_TICKETS_COL.checkbox }} />}
          <col style={{ width: ALL_TICKETS_COL.ticket }} />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectable && (
              <TableHead
                className={cn(headClass('w-10', false), stickyHeadClass('left-0', true))}
                style={{ left: stickyLeft.checkbox }}
              >
                <Checkbox
                  checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                  disabled={pageAssignableIds.length === 0}
                  onCheckedChange={(checked) => {
                    onTogglePage?.(pageAssignableIds, checked === true);
                  }}
                  aria-label="Select all assignable tickets on this page"
                />
              </TableHead>
            )}
            <TableHead className={cn(headClass('w-14', false), STICKY_HEAD_ROW)}>
              Priority
            </TableHead>
            <TableHead
              className={cn(
                headClass('min-w-[7.25rem]', false),
                stickyHeadClass('border-r border-border shadow-[2px_0_10px_-8px_rgba(0,0,0,0.25)]', true),
              )}
              style={{ left: stickyLeft.ticket }}
            >
              Ticket #
            </TableHead>
            <TableHead className={cn(headClass('min-w-[6rem]', false), STICKY_HEAD_ROW)}>
              Complaint ID
            </TableHead>
            <TableHead className={cn(headClass('min-w-[6.5rem]', false), STICKY_HEAD_ROW)}>
              Status
            </TableHead>
            <TableHead className={cn(headClass('min-w-[6.5rem]', false), STICKY_HEAD_ROW)}>
              Vehicle
            </TableHead>
            <TableHead className={cn(headClass('min-w-[5.5rem]', false), STICKY_HEAD_ROW)}>
              Client
            </TableHead>
            <TableHead className={cn(headClass('min-w-[6.5rem]', false), STICKY_HEAD_ROW)}>
              Category
            </TableHead>
            <TableHead className={cn(headClass('min-w-[7rem]', false), STICKY_HEAD_ROW)}>
              Issue Type
            </TableHead>
            <TableHead className={cn(headClass('min-w-[10rem]', false), STICKY_HEAD_ROW)}>
              Location
            </TableHead>
            <TableHead className={cn(headClass('min-w-[7rem]', false), STICKY_HEAD_ROW)}>
              State
            </TableHead>
            <TableHead className={cn(headClass('min-w-[8.5rem]', false), STICKY_HEAD_ROW)}>
              Created
            </TableHead>
            <TableHead className={cn(headClass('min-w-[7rem]', false), STICKY_HEAD_ROW)}>
              Assigned to
            </TableHead>
            <TableHead className={cn(headClass('min-w-[7.5rem]', false), STICKY_HEAD_ROW)}>
              Assigned at
            </TableHead>
            <TableHead className={cn(headClass('min-w-[7.5rem]', false), STICKY_HEAD_ROW)}>
              Due
            </TableHead>
            <TableHead className={cn(headClass('w-10', false), STICKY_HEAD_ROW)} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket, idx) => {
            const openDetail = canOpenTicketDetail(ticket.client_slug, userRole);
            const ex = rowExtra[ticket.id];
            const bulkAssignable = isTicketBulkAssignable(ticket.status);
            const isSelected = selectedIds.has(ticket.id);
            // Sticky cells must be fully opaque: avoid alpha backgrounds.
            const rowBg = idx % 2 === 0 ? 'bg-background' : 'bg-muted';

            return (
              <TableRow
                key={ticket.id}
                tabIndex={openDetail ? 0 : undefined}
                aria-label={openDetail ? `Open ticket ${ticket.ticket_number}` : undefined}
                onClick={(e) => handleRowClick(ticket.id, openDetail, e)}
                onKeyDown={(e) => handleRowKeyDown(ticket.id, openDetail, e)}
                className={cn(
                  'data-table-row border-b transition-colors duration-150 ease-in-out',
                  rowBg,
                  openDetail &&
                    'cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  !openDetail && 'opacity-90',
                  selectable && isSelected && 'ring-1 ring-inset ring-primary/30',
                )}
              >
                {selectable && (
                  <TableCell
                    className={cn('w-10', stickyBodyClass(rowBg))}
                    style={{ left: stickyLeft.checkbox }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={!bulkAssignable}
                      onCheckedChange={(checked) => {
                        onToggleTicket?.(ticket.id, checked === true);
                      }}
                      aria-label={
                        bulkAssignable
                          ? `Select ticket ${ticket.ticket_number}`
                          : `Ticket ${ticket.ticket_number} cannot be bulk-assigned`
                      }
                    />
                  </TableCell>
                )}
                <TableCell className="w-14 text-center">
                  <TicketPriorityBadge
                    priority={ticket.priority}
                    priority_level={ticket.priority_level}
                  />
                </TableCell>
                <TableCell
                  className={cn(typography.body, stickyBodyClass(rowBg, 'min-w-[7.25rem]'))}
                  style={{ left: stickyLeft.ticket }}
                >
                  <span className="absolute inset-y-0 right-0 w-px bg-border" aria-hidden />
                  {openDetail ? (
                    <Link
                      to={`/app/tickets/${ticket.id}`}
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <TicketNumberDisplay
                        ticketNumber={ticket.ticket_number}
                        organisationId={ticket.organisation_id}
                        variant="default"
                      />
                    </Link>
                  ) : (
                    <span className={typography.meta} title="Set client short name (Service Manager only)">
                      <TicketNumberDisplay
                        ticketNumber={ticket.ticket_number}
                        organisationId={ticket.organisation_id}
                        variant="default"
                      />
                    </span>
                  )}
                </TableCell>
                <TableCell className="min-w-[6rem] max-w-[7.5rem] font-mono text-xs text-muted-foreground">
                  {ticket.complaint_id?.trim() ? ticket.complaint_id : '—'}
                </TableCell>
                <TableCell className={typography.body}>
                  <StatusBadge status={ticket.status} />
                </TableCell>
                <TableCell className={typography.body}>
                  {ticket.vehicle_number ? (
                    <Badge variant="outline" className="font-mono text-xs">
                      {ticket.vehicle_number}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="max-w-[160px]">
                  <span className={cn(typography.body, 'line-clamp-2 break-words font-mono')}>
                    {ticket.client_slug?.trim() ? ticket.client_slug : '—'}
                  </span>
                </TableCell>
                <TableCell className={typography.body}>
                  {ticket.category?.trim() ? ticket.category : '—'}
                </TableCell>
                <TableCell className={typography.body}>
                  {ticket.issue_type || '—'}
                </TableCell>
                <TableCell className={typography.body}>
                  <span className="inline-flex max-w-[220px] items-start gap-1">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className={cn(typography.body, 'break-words')}>
                      {ticket.location
                        ? ticket.location.length > 60
                          ? `${ticket.location.slice(0, 60)}…`
                          : ticket.location
                        : '—'}
                    </span>
                  </span>
                </TableCell>
                <TableCell className={typography.body}>
                  {formatStateDisplay(ticket.state)}
                </TableCell>
                <TableCell className={cn(typography.body, 'whitespace-nowrap')}>
                  {ticket.created_at ? formatIST(ticket.created_at, 'MMM d, yyyy HH:mm') : '—'}
                </TableCell>
                <TableCell
                  className={cn(typography.meta, 'max-w-[140px] truncate')}
                  title={ex?.assignedFeName ?? undefined}
                >
                  {ex?.assignedFeName ?? '—'}
                </TableCell>
                <TableCell className={cn(typography.meta, 'whitespace-nowrap')}>
                  {ex?.assignedAt ? formatIST(ex.assignedAt, 'MMM d, HH:mm') : '—'}
                </TableCell>
                <TableCell className={cn(typography.meta, 'whitespace-nowrap')}>
                  {ex?.dueAssignment ? formatIST(ex.dueAssignment, 'MMM d, HH:mm') : '—'}
                </TableCell>
                <TableCell
                  className="w-10"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {openDetail ? (
                    <Link
                      to={`/app/tickets/${ticket.id}`}
                      className="inline-flex rounded p-1 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Open ticket"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex p-1 text-muted-foreground" aria-hidden>
                      <ExternalLink className="h-4 w-4" />
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </table>
    </div>
  );
}

function TicketsTableComponent({
  tickets,
  loading,
  compact = false,
  layout = 'default',
  filterEmpty: _filterEmpty = false,
  rowExtra = {},
  selectable = false,
  selectedIds,
  onToggleTicket,
  onTogglePage,
}: TicketsTableProps) {
  const { userProfile } = useAuth();

  const assignableOnPage = selectable
    ? tickets.filter((t) => isTicketBulkAssignable(t.status))
    : [];
  const selectedSet = selectedIds ?? new Set<string>();
  const pageAssignableIds = assignableOnPage.map((t) => t.id);
  const pageSelectedCount = pageAssignableIds.filter((id) => selectedSet.has(id)).length;
  const pageAllSelected =
    pageAssignableIds.length > 0 && pageSelectedCount === pageAssignableIds.length;
  const pageSomeSelected = pageSelectedCount > 0 && !pageAllSelected;

  if (loading || tickets.length === 0) {
    return null;
  }

  if (layout === 'allTickets') {
    return (
      <AllTicketsTable
        tickets={tickets}
        rowExtra={rowExtra}
        selectable={selectable}
        selectedIds={selectedSet}
        onToggleTicket={onToggleTicket}
        onTogglePage={onTogglePage}
        userRole={userProfile?.role}
      />
    );
  }

  if (compact) {
    return (
      <div className="divide-y divide-border">
        {tickets.map((ticket) => {
          const open = canOpenTicketDetail(ticket.client_slug, userProfile?.role);
          const rowClass =
            'flex items-center justify-between py-3 px-4 rounded-lg transition-all duration-200 ease-in-out group';
          const inner = (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-center gap-2">
                    <TicketNumberDisplay
                      ticketNumber={ticket.ticket_number}
                      organisationId={ticket.organisation_id}
                      variant="default"
                    />
                    <TicketPriorityBadge
                      priority={ticket.priority}
                      priority_level={ticket.priority_level}
                      className="shrink-0"
                    />
                  </div>
                  <span className={cn(typography.meta, 'truncate')}>
                    {ticket.short_description
                      ? ticket.short_description.slice(0, 60) +
                        (ticket.short_description.length > 60 ? '…' : '')
                      : ticket.issue_type || ticket.category || 'Unclassified'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={ticket.status} />
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
            </>
          );
          return open ? (
            <Link
              key={ticket.id}
              to={`/app/tickets/${ticket.id}`}
              className={`${rowClass} hover:bg-muted/40 hover:shadow-sm`}
            >
              {inner}
            </Link>
          ) : (
            <div key={ticket.id} className={`${rowClass} cursor-not-allowed opacity-80`}>
              {inner}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className={headClass('w-10')}>
                <Checkbox
                  checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                  disabled={pageAssignableIds.length === 0}
                  onCheckedChange={(checked) => {
                    onTogglePage?.(pageAssignableIds, checked === true);
                  }}
                  aria-label="Select all assignable tickets on this page"
                />
              </TableHead>
            )}
            <TableHead className={headClass('w-10')}>Priority</TableHead>
            <TableHead className={headClass()}>Ticket #</TableHead>
            <TableHead className={headClass('text-right')}>Status</TableHead>
            <TableHead className={headClass()}>Confidence</TableHead>
            <TableHead className={headClass()}>Vehicle</TableHead>
            <TableHead className={headClass()}>Client</TableHead>
            <TableHead className={headClass()}>Issue Type</TableHead>
            <TableHead className={headClass()}>Location</TableHead>
            <TableHead className={headClass()}>State</TableHead>
            <TableHead className={headClass()}>Created</TableHead>
            <TableHead className={headClass()}>Opened</TableHead>
            <TableHead className={headClass()}>Assigned to</TableHead>
            <TableHead className={headClass()}>Assigned at</TableHead>
            <TableHead className={headClass()}>Due</TableHead>
            <TableHead className={headClass('w-[50px]')} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket, idx) => {
            const openDetail = canOpenTicketDetail(ticket.client_slug, userProfile?.role);
            const ex = rowExtra[ticket.id];
            const bulkAssignable = isTicketBulkAssignable(ticket.status);
            const isSelected = selectedSet.has(ticket.id);
            return (
              <TableRow
                key={ticket.id}
                className={cn(
                  'data-table-row transition-colors duration-150 ease-in-out hover:bg-muted/40 hover:shadow-sm',
                  idx % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                  selectable && isSelected && 'ring-1 ring-primary/30',
                )}
              >
                {selectable && (
                  <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      disabled={!bulkAssignable}
                      onCheckedChange={(checked) => {
                        onToggleTicket?.(ticket.id, checked === true);
                      }}
                      aria-label={
                        bulkAssignable
                          ? `Select ticket ${ticket.ticket_number}`
                          : `Ticket ${ticket.ticket_number} cannot be bulk-assigned`
                      }
                    />
                  </TableCell>
                )}
                <TableCell className="text-center">
                  <TicketPriorityBadge
                    priority={ticket.priority}
                    priority_level={ticket.priority_level}
                  />
                </TableCell>
                <TableCell>
                  {openDetail ? (
                    <Link to={`/app/tickets/${ticket.id}`} className="text-primary hover:underline">
                      <TicketNumberDisplay
                        ticketNumber={ticket.ticket_number}
                        organisationId={ticket.organisation_id}
                        variant="default"
                      />
                    </Link>
                  ) : (
                    <span className={typography.meta} title="Set client short name (Service Manager only)">
                      <TicketNumberDisplay
                        ticketNumber={ticket.ticket_number}
                        organisationId={ticket.organisation_id}
                        variant="default"
                      />
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center justify-end">
                    <StatusBadge status={ticket.status} />
                  </span>
                </TableCell>
                <TableCell>
                  <ConfidenceScore score={getDisplayConfidenceScore(ticket)} size="sm" />
                </TableCell>
                <TableCell className={typography.body}>
                  {ticket.vehicle_number ? (
                    <Badge variant="outline">{ticket.vehicle_number}</Badge>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="max-w-[160px]">
                  <span className={cn(typography.body, 'line-clamp-2 break-words font-mono')}>
                    {ticket.client_slug?.trim() ? ticket.client_slug : '—'}
                  </span>
                </TableCell>
                <TableCell className={typography.body}>{ticket.issue_type || '—'}</TableCell>
                <TableCell>
                  <span className="inline-flex max-w-[280px] items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className={cn(typography.body, 'break-words')}>
                      {ticket.location
                        ? ticket.location.length > 80
                          ? `${ticket.location.slice(0, 80)}…`
                          : ticket.location
                        : '—'}
                    </span>
                  </span>
                </TableCell>
                <TableCell className={typography.body}>
                  {formatStateDisplay(ticket.state)}
                </TableCell>
                <TableCell className={cn(typography.body, 'whitespace-nowrap')}>
                  {ticket.created_at ? formatIST(ticket.created_at, 'MMM d, yyyy HH:mm') : '—'}
                </TableCell>
                <TableCell className={cn(typography.body, 'whitespace-nowrap')}>
                  {formatIST(ticket.opened_at, 'MMM d, HH:mm')}
                </TableCell>
                <TableCell className={cn(typography.meta, 'max-w-[140px] truncate')} title={ex?.assignedFeName ?? undefined}>
                  {ex?.assignedFeName ?? '—'}
                </TableCell>
                <TableCell className={cn(typography.meta, 'whitespace-nowrap')}>
                  {ex?.assignedAt ? formatIST(ex.assignedAt, 'MMM d, HH:mm') : '—'}
                </TableCell>
                <TableCell className={cn(typography.meta, 'whitespace-nowrap')}>
                  {ex?.dueAssignment ? formatIST(ex.dueAssignment, 'MMM d, HH:mm') : '—'}
                </TableCell>
                <TableCell>
                  {openDetail ? (
                    <Link
                      to={`/app/tickets/${ticket.id}`}
                      className="inline-flex p-2 hover:text-primary"
                      aria-label="Open ticket"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex p-2 text-muted-foreground" aria-hidden>
                      <ExternalLink className="h-4 w-4" />
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export const TicketsTable = memo(TicketsTableComponent);
