import { Button } from '@/components/ui/button';
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
import { formatStateDisplay } from '@/lib/indianStates';

interface FETicketFiltersBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  status: 'all' | TicketStatus;
  onStatusChange: (value: 'all' | TicketStatus) => void;
  workType: FEWorkTypeFilter;
  onWorkTypeChange: (value: FEWorkTypeFilter) => void;
  sortKey: FETicketSortKey;
  onSortKeyChange: (value: FETicketSortKey) => void;
  state: string;
  onStateChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  customer: string;
  onCustomerChange: (value: string) => void;
  stateOptions: string[];
  locationOptions: string[];
  customerOptions: string[];
  onClearFilters?: () => void;
  showClearFilters?: boolean;
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
  state,
  onStateChange,
  location,
  onLocationChange,
  customer,
  onCustomerChange,
  stateOptions,
  locationOptions,
  customerOptions,
  onClearFilters,
  showClearFilters = false,
}: FETicketFiltersBarProps) {
  return (
    <FilterBar
      aria-label="Ticket filters"
      search={{
        value: searchValue,
        onChange: onSearchChange,
        placeholder:
          'Search ticket #, complaint ID, client, location, state, vehicle, issue type…',
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
          {showClearFilters && onClearFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
              Clear Filters
            </Button>
          ) : null}
        </div>
      }
    >
      <Select value={state} onValueChange={onStateChange}>
        <SelectTrigger className={FILTER_SELECT_WIDTH_WIDE} aria-label="Filter by state">
          <SelectValue placeholder="State" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All States</SelectItem>
          {stateOptions.map((s) => (
            <SelectItem key={s} value={s}>
              {formatStateDisplay(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={location} onValueChange={onLocationChange}>
        <SelectTrigger className={FILTER_SELECT_WIDTH_WIDE} aria-label="Filter by location">
          <SelectValue placeholder="Location" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Locations</SelectItem>
          {locationOptions.map((loc) => (
            <SelectItem key={loc} value={loc}>
              {loc}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={customer} onValueChange={onCustomerChange}>
        <SelectTrigger className={FILTER_SELECT_WIDTH_WIDE} aria-label="Filter by customer">
          <SelectValue placeholder="Customer" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Customers</SelectItem>
          {customerOptions.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
