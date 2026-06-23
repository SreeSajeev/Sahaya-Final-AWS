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
import { TicketFilters, TicketStatus } from '@/lib/types';
import { INDIAN_STATES } from '@/lib/indianStates';

interface TicketFiltersBarProps {
  filters: TicketFilters;
  onFiltersChange: (filters: TicketFilters) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** Distinct clients from loaded tickets — value is `client_slug`, label is display name when known. */
  clientOptions?: { value: string; label: string }[];
  secondary?: React.ReactNode;
}

const statusOptions: { value: TicketStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'NEEDS_REVIEW', label: 'Needs Review' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'EN_ROUTE', label: 'En Route' },
  { value: 'ON_SITE', label: 'On Site' },
  { value: 'RESOLVED_PENDING_VERIFICATION', label: 'Pending Verification' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REOPENED', label: 'Reopened' },
];

const priorityOptions = [
  { value: 'all', label: 'All Priority' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
] as const;

const confidenceOptions = [
  { value: 'all', label: 'All Confidence' },
  { value: 'high', label: 'High (≥95%)' },
  { value: 'medium', label: 'Medium (80-94%)' },
  { value: 'low', label: 'Low (<80%)' },
];

/** Ticket list filters — adapter over shared `FilterBar`. */
export function TicketFiltersBar({
  filters,
  onFiltersChange,
  searchValue,
  onSearchChange,
  clientOptions = [],
  secondary,
}: TicketFiltersBarProps) {
  return (
    <FilterBar
      aria-label="Ticket filters"
      search={{
        value: searchValue,
        onChange: onSearchChange,
        placeholder: 'Search by ticket #, client, vehicle, issue, location, state…',
        'aria-label': 'Search tickets',
      }}
      secondary={secondary}
    >
      <Select
        value={filters.status ?? 'all'}
        onValueChange={(value) =>
          onFiltersChange({ ...filters, status: value as TicketStatus | 'all' })
        }
      >
        <SelectTrigger className={FILTER_SELECT_WIDTH_WIDE} aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {clientOptions.length > 0 ? (
        <Select
          value={filters.clientSlug?.trim() ? filters.clientSlug : 'all'}
          onValueChange={(value) =>
            onFiltersChange({
              ...filters,
              clientSlug: value === 'all' ? undefined : value,
            })
          }
        >
          <SelectTrigger className={FILTER_SELECT_WIDTH_WIDE} aria-label="Filter by client">
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clientOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select
        value={filters.state?.trim() ? filters.state : 'all'}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            state: value === 'all' ? undefined : value,
          })
        }
      >
        <SelectTrigger className={FILTER_SELECT_WIDTH_WIDE} aria-label="Filter by state">
          <SelectValue placeholder="State" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All States</SelectItem>
          {INDIAN_STATES.map((state) => (
            <SelectItem key={state} value={state}>
              {state}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.priorityLevel ?? 'all'}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            priorityLevel: value as 'LOW' | 'MEDIUM' | 'HIGH' | 'all',
          })
        }
      >
        <SelectTrigger className={FILTER_SELECT_WIDTH} aria-label="Filter by priority">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          {priorityOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.confidenceRange ?? 'all'}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            confidenceRange: value as 'high' | 'medium' | 'low' | 'all',
          })
        }
      >
        <SelectTrigger className={FILTER_SELECT_WIDTH} aria-label="Filter by confidence">
          <SelectValue placeholder="Confidence" />
        </SelectTrigger>
        <SelectContent>
          {confidenceOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterBar>
  );
}
