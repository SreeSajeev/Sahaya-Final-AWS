import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type PriorityLevel,
  PRIORITY_LEVELS,
  priorityDisplayLabel,
} from '@/lib/priority';

const STAR_STYLES: Record<PriorityLevel, string> = {
  LOW: 'fill-emerald-500 text-emerald-500',
  MEDIUM: 'fill-amber-400 text-amber-400',
  HIGH: 'fill-red-500 text-red-500',
};

interface TicketPriorityRadioGroupProps {
  value: PriorityLevel;
  onValueChange: (value: PriorityLevel) => void;
  disabled?: boolean;
  idPrefix?: string;
  className?: string;
}

/** Low / Medium / High priority selector with star hints. */
export function TicketPriorityRadioGroup({
  value,
  onValueChange,
  disabled,
  idPrefix = 'priority',
  className,
}: TicketPriorityRadioGroupProps) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onValueChange(v as PriorityLevel)}
      disabled={disabled}
      className={cn('flex flex-wrap gap-4', className)}
      aria-label="Priority"
    >
      {PRIORITY_LEVELS.map((level) => (
        <div key={level} className="flex items-center gap-2">
          <RadioGroupItem value={level} id={`${idPrefix}-${level}`} />
          <Label
            htmlFor={`${idPrefix}-${level}`}
            className="flex cursor-pointer items-center gap-1.5 text-sm font-medium"
          >
            <Star className={cn('h-3.5 w-3.5', STAR_STYLES[level])} aria-hidden />
            {priorityDisplayLabel(level)}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}
