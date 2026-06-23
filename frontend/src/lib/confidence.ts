/**
 * Display confidence for tickets. Matches backend confidenceService formula.
 * For NEEDS_REVIEW tickets stored as 100%, we derive from required fields so
 * the UI does not show 100% when required fields are incomplete.
 */
function hasValue(v: string | null | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  return true;
}

function derivedConfidence(ticket: {
  vehicle_number?: string | null;
  issue_type?: string | null;
  location?: string | null;
  complaint_id?: string | null;
  category?: string | null;
}): number {
  let score = 0;
  if (hasValue(ticket.vehicle_number)) score += 33;
  if (hasValue(ticket.issue_type)) score += 34;
  if (hasValue(ticket.location)) score += 33;
  if (hasValue(ticket.complaint_id)) score = Math.min(100, score + 5);
  if (hasValue(ticket.category) && ticket.category !== "UNKNOWN") score = Math.min(100, score + 5);
  return Math.min(100, Math.round(score));
}

export function getDisplayConfidenceScore(ticket: {
  status?: string | null;
  confidence_score?: number | null;
  vehicle_number?: string | null;
  issue_type?: string | null;
  location?: string | null;
  complaint_id?: string | null;
  category?: string | null;
}): number | null {
  const stored = ticket.confidence_score;
  if (ticket.status === "NEEDS_REVIEW" && stored === 100) {
    return derivedConfidence(ticket);
  }
  return stored ?? null;
}
