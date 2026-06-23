import { EmailProcessingStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { 
  Mail, 
  FileSearch, 
  FileQuestion, 
  AlertTriangle, 
  Ticket, 
  MessageSquare, 
  AlertCircle,
  Check,
  ChevronRight
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatIST } from '@/lib/dateUtils';

interface StatusStep {
  key: EmailProcessingStatus;
  label: string;
  icon: React.ElementType;
  description: string;
}

const LIFECYCLE_STEPS: StatusStep[] = [
  { 
    key: 'RECEIVED', 
    label: 'Received', 
    icon: Mail,
    description: 'Email received via Postmark webhook and stored' 
  },
  { 
    key: 'PARSED', 
    label: 'Parsed', 
    icon: FileSearch,
    description: 'Email parsed by rule-based extraction engine' 
  },
];

const OUTCOME_STEPS: StatusStep[] = [
  { 
    key: 'DRAFT', 
    label: 'Draft', 
    icon: FileQuestion,
    description: 'Low confidence (<80%) - requires manual confirmation' 
  },
  { 
    key: 'NEEDS_REVIEW', 
    label: 'Review', 
    icon: AlertTriangle,
    description: 'Medium confidence (80-95%) - flagged for human review' 
  },
  { 
    key: 'TICKET_CREATED', 
    label: 'Ticket', 
    icon: Ticket,
    description: 'High confidence (≥95%) - ticket auto-created' 
  },
  { 
    key: 'COMMENT_ADDED', 
    label: 'Comment', 
    icon: MessageSquare,
    description: 'Added to existing ticket thread' 
  },
  { 
    key: 'ERROR', 
    label: 'Error', 
    icon: AlertCircle,
    description: 'Parsing failed - requires manual intervention' 
  },
];

interface EmailStatusLifecycleProps {
  currentStatus: EmailProcessingStatus;
  receivedAt: string;
  parsedAt?: string;
  confidenceScore?: number | null;
  className?: string;
  compact?: boolean;
}

export function EmailStatusLifecycle({ 
  currentStatus, 
  receivedAt,
  parsedAt,
  confidenceScore,
  className,
  compact = false
}: EmailStatusLifecycleProps) {
  const getStepState = (step: StatusStep) => {
    const statusOrder: EmailProcessingStatus[] = [
      'RECEIVED', 'PARSED', 'DRAFT', 'NEEDS_REVIEW', 'TICKET_CREATED', 'COMMENT_ADDED', 'ERROR'
    ];
    const currentIndex = statusOrder.indexOf(currentStatus);
    const stepIndex = statusOrder.indexOf(step.key);
    
    if (step.key === currentStatus) return 'current';
    if (stepIndex < currentIndex && (step.key === 'RECEIVED' || step.key === 'PARSED')) return 'completed';
    if (OUTCOME_STEPS.find(s => s.key === step.key) && step.key !== currentStatus) return 'inactive';
    return 'pending';
  };

  const getStatusColor = (status: EmailProcessingStatus) => {
    switch (status) {
      case 'RECEIVED': return 'bg-blue-500';
      case 'PARSED': return 'bg-purple-500';
      case 'DRAFT': return 'bg-amber-500';
      case 'NEEDS_REVIEW': return 'bg-orange-500';
      case 'TICKET_CREATED': return 'bg-green-500';
      case 'COMMENT_ADDED': return 'bg-teal-500';
      case 'ERROR': return 'bg-red-500';
      default: return 'bg-muted';
    }
  };

  const getTooltipContent = (step: StatusStep) => {
    let timestamp = '';
    let rule = '';
    let actor = 'System';

    if (step.key === 'RECEIVED') {
      timestamp = formatIST(receivedAt, 'MMM d, yyyy HH:mm:ss');
      rule = 'Postmark webhook trigger';
    } else if (step.key === 'PARSED' && parsedAt) {
      timestamp = formatIST(parsedAt, 'MMM d, yyyy HH:mm:ss');
      rule = 'Rule-based extraction engine';
    } else if (step.key === currentStatus && confidenceScore !== null) {
      if (step.key === 'NEEDS_REVIEW') {
        rule = `Confidence ${confidenceScore}% (80-95% threshold)`;
      } else if (step.key === 'DRAFT') {
        rule = `Confidence ${confidenceScore}% (<80% threshold)`;
      } else if (step.key === 'TICKET_CREATED') {
        rule = `Confidence ${confidenceScore}% (≥95% threshold)`;
      }
    }

    return (
      <div className="space-y-1.5 text-xs">
        <p className="font-semibold">{step.description}</p>
        {timestamp && (
          <p className="text-muted-foreground">
            <span className="font-medium">When:</span> {timestamp}
          </p>
        )}
        {rule && (
          <p className="text-muted-foreground">
            <span className="font-medium">Rule:</span> {rule}
          </p>
        )}
        <p className="text-muted-foreground">
          <span className="font-medium">Actor:</span> {actor}
        </p>
      </div>
    );
  };

  if (compact) {
    const Icon = [...LIFECYCLE_STEPS, ...OUTCOME_STEPS].find(s => s.key === currentStatus)?.icon || Mail;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              getStatusColor(currentStatus),
              'text-white',
              className
            )}>
              <Icon className="h-3 w-3" />
              <span>{currentStatus.replace('_', ' ')}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {getTooltipContent([...LIFECYCLE_STEPS, ...OUTCOME_STEPS].find(s => s.key === currentStatus)!)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const currentOutcome = OUTCOME_STEPS.find(s => s.key === currentStatus);

  return (
    <TooltipProvider>
      <div className={cn('flex items-center gap-2', className)}>
        {/* Lifecycle steps */}
        {LIFECYCLE_STEPS.map((step, index) => {
          const state = getStepState(step);
          const Icon = step.icon;
          
          return (
            <div key={step.key} className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full transition-all',
                    state === 'completed' && 'bg-green-500 text-white',
                    state === 'current' && cn(getStatusColor(step.key), 'text-white ring-2 ring-offset-2 ring-offset-background'),
                    state === 'pending' && 'bg-muted text-muted-foreground',
                    state === 'inactive' && 'bg-muted/50 text-muted-foreground/50'
                  )}>
                    {state === 'completed' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {getTooltipContent(step)}
                </TooltipContent>
              </Tooltip>
              {index < LIFECYCLE_STEPS.length - 1 && (
                <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />
              )}
            </div>
          );
        })}

        {/* Arrow to outcome */}
        <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />

        {/* Outcome step */}
        {currentOutcome && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
                getStatusColor(currentOutcome.key),
                'text-white ring-2 ring-offset-2 ring-offset-background'
              )}>
                <currentOutcome.icon className="h-3.5 w-3.5" />
                <span>{currentOutcome.label}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {getTooltipContent(currentOutcome)}
            </TooltipContent>
          </Tooltip>
        )}

        {!currentOutcome && currentStatus === 'PARSED' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-500 text-white">
            <FileSearch className="h-3.5 w-3.5" />
            <span>Parsed</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}