import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { INDIAN_STATES } from '@/lib/indianStates';
import { cn } from '@/lib/utils';

const UNSET = '__unset__';

type StateSelectProps = {
  id?: string;
  value: string | null | undefined;
  onValueChange: (value: string | null) => void;
  className?: string;
  placeholder?: string;
  allowUnset?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
};

export function StateSelect({
  id,
  value,
  onValueChange,
  className,
  placeholder = 'Select state',
  allowUnset = true,
  disabled = false,
  'aria-label': ariaLabel = 'State',
}: StateSelectProps) {
  const selectValue = value?.trim() ? value.trim() : allowUnset ? UNSET : '';

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onValueChange(v === UNSET ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn('w-full', className)} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowUnset ? (
          <SelectItem value={UNSET}>{placeholder}</SelectItem>
        ) : null}
        {INDIAN_STATES.map((state) => (
          <SelectItem key={state} value={state}>
            {state}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
