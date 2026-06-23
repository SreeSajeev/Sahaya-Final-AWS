import { memo } from 'react';
import { RawEmailWithParsed } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmailStatusLifecycle } from './EmailStatusLifecycle';
import { ConfidenceScore } from '@/components/tickets/ConfidenceScore';
import { formatIST } from '@/lib/dateUtils';
import { Eye, RefreshCw, Plus, Mail, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dataTableHeadClassName, typography } from '@/components/common';

/** Copy for parent `DataTableShell` empty states — use with `filterEmpty` prop context. */
export const EMAILS_TABLE_EMPTY_COPY = {
  filtered: {
    title: 'No emails match your filters',
    description: 'Try different keywords or change the status filter.',
  },
  default: {
    title: 'No emails yet',
    description: 'When emails arrive via the Postmark webhook, they will appear here for processing.',
  },
} as const;

export const EMAILS_TABLE_LOADING_LABEL = 'Loading emails...';

/** Build a standard empty state node for `DataTableShell`. */
export function EmailsTableEmptyState({ filterEmpty = false }: { filterEmpty?: boolean }) {
  const copy = filterEmpty ? EMAILS_TABLE_EMPTY_COPY.filtered : EMAILS_TABLE_EMPTY_COPY.default;
  return (
    <div className="flex h-48 flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Mail className="h-7 w-7 text-muted-foreground" aria-hidden />
      </div>
      <h3 className={typography.sectionTitle}>{copy.title}</h3>
      <p className={cn(typography.body, 'mt-1 max-w-sm text-muted-foreground')}>{copy.description}</p>
    </div>
  );
}

interface EmailsTableProps {
  emails: RawEmailWithParsed[];
  /**
   * @deprecated Parent should pass `loading` to `DataTableShell`. When true, this component renders nothing.
   */
  loading?: boolean;
  /** True when filters/search returned zero rows (vs truly no emails in system) */
  filterEmpty?: boolean;
  onViewEmail?: (email: RawEmailWithParsed) => void;
  onReparse?: (emailId: string) => void;
  onCreateTicket?: (email: RawEmailWithParsed) => void;
}

function headClass(extra?: string) {
  return cn(dataTableHeadClassName, extra);
}

function EmailsTableComponent({
  emails,
  loading,
  filterEmpty: _filterEmpty = false,
  onViewEmail,
  onReparse,
  onCreateTicket,
}: EmailsTableProps) {
  if (loading || emails.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={headClass('w-[280px]')}>Subject / Sender</TableHead>
            <TableHead className={headClass('w-[320px]')}>Processing Status</TableHead>
            <TableHead className={headClass()}>Confidence</TableHead>
            <TableHead className={headClass()}>Parsed Fields</TableHead>
            <TableHead className={headClass('w-[140px]')}>Received</TableHead>
            <TableHead className={headClass('text-right w-[120px]')}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {emails.map((email) => {
            const parsed = email.parsed_email;
            const parsedFieldsCount = parsed
              ? [
                  parsed.complaint_id,
                  parsed.vehicle_number,
                  parsed.category,
                  parsed.issue_type,
                  parsed.location,
                ].filter(Boolean).length
              : 0;

            return (
              <TableRow
                key={email.id}
                className="data-table-row cursor-pointer"
                onClick={() => onViewEmail?.(email)}
              >
                <TableCell>
                  <div className="space-y-1">
                    <p className={cn(typography.body, 'font-medium line-clamp-1')}>
                      {email.subject || '(No subject)'}
                    </p>
                    <p className={cn(typography.meta, 'text-muted-foreground line-clamp-1')}>
                      {email.from_email}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <EmailStatusLifecycle
                    currentStatus={email.processing_status}
                    receivedAt={email.received_at}
                    parsedAt={parsed?.created_at}
                    confidenceScore={parsed?.confidence_score}
                  />
                </TableCell>
                <TableCell>
                  {parsed?.confidence_score !== null && parsed?.confidence_score !== undefined ? (
                    <ConfidenceScore score={parsed.confidence_score} showLabel={false} />
                  ) : (
                    <span className={typography.meta}>—</span>
                  )}
                </TableCell>
                <TableCell>
                  {parsed ? (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className={cn(typography.meta, 'text-xs')}>
                        {parsedFieldsCount}/5 fields
                      </Badge>
                      {parsed.complaint_id && (
                        <Badge variant="outline" className={cn(typography.meta, 'font-mono text-xs')}>
                          {parsed.complaint_id}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className={cn(typography.meta, 'text-muted-foreground')}>Not parsed</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={cn(typography.meta, 'text-muted-foreground')}>
                    {formatIST(email.received_at, 'MMM d, HH:mm')}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onViewEmail?.(email)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {email.processing_status !== 'TICKET_CREATED' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onReparse?.(email.id)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        {(email.processing_status === 'DRAFT' ||
                          email.processing_status === 'NEEDS_REVIEW' ||
                          email.processing_status === 'PARSED') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary"
                            onClick={() => onCreateTicket?.(email)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                    {email.processing_status === 'TICKET_CREATED' && email.linked_ticket_id && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export const EmailsTable = memo(EmailsTableComponent);
