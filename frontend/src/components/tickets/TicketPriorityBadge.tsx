import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type PriorityLevel,
  resolveTicketPriorityLevel,
  priorityDisplayLabel,
} from '@/lib/priority';

interface TicketPriorityBadgeProps {
  /** Legacy boolean and/or priority_level. */
  priority?: boolean | null;
  priority_level?: PriorityLevel | string | null;
  className?: string;
}

const STAR_STYLES: Record<PriorityLevel, string> = {
  LOW: 'fill-emerald-500 text-emerald-500',
  MEDIUM: 'fill-amber-400 text-amber-400',
  HIGH: 'fill-red-500 text-red-500',
};

/**
 * Compact star indicator for ticket priority (green / yellow / red).
 */
export function TicketPriorityBadge({
  priority,
  priority_level,
  className,
}: TicketPriorityBadgeProps) {
  const level = resolveTicketPriorityLevel({ priority_level, priority });
  const label = priorityDisplayLabel(level);

  return (
    <span
      className={cn('inline-flex items-center justify-center', className)}
      title={label}
      aria-label={`Priority: ${label}`}
    >
      <Star className={cn('h-4 w-4', STAR_STYLES[level])} aria-hidden />
    </span>
  );
}
