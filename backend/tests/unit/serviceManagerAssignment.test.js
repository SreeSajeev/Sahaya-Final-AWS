import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_TYPE_FIELD_EXECUTIVE,
  ASSIGNMENT_TYPE_SERVICE_MANAGER,
  isServiceManagerAssignment,
  normalizeAssignmentType,
} from "../../src/constants/assignmentTypes.js";
import { assertSmOwnsCurrentAssignment } from "../../src/services/smResolutionService.js";

describe("assignment types", () => {
  it("defaults unknown values to FIELD_EXECUTIVE", () => {
    expect(normalizeAssignmentType(null)).toBe(ASSIGNMENT_TYPE_FIELD_EXECUTIVE);
    expect(normalizeAssignmentType("service_manager")).toBe(ASSIGNMENT_TYPE_SERVICE_MANAGER);
    expect(normalizeAssignmentType("FIELD_EXECUTIVE")).toBe(ASSIGNMENT_TYPE_FIELD_EXECUTIVE);
  });

  it("detects service manager assignments", () => {
    expect(isServiceManagerAssignment(ASSIGNMENT_TYPE_SERVICE_MANAGER)).toBe(true);
    expect(isServiceManagerAssignment({ assignment_type: "SERVICE_MANAGER" })).toBe(true);
    expect(isServiceManagerAssignment({ assignment_type: "FIELD_EXECUTIVE" })).toBe(false);
    expect(isServiceManagerAssignment({})).toBe(false);
  });
});

describe("SM ownership guard", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const assignmentId = "22222222-2222-2222-2222-222222222222";

  it("allows current SM assignment", () => {
    const result = assertSmOwnsCurrentAssignment(
      {
        id: assignmentId,
        assigned_user_id: userId,
        assignment_type: "SERVICE_MANAGER",
        tickets: { id: "t1", current_assignment_id: assignmentId, organisation_id: "org" },
      },
      userId
    );
    expect(result.ok).toBe(true);
  });

  it("rejects FE assignment type", () => {
    const result = assertSmOwnsCurrentAssignment(
      {
        id: assignmentId,
        assigned_user_id: userId,
        assignment_type: "FIELD_EXECUTIVE",
        tickets: { id: "t1", current_assignment_id: assignmentId },
      },
      userId
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it("rejects when not current assignment", () => {
    const result = assertSmOwnsCurrentAssignment(
      {
        id: assignmentId,
        assigned_user_id: userId,
        assignment_type: "SERVICE_MANAGER",
        tickets: { id: "t1", current_assignment_id: "other" },
      },
      userId
    );
    expect(result.ok).toBe(false);
  });
});

describe("FE assign body contract (regression)", () => {
  it("FIELD_EXECUTIVE remains the default assignment type", () => {
    expect(ASSIGNMENT_TYPE_FIELD_EXECUTIVE).toBe("FIELD_EXECUTIVE");
    expect(normalizeAssignmentType(undefined)).toBe("FIELD_EXECUTIVE");
  });
});
