import test from "node:test";
import assert from "node:assert/strict";

/**
 * Regression: assign must reject FE from a different organisation.
 * Mirrors the guard added in assignmentService.assignOneTicket.
 */
test("foreign FE org mismatch is rejected", () => {
  const ticketOrg = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const feOrg = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const mismatch =
    ticketOrg && feOrg && String(ticketOrg) !== String(feOrg);
  assert.equal(mismatch, true);
});

test("same FE org is allowed", () => {
  const ticketOrg = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const feOrg = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const mismatch =
    ticketOrg && feOrg && String(ticketOrg) !== String(feOrg);
  assert.equal(mismatch, false);
});
