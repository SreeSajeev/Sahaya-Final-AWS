/** Canonical ticket priority levels. */
export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export const PRIORITY_LEVELS: PriorityLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

export const DEFAULT_PRIORITY_LEVEL: PriorityLevel = 'MEDIUM';

export function booleanFromPriorityLevel(level: PriorityLevel): boolean {
  return level === 'HIGH';
}

export function priorityLevelFromBoolean(priority: boolean): PriorityLevel {
  return priority ? 'HIGH' : 'LOW';
}

export function normalizePriorityLevel(
  value: unknown,
  fallback?: PriorityLevel,
): PriorityLevel | null {
  if (typeof value === 'string') {
    const s = value.trim().toUpperCase();
    if (PRIORITY_LEVELS.includes(s as PriorityLevel)) return s as PriorityLevel;
  }
  if (value === true) return 'HIGH';
  if (value === false && fallback == null) return 'LOW';
  return fallback ?? null;
}

/** Resolve display level from ticket row (priority_level wins over legacy boolean). */
export function resolveTicketPriorityLevel(ticket: {
  priority_level?: string | null;
  priority?: boolean | null;
}): PriorityLevel {
  const fromLevel = normalizePriorityLevel(ticket.priority_level);
  if (fromLevel) return fromLevel;
  if (ticket.priority === true) return 'HIGH';
  if (ticket.priority === false) return 'LOW';
  return DEFAULT_PRIORITY_LEVEL;
}

export function priorityDisplayLabel(level: PriorityLevel): string {
  if (level === 'HIGH') return 'High';
  if (level === 'MEDIUM') return 'Medium';
  return 'Low';
}

export function ticketPassesPriorityFilter(
  ticket: { priority_level?: string | null; priority?: boolean | null },
  filter: TicketPriorityFilter | undefined,
): boolean {
  if (filter == null || filter === 'all') return true;
  return resolveTicketPriorityLevel(ticket) === filter;
}

export type TicketPriorityFilter = PriorityLevel | 'all';
