import { useEffect, useState } from 'react';
import { differenceInHours, differenceInMinutes, isPast } from 'date-fns';
import { AlertTriangle, CheckCircle, Info, Pause, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type SLAStatus = 'on-track' | 'at-risk' | 'breached' | 'paused';

function parseSlaDeadline(deadline: string | null | undefined): Date | null {
  if (deadline == null || String(deadline).trim() === '') return null;
  const parsed = new Date(deadline);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSLAStatus(deadline: string | null, breached: boolean, ticketStatus: string): { status: SLAStatus; timeRemaining: string } {
  if (ticketStatus === 'NEEDS_REVIEW' || ticketStatus === 'RESOLVED_PENDING_VERIFICATION') {
    return { status: 'paused', timeRemaining: 'Paused' };
  }
  if (breached) return { status: 'breached', timeRemaining: 'Breached' };
  const deadlineDate = parseSlaDeadline(deadline);
  if (!deadlineDate) return { status: 'on-track', timeRemaining: 'N/A' };
  const now = new Date();
  if (isPast(deadlineDate)) return { status: 'breached', timeRemaining: 'Breached' };
  const minutesRemaining = differenceInMinutes(deadlineDate, now);
  const hoursRemaining = differenceInHours(deadlineDate, now);
  if (minutesRemaining < 120) {
    if (minutesRemaining < 60) return { status: 'at-risk', timeRemaining: `${minutesRemaining}m left` };
    return { status: 'at-risk', timeRemaining: `${hoursRemaining}h ${minutesRemaining % 60}m left` };
  }
  if (hoursRemaining < 24) return { status: 'on-track', timeRemaining: `${hoursRemaining}h ${minutesRemaining % 60}m left` };
  const daysRemaining = Math.floor(hoursRemaining / 24);
  return { status: 'on-track', timeRemaining: `${daysRemaining}d ${hoursRemaining % 24}h left` };
}

function SLAStatusIndicator({ status }: { status: SLAStatus }) {
  const config = {
    'on-track': { icon: CheckCircle, label: 'On Track', className: 'text-green-600 bg-green-50 border-green-200' },
    'at-risk': { icon: AlertTriangle, label: 'At Risk', className: 'text-amber-600 bg-amber-50 border-amber-200' },
    breached: { icon: XCircle, label: 'Breached', className: 'text-red-600 bg-red-50 border-red-200' },
    paused: { icon: Pause, label: 'Paused', className: 'text-blue-600 bg-blue-50 border-blue-200' },
  };
  const { icon: Icon, label, className } = config[status];
  return (
    <Badge variant="outline" className={cn('gap-1.5 shrink-0', className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function CountdownTimer({ deadline, breached, ticketStatus }: { deadline: string | null; breached: boolean; ticketStatus: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const safeStatus = ticketStatus ?? 'OPEN';
  const { status, timeRemaining } = getSLAStatus(deadline ?? null, breached, safeStatus);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <SLAStatusIndicator status={status} />
      <span className={cn('text-sm font-medium', status === 'breached' && 'text-red-600', status === 'at-risk' && 'text-amber-600', status === 'paused' && 'text-blue-600')}>
        {timeRemaining}
      </span>
      {status === 'paused' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0" role="img" aria-label="SLA timer paused">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Timer paused — awaiting verification or review</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
