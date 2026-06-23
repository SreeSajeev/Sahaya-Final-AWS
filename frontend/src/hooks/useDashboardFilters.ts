import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  type DashboardDatePreset,
  type DashboardFilterParams,
  dashboardFiltersToSearchParams,
  datePresetToYmdRange,
  parseDashboardFiltersFromSearchParams,
  dashboardFiltersToIsoRange,
} from '@/lib/dashboardFilters';

export function useDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(
    () => parseDashboardFiltersFromSearchParams(searchParams),
    [searchParams],
  );

  const isoRange = useMemo(() => dashboardFiltersToIsoRange(filters), [filters]);

  const setFilters = useCallback(
    (next: DashboardFilterParams) => {
      const params = dashboardFiltersToSearchParams(next);
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  const setClientSlug = useCallback(
    (clientSlug: string | null) => {
      setFilters({ ...filters, clientSlug });
    },
    [filters, setFilters],
  );

  const setState = useCallback(
    (state: string | null) => {
      setFilters({ ...filters, state });
    },
    [filters, setFilters],
  );

  const setDatePreset = useCallback(
    (datePreset: DashboardDatePreset) => {
      if (datePreset === 'all') {
        setFilters({ ...filters, datePreset, dateFrom: '', dateTo: '' });
        return;
      }
      if (datePreset === 'custom') {
        setFilters({ ...filters, datePreset });
        return;
      }
      const range = datePresetToYmdRange(datePreset);
      setFilters({
        ...filters,
        datePreset,
        dateFrom: range?.from ?? '',
        dateTo: range?.to ?? '',
      });
    },
    [filters, setFilters],
  );

  const setCustomDateRange = useCallback(
    (dateFrom: string, dateTo: string) => {
      setFilters({
        ...filters,
        datePreset: 'custom',
        dateFrom,
        dateTo,
      });
    },
    [filters, setFilters],
  );

  return {
    filters,
    isoRange,
    setFilters,
    setClientSlug,
    setState,
    setDatePreset,
    setCustomDateRange,
  };
}
