import { useState } from 'react';
import { AppLayoutNew } from '@/components/layout/AppLayoutNew';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader, FilterBar, DataTableShell, typography } from '@/components/common';
import {
  EmailsTable,
  EmailsTableEmptyState,
  EMAILS_TABLE_LOADING_LABEL,
} from '@/components/emails/EmailsTable';
import { EmailDetailSheet } from '@/components/emails/EmailDetailSheet';
import { useRawEmails } from '@/hooks/useRawEmails';
import { RawEmailWithParsed, EmailProcessingStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Mail,
  RefreshCw,
  FileSearch,
  FileQuestion,
  AlertTriangle,
  Ticket,
  AlertCircle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const STATUS_FILTERS: { value: EmailProcessingStatus | 'all'; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'all', label: 'All Emails', icon: Mail, color: 'bg-muted' },
  { value: 'RECEIVED', label: 'Received', icon: Mail, color: 'bg-blue-500' },
  { value: 'PARSED', label: 'Parsed', icon: FileSearch, color: 'bg-purple-500' },
  { value: 'DRAFT', label: 'Draft', icon: FileQuestion, color: 'bg-amber-500' },
  { value: 'NEEDS_REVIEW', label: 'Needs Review', icon: AlertTriangle, color: 'bg-orange-500' },
  { value: 'TICKET_CREATED', label: 'Ticket Created', icon: Ticket, color: 'bg-green-500' },
  { value: 'ERROR', label: 'Error', icon: AlertCircle, color: 'bg-red-500' },
];

export default function RawEmails() {
  const { data: emails, isLoading, refetch } = useRawEmails();
  const [selectedEmail, setSelectedEmail] = useState<RawEmailWithParsed | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmailProcessingStatus | 'all'>('all');

  const handleViewEmail = (email: RawEmailWithParsed) => {
    setSelectedEmail(email);
    setSheetOpen(true);
  };

  const handleReparse = (emailId: string) => {
    // This would trigger a backend re-parse action
    toast({
      title: 'Re-parse triggered',
      description: 'The email will be re-processed by the parsing engine.',
    });
  };

  const handleCreateTicket = (email: RawEmailWithParsed) => {
    // This would open a ticket creation flow with pre-filled data
    toast({
      title: 'Create ticket',
      description: 'Opening ticket creation form...',
    });
    // Navigate to ticket creation or open modal
  };

  // Filter emails
  const filteredEmails = (emails || []).filter((email) => {
    const matchesSearch = !search ||
      email.subject?.toLowerCase().includes(search.toLowerCase()) ||
      email.from_email.toLowerCase().includes(search.toLowerCase()) ||
      email.parsed_email?.complaint_id?.toLowerCase().includes(search.toLowerCase()) ||
      email.parsed_email?.vehicle_number?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || email.processing_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate status counts
  const statusCounts = (emails || []).reduce((acc, email) => {
    acc[email.processing_status] = (acc[email.processing_status] || 0) + 1;
    return acc;
  }, {} as Record<EmailProcessingStatus, number>);

  const hasActiveFilters = Boolean(search.trim() || statusFilter !== 'all');
  const totalEmails = emails?.length ?? 0;

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="Raw Emails"
            description="Inbound emails from Postmark webhook • Immutable archive"
            icon={Mail}
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            }
          />

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Email status filters">
            {STATUS_FILTERS.map((filter) => {
              const count = filter.value === 'all'
                ? emails?.length || 0
                : statusCounts[filter.value as EmailProcessingStatus] || 0;
              const isActive = statusFilter === filter.value;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={cn(
                    typography.body,
                    'inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-medium transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  <filter.icon className="h-3.5 w-3.5" aria-hidden />
                  {filter.label}
                  <Badge
                    variant={isActive ? 'secondary' : 'outline'}
                    className={cn(typography.meta, 'ml-1 h-5 border-0 px-1.5')}
                  >
                    {count}
                  </Badge>
                </button>
              );
            })}
          </div>

          <FilterBar
            aria-label="Email search"
            search={{
              value: search,
              onChange: setSearch,
              placeholder: 'Search by subject, sender, complaint ID, vehicle...',
              'aria-label': 'Search emails',
            }}
          />

          <DataTableShell
            aria-label="Raw emails"
            loading={isLoading}
            loadingLabel={EMAILS_TABLE_LOADING_LABEL}
            emptyState={
              !isLoading && filteredEmails.length === 0 ? (
                <EmailsTableEmptyState
                  filterEmpty={hasActiveFilters && totalEmails > 0}
                />
              ) : undefined
            }
          >
            {!isLoading && filteredEmails.length > 0 ? (
              <EmailsTable
                emails={filteredEmails}
                onViewEmail={handleViewEmail}
                onReparse={handleReparse}
                onCreateTicket={handleCreateTicket}
              />
            ) : null}
          </DataTableShell>

          <EmailDetailSheet
            email={selectedEmail}
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            onReparse={handleReparse}
            onCreateTicket={handleCreateTicket}
          />
        </div>
      </PageContainer>
    </AppLayoutNew>
  );
}
