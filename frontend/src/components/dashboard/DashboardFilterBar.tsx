import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import {
  DASHBOARD_DATE_PRESET_LABELS,
  type DashboardDatePreset,
  type DashboardFilterParams,
} from '@/lib/dashboardFilters';
import { INDIAN_STATES } from '@/lib/indianStates';
import { FILTER_SELECT_WIDTH_WIDE } from '@/components/common';

interface DashboardFilterBarProps {
  filters: DashboardFilterParams;
  clientOptions: string[];
  showClientFilter: boolean;
  onClientChange: (slug: string | null) => void;
  onStateChange: (state: string | null) => void;
  onDatePresetChange: (preset: DashboardDatePreset) => void;
  onCustomDateRangeChange: (from: string, to: string) => void;
}

export function DashboardFilterBar({
  filters,
  clientOptions,
  showClientFilter,
  onClientChange,
  onStateChange,
  onDatePresetChange,
  onCustomDateRangeChange,
}: DashboardFilterBarProps) {
  const [clientOpen, setClientOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(filters.dateFrom);
  const [customTo, setCustomTo] = useState(filters.dateTo);

  useEffect(() => {
    setCustomFrom(filters.dateFrom);
    setCustomTo(filters.dateTo);
  }, [filters.dateFrom, filters.dateTo]);

  const clientLabel = useMemo(() => {
    if (!filters.clientSlug) return 'All Clients';
    return filters.clientSlug;
  }, [filters.clientSlug]);

  const dateLabel = DASHBOARD_DATE_PRESET_LABELS[filters.datePreset];

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
      {showClientFilter ? (
        <Popover open={clientOpen} onOpenChange={setClientOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={clientOpen}
              className={cn('h-9 justify-between font-normal', FILTER_SELECT_WIDTH_WIDE)}
            >
              <span className="truncate">{clientLabel}</span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="end">
            <Command>
              <CommandInput placeholder="Search client…" />
              <CommandList>
                <CommandEmpty>No client found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all clients"
                    onSelect={() => {
                      onClientChange(null);
                      setClientOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        !filters.clientSlug ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    All Clients
                  </CommandItem>
                  {clientOptions.map((slug) => (
                    <CommandItem
                      key={slug}
                      value={slug}
                      onSelect={() => {
                        onClientChange(slug);
                        setClientOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          filters.clientSlug === slug ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {slug}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : null}

      <Select
        value={filters.state ?? 'all'}
        onValueChange={(v) => onStateChange(v === 'all' ? null : v)}
      >
        <SelectTrigger className={cn('h-9', FILTER_SELECT_WIDTH_WIDE)} aria-label="State filter">
          <SelectValue placeholder="All States" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="all">All States</SelectItem>
          {INDIAN_STATES.map((state) => (
            <SelectItem key={state} value={state}>
              {state}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.datePreset}
        onValueChange={(v) => onDatePresetChange(v as DashboardDatePreset)}
      >
        <SelectTrigger className={cn('h-9', FILTER_SELECT_WIDTH_WIDE)} aria-label="Date range">
          <Calendar className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Date range">{dateLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {(Object.keys(DASHBOARD_DATE_PRESET_LABELS) as DashboardDatePreset[]).map((key) => (
            <SelectItem key={key} value={key}>
              {DASHBOARD_DATE_PRESET_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filters.datePreset === 'custom' ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="dash-from" className="sr-only">
              From
            </Label>
            <Input
              id="dash-from"
              type="date"
              className="h-9 w-[130px]"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="dash-to" className="sr-only">
              To
            </Label>
            <Input
              id="dash-to"
              type="date"
              className="h-9 w-[130px]"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-9"
            onClick={() => onCustomDateRangeChange(customFrom, customTo)}
          >
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );
}
