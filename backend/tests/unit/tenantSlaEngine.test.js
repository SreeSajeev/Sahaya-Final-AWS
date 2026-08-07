/**
 * Tenant-configurable SLA engine — due dates, status, escalations, snapshots.
 */
import { describe, expect, it } from "vitest";
import {
  buildTicketSlaSnapshot,
  computeEscalationLevel,
  computePhaseSla,
  computeTicketSlaView,
  DEFAULT_ESCALATION_LEVELS,
  formatDurationMinutes,
  minutesToDueAt,
  normalizeEscalationLevels,
  SLA_STATUS,
} from "../../src/services/tenantSlaEngine.js";

describe("tenantSlaEngine", () => {
  it("builds immutable snapshot from opened_at + minutes", () => {
    const opened = new Date("2026-08-07T10:00:00.000Z");
    const snap = buildTicketSlaSnapshot(
      { responseMinutes: 240, resolutionMinutes: 2880 },
      opened
    );
    expect(snap.response_sla_minutes).toBe(240);
    expect(snap.resolution_sla_minutes).toBe(2880);
    expect(snap.response_due_at).toBe(minutesToDueAt(opened, 240).toISOString());
    expect(snap.resolution_due_at).toBe(minutesToDueAt(opened, 2880).toISOString());
  });

  it("marks APPROACHING when remaining <= 20%", () => {
    const now = new Date("2026-08-07T13:50:00.000Z");
    const due = new Date("2026-08-07T14:00:00.000Z"); // 10 min left of 60
    const phase = computePhaseSla({
      dueAt: due.toISOString(),
      totalMinutes: 60,
      now,
    });
    expect(phase.status).toBe(SLA_STATUS.APPROACHING);
  });

  it("marks BREACHED when past due", () => {
    const phase = computePhaseSla({
      dueAt: "2026-08-07T10:00:00.000Z",
      totalMinutes: 60,
      now: new Date("2026-08-07T11:00:00.000Z"),
    });
    expect(phase.status).toBe(SLA_STATUS.BREACHED);
    expect(phase.breached).toBe(true);
  });

  it("stops response clock at assignment time", () => {
    const phase = computePhaseSla({
      dueAt: "2026-08-07T14:00:00.000Z",
      totalMinutes: 240,
      now: new Date("2026-08-07T18:00:00.000Z"),
      stoppedAt: "2026-08-07T12:00:00.000Z",
    });
    expect(phase.status).toBe(SLA_STATUS.ON_TRACK);
  });

  it("computes escalation levels from elapsed percent", () => {
    expect(computeEscalationLevel(40, DEFAULT_ESCALATION_LEVELS)).toBeNull();
    expect(computeEscalationLevel(50, DEFAULT_ESCALATION_LEVELS)).toBe(1);
    expect(computeEscalationLevel(75, DEFAULT_ESCALATION_LEVELS)).toBe(2);
    expect(computeEscalationLevel(100, DEFAULT_ESCALATION_LEVELS)).toBe(3);
    expect(computeEscalationLevel(160, DEFAULT_ESCALATION_LEVELS)).toBe(4);
  });

  it("normalizes escalation levels to max 5 with renumbered levels", () => {
    const levels = normalizeEscalationLevels([
      { percent: 10 },
      { percent: 20 },
      { percent: 30 },
      { percent: 40 },
      { percent: 50 },
      { percent: 60 },
    ]);
    expect(levels).toHaveLength(5);
    expect(levels[4].level).toBe(5);
  });

  it("formats durations", () => {
    expect(formatDurationMinutes(90)).toBe("1h 30m");
    expect(formatDurationMinutes(60 * 24 + 65)).toBe("1d 1h 5m");
  });

  it("computeTicketSlaView prefers resolution status", () => {
    const opened = new Date("2026-08-01T00:00:00.000Z");
    const snap = buildTicketSlaSnapshot(
      { responseMinutes: 60, resolutionMinutes: 120 },
      opened
    );
    const view = computeTicketSlaView(
      {
        ...snap,
        opened_at: opened.toISOString(),
        status: "OPEN",
      },
      { now: new Date("2026-08-01T03:00:00.000Z") }
    );
    expect(view.status).toBe(SLA_STATUS.BREACHED);
    expect(view.resolution.breached).toBe(true);
  });

  it("snapshot minutes are independent of later config changes (immutability contract)", () => {
    const snapA = buildTicketSlaSnapshot({ responseMinutes: 240, resolutionMinutes: 2880 });
    const snapB = buildTicketSlaSnapshot({ responseMinutes: 60, resolutionMinutes: 120 });
    expect(snapA.response_sla_minutes).toBe(240);
    expect(snapB.response_sla_minutes).toBe(60);
    expect(snapA.response_sla_minutes).not.toBe(snapB.response_sla_minutes);
  });
});
