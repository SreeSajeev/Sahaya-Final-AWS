import {
  FilterBar,
  FILTER_SELECT_WIDTH,
  FILTER_SELECT_WIDTH_WIDE,
} from '@/components/common';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TicketStatus } from '@/lib/types';
import {
  FE_STATUS_FILTERS,
  FE_TICKET_SORT_OPTIONS,
  type FETicketSortKey,
  type FEWorkTypeFilter,
} from '@/lib/feTicketList';

interface FETicketFiltersBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  status: 'all' | TicketStatus;
  onStatusChange: (value: 'all' | TicketStatus) => void;
  workType: FEWorkTypeFilter;
  onWorkTypeChange: (value: FEWorkTypeFilter) => void;
  sortKey: FETicketSortKey;
  onSortKeyChange: (value: FETicketSortKey) => void;
}

export function FETicketFiltersBar({
  searchValue,
  onSearchChange,
  status,
  onStatusChange,
  workType,
  onWorkTypeChange,
  sortKey,
  onSortKeyChange,
}: FETicketFiltersBarProps) {
  return (
    <FilterBar
      aria-label="Ticket filters"
      search={{
        value: searchValue,
        onChange: onSearchChange,
        placeholder:
          'Search ticket #, complaint, client, location, vehicle, category, remarks…',
        'aria-label': 'Search tickets',
      }}
      secondary={
        <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3">
          <Select
            value={sortKey}
            onValueChange={(value) => onSortKeyChange(value as FETicketSortKey)}
          >
            <SelectTrigger className={FILTER_SELECT_WIDTH_WIDE} aria-label="Sort tickets">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {FE_TICKET_SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      <Select
        value={status}
        onValueChange={(value) => onStatusChange(value as 'all' | TicketStatus)}
      >
        <SelectTrigger className={FILTER_SELECT_WIDTH_WIDE} aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {FE_STATUS_FILTERS.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={workType}
        onValueChange={(value) => onWorkTypeChange(value as FEWorkTypeFilter)}
      >
        <SelectTrigger className={FILTER_SELECT_WIDTH} aria-label="Filter by work type">
          <SelectValue placeholder="Work type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Work Types</SelectItem>
          <SelectItem value="on_site">On Site</SelectItem>
          <SelectItem value="resolution">Resolution</SelectItem>
        </SelectContent>
      </Select>
    </FilterBar>
  );
}
