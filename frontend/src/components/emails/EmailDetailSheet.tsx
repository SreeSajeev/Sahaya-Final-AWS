import { RawEmailWithParsed } from '@/lib/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmailStatusLifecycle } from './EmailStatusLifecycle';
import { ConfidenceScore } from '@/components/tickets/ConfidenceScore';
import { formatIST } from '@/lib/dateUtils';
import { 
  Mail, 
  Calendar, 
  User, 
  FileText, 
  MapPin, 
  Car, 
  Tag, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface EmailDetailSheetProps {
  email: RawEmailWithParsed | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReparse?: (emailId: string) => void;
  onCreateTicket?: (email: RawEmailWithParsed) => void;
}

export function EmailDetailSheet({ 
  email, 
  open, 
  onOpenChange,
  onReparse,
  onCreateTicket 
}: EmailDetailSheetProps) {
  const [showRawPayload, setShowRawPayload] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!email) return null;

  const parsed = email.parsed_email;

  const payloadObj =
    email.payload && typeof email.payload === "object" && !Array.isArray(email.payload)
      ? (email.payload as Record<string, unknown>)
      : null;

  const rawFromPayload =
    (payloadObj?.StrippedTextReply as string | undefined) ||
    (payloadObj?.TextBody as string | undefined) ||
    (payloadObj?.textBody as string | undefined) ||
    (payloadObj?.HtmlBody as string | undefined) ||
    (payloadObj?.htmlBody as string | undefined) ||
    null;

  const rawEmailText =
    (email.raw_text && String(email.raw_text).trim() !== "" ? String(email.raw_text) : null) ||
    (rawFromPayload && String(rawFromPayload).trim() !== "" ? String(rawFromPayload) : null) ||
    (parsed?.remarks && String(parsed.remarks).trim() !== "" ? String(parsed.remarks) : null) ||
    "No email content available.";

  const handleCopyPayload = async () => {
    await navigator.clipboard.writeText(JSON.stringify(email.payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const parsedFields = [
    { label: 'Complaint ID', value: parsed?.complaint_id, icon: Tag, isMissing: !parsed?.complaint_id },
    { label: 'Vehicle Number', value: parsed?.vehicle_number, icon: Car, isMissing: !parsed?.vehicle_number },
    { label: 'Category', value: parsed?.category, icon: FileText, isMissing: !parsed?.category },
    { label: 'Issue Type', value: parsed?.issue_type, icon: AlertTriangle, isMissing: !parsed?.issue_type },
    { label: 'Location', value: parsed?.location, icon: MapPin, isMissing: !parsed?.location },
  ];

  const canCreateTicket = email.processing_status === 'DRAFT' || 
                          email.processing_status === 'NEEDS_REVIEW' || 
                          email.processing_status === 'PARSED';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] p-0">
        <SheetHeader className="px-6 py-4 border-b bg-muted/30">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <SheetTitle className="text-lg">Email Details</SheetTitle>
              <p className="text-sm text-muted-foreground font-mono">
                {email.message_id.slice(0, 40)}...
              </p>
            </div>
            <EmailStatusLifecycle
              currentStatus={email.processing_status}
              receivedAt={email.received_at}
              parsedAt={parsed?.created_at}
              confidenceScore={parsed?.confidence_score}
              compact
            />
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="px-6 py-4 space-y-6">
            {/* Processing Status Lifecycle (Full) */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Processing Lifecycle
              </h3>
              <EmailStatusLifecycle
                currentStatus={email.processing_status}
                receivedAt={email.received_at}
                parsedAt={parsed?.created_at}
                confidenceScore={parsed?.confidence_score}
              />
            </div>

            <Separator />

            {/* Email Metadata */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Email Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    From
                  </div>
                  <p className="text-sm font-medium">{email.from_email}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    To
                  </div>
                  <p className="text-sm font-medium">{email.to_email}</p>
                </div>
                <div className="space-y-1 col-span-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Subject
                  </div>
                  <p className="text-sm font-medium">{email.subject || '(No subject)'}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    Received
                  </div>
                  <p className="text-sm font-medium">
                    {formatIST(email.received_at, 'MMM d, yyyy HH:mm:ss')}
                  </p>
                </div>
                {email.thread_id && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Thread ID</div>
                    <p className="text-sm font-mono">{email.thread_id.slice(0, 16)}...</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Parsed Fields */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Parsed Fields
                </h3>
                {parsed?.confidence_score !== null && parsed?.confidence_score !== undefined && (
                  <ConfidenceScore score={parsed.confidence_score} />
                )}
              </div>
              
              {parsed ? (
                <div className="grid grid-cols-2 gap-3">
                  {parsedFields.map((field) => (
                    <div 
                      key={field.label}
                      className={cn(
                        'p-3 rounded-lg border',
                        field.isMissing 
                          ? 'border-dashed border-amber-300 bg-amber-50/50' 
                          : 'bg-muted/30'
                      )}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <field.icon className="h-3.5 w-3.5" />
                        {field.label}
                        {field.isMissing && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-300">
                            Missing
                          </Badge>
                        )}
                      </div>
                      <p className={cn(
                        'text-sm font-medium',
                        field.isMissing && 'text-muted-foreground italic'
                      )}>
                        {field.value || 'Not extracted'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-dashed bg-muted/30 text-center">
                  <p className="text-sm text-muted-foreground">
                    This email has not been parsed yet.
                  </p>
                </div>
              )}

              {parsed?.remarks && (
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <div className="text-xs text-muted-foreground mb-1">Remarks / Description</div>
                  <p className="text-sm">{parsed.remarks}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Raw Email */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Raw Email
              </h3>
              <pre className="p-4 rounded-lg bg-muted/50 border text-xs whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
                {rawEmailText}
              </pre>
            </div>

            <Separator />

            {/* Raw Payload */}
            <div className="space-y-3">
              <button
                onClick={() => setShowRawPayload(!showRawPayload)}
                className="flex items-center justify-between w-full text-left"
              >
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Raw Payload
                </h3>
                {showRawPayload ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              
              {showRawPayload && (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={handleCopyPayload}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <pre className="p-4 rounded-lg bg-muted/50 border text-xs font-mono overflow-x-auto max-h-[300px] overflow-y-auto">
                    {JSON.stringify(email.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReparse?.(email.id)}
              disabled={email.processing_status === 'TICKET_CREATED'}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-parse
            </Button>
            {canCreateTicket && (
              <Button
                size="sm"
                className="btn-primary"
                onClick={() => onCreateTicket?.(email)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Ticket
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}