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

const LEVEL_STYLES: Record<PriorityLevel, string> = {
  LOW: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-900 border-amber-200',
  HIGH: 'bg-red-50 text-red-800 border-red-200',
};

/**
 * Textual priority badge: LOW / MEDIUM / HIGH (no star icons).
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
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide',
        LEVEL_STYLES[level],
        className,
      )}
      title={label}
      aria-label={`Priority: ${label}`}
    >
      {label}
    </span>
  );
}
