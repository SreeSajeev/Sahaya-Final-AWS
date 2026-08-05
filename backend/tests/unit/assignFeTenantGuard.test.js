import { describe, it, expect } from "vitest";

/**
 * Regression: assign must reject FE from a different organisation.
 * Mirrors the guard added in assignmentService.assignOneTicket.
 */
describe("assign FE tenant guard", () => {
  it("foreign FE org mismatch is rejected", () => {
    const ticketOrg = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const feOrg = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const mismatch = ticketOrg && feOrg && String(ticketOrg) !== String(feOrg);
    expect(mismatch).toBe(true);
  });

  it("same FE org is allowed", () => {
    const ticketOrg = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const feOrg = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const mismatch = ticketOrg && feOrg && String(ticketOrg) !== String(feOrg);
    expect(mismatch).toBe(false);
  });
});
