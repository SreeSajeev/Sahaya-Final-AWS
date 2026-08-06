import { type KeyboardEvent, type MouseEvent, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatIST } from '@/lib/dateUtils';
import { StatusBadge } from '@/components/tickets/StatusBadge';
import { TicketPriorityBadge } from '@/components/tickets/TicketPriorityBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TicketNumberDisplay,
  dataTableHeadDenseClassName,
  dataTableCellDenseClassName,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatStateDisplay } from '@/lib/indianStates';
import {
  formatComplaintIdDisplay,
  formatFETicketWorkType,
  type FETicketRow,
} from '@/lib/feTicketList';

function isInteractiveRowTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('a, button, input, label, [role="checkbox"], [data-radix-collection-item]'),
  );
}

function headClass(extra?: string) {
  return cn(dataTableHeadDenseClassName, extra);
}

function cellClass(extra?: string) {
  return cn(dataTableCellDenseClassName, extra);
}

function fmtCell(v?: string | null) {
  const s = v != null ? String(v).trim() : '';
  return s || '—';
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return formatIST(iso, 'MMM d, yyyy');
}

interface FETicketsTableProps {
  tickets: FETicketRow[];
}

function FETicketsTableComponent({ tickets }: FETicketsTableProps) {
  const navigate = useNavigate();

  const openTicket = (ticketId: string) => {
    navigate(`/fe/ticket/${encodeURIComponent(ticketId)}`);
  };

  const handleRowClick = (ticketId: string, e: MouseEvent<HTMLTableRowElement>) => {
    if (isInteractiveRowTarget(e.target)) return;
    openTicket(ticketId);
  };

  const handleRowKeyDown = (ticketId: string, e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openTicket(ticketId);
    }
  };

  return (
    <div className="w-full min-w-0 overflow-x-auto touch-scroll-x scrollbar-thin">
      <Table className="min-w-[1180px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={headClass('min-w-[7.25rem] sticky left-0 z-20 bg-card border-r border-border')}>
              Ticket No.
            </TableHead>
            <TableHead className={headClass('min-w-[6.5rem]')}>Complaint ID</TableHead>
            <TableHead className={headClass('min-w-[7rem]')}>Customer</TableHead>
            <TableHead className={headClass('min-w-[6.5rem] hidden sm:table-cell')}>Vehicle</TableHead>
            <TableHead className={headClass('min-w-[5.5rem]')}>State</TableHead>
            <TableHead className={headClass('min-w-[8rem]')}>Location</TableHead>
            <TableHead className={headClass('min-w-[7rem]')}>Issue Type</TableHead>
            <TableHead className={headClass('min-w-[5.5rem]')}>Priority</TableHead>
            <TableHead className={headClass('min-w-[7rem]')}>Status</TableHead>
            <TableHead className={headClass('min-w-[6.5rem] hidden lg:table-cell')}>Created</TableHead>
            <TableHead className={headClass('min-w-[7.5rem] hidden xl:table-cell')}>Work Type</TableHead>
            <TableHead className={headClass('min-w-[4.5rem]')}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow
              key={ticket.id}
              className="group cursor-pointer"
              tabIndex={0}
              role="link"
              aria-label={`Open ticket ${ticket.ticket_number}`}
              onClick={(e) => handleRowClick(ticket.id, e)}
              onKeyDown={(e) => handleRowKeyDown(ticket.id, e)}
            >
              <TableCell
                className={cellClass(
                  'sticky left-0 z-10 bg-card border-r border-border font-medium group-hover:bg-muted/50',
                )}
              >
                <TicketNumberDisplay
                  ticketNumber={ticket.ticket_number}
                  organisationId={ticket.organisation_id}
                  variant="compact"
                />
              </TableCell>
              <TableCell className={cellClass('font-mono text-xs')} title={formatComplaintIdDisplay(ticket.complaint_id)}>
                {formatComplaintIdDisplay(ticket.complaint_id)}
              </TableCell>
              <TableCell className={cellClass('max-w-[10rem] truncate')} title={fmtCell(ticket.client_name ?? ticket.client_slug)}>
                {fmtCell(ticket.client_name ?? ticket.client_slug)}
              </TableCell>
              <TableCell className={cellClass('hidden sm:table-cell font-mono text-xs')}>
                {fmtCell(ticket.vehicle_number)}
              </TableCell>
              <TableCell className={cellClass('max-w-[8rem] truncate')} title={formatStateDisplay(ticket.state)}>
                {formatStateDisplay(ticket.state)}
              </TableCell>
              <TableCell className={cellClass('max-w-[12rem] truncate')} title={fmtCell(ticket.location)}>
                {fmtCell(ticket.location)}
              </TableCell>
              <TableCell className={cellClass('max-w-[10rem] truncate')} title={fmtCell(ticket.issue_type)}>
                {fmtCell(ticket.issue_type)}
              </TableCell>
              <TableCell className={cellClass()}>
                <TicketPriorityBadge
                  priority={ticket.priority}
                  priority_level={ticket.priority_level}
                />
              </TableCell>
              <TableCell className={cellClass()}>
                <StatusBadge status={ticket.status} />
              </TableCell>
              <TableCell className={cellClass('hidden lg:table-cell whitespace-nowrap text-muted-foreground')}>
                {fmtDate(ticket.created_at || ticket.opened_at)}
              </TableCell>
              <TableCell className={cellClass('hidden xl:table-cell whitespace-nowrap text-muted-foreground')}>
                {formatFETicketWorkType(ticket)}
              </TableCell>
              <TableCell className={cellClass()}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    openTicket(ticket.id);
                  }}
                >
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export const FETicketsTable = memo(FETicketsTableComponent);
