import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  type PriorityLevel,
  PRIORITY_LEVELS,
  priorityDisplayLabel,
} from '@/lib/priority';

interface TicketPriorityRadioGroupProps {
  value: PriorityLevel;
  onValueChange: (value: PriorityLevel) => void;
  disabled?: boolean;
  idPrefix?: string;
  className?: string;
}

/** Low / Medium / High priority selector (textual labels only). */
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
            className="cursor-pointer text-sm font-medium tracking-wide"
          >
            {priorityDisplayLabel(level)}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}
