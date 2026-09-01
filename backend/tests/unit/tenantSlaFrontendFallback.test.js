/**
 * Frontend tenant SLA display fallback — due_at is authoritative from backend snapshots.
 */
import { describe, expect, it } from "vitest";

const SLA_STATUS = {
  ON_TRACK: "ON_TRACK",
  APPROACHING: "APPROACHING",
  BREACHED: "BREACHED",
  NA: "NA",
};

/** Mirrored from frontend/src/lib/tenantSla.ts getTicketSlaView fallback branch */
function fallbackSlaFromDueAt(ticket) {
  const now = Date.now();
  const phase = (dueAt, totalMinutes) => {
    if (!dueAt) {
      return { status: SLA_STATUS.NA, remainingMinutes: null, dueAt: null, breached: false };
    }
    const due = new Date(String(dueAt)).getTime();
    if (Number.isNaN(due)) {
      return { status: SLA_STATUS.NA, remainingMinutes: null, dueAt: null, breached: false };
    }
    const remainingMinutes = Math.round((due - now) / 60000);
    let status = SLA_STATUS.ON_TRACK;
    if (now > due) {
      status = SLA_STATUS.BREACHED;
    } else {
      const total = Number(totalMinutes);
      if (Number.isFinite(total) && total > 0 && remainingMinutes <= total * 0.2) {
        status = SLA_STATUS.APPROACHING;
      }
    }
    return {
      status,
      remainingMinutes,
      dueAt: new Date(due).toISOString(),
      breached: status === SLA_STATUS.BREACHED,
    };
  };

  const response = phase(ticket.response_due_at, ticket.response_sla_minutes);
  const resolution = phase(ticket.resolution_due_at, ticket.resolution_sla_minutes);
  return {
    status: resolution.status !== SLA_STATUS.NA ? resolution.status : response.status,
    response,
    resolution,
  };
}

describe("tenant SLA frontend fallback", () => {
  it("shows breached when past backend due_at even without sla minutes", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const view = fallbackSlaFromDueAt({ resolution_due_at: past });
    expect(view.resolution.status).toBe(SLA_STATUS.BREACHED);
    expect(view.resolution.breached).toBe(true);
  });

  it("does not require total minutes to compute breach from due_at", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const view = fallbackSlaFromDueAt({ response_due_at: past });
    expect(view.response.status).toBe(SLA_STATUS.BREACHED);
  });

  it("returns NA when due_at missing", () => {
    const view = fallbackSlaFromDueAt({});
    expect(view.response.status).toBe(SLA_STATUS.NA);
    expect(view.resolution.status).toBe(SLA_STATUS.NA);
  });
});
