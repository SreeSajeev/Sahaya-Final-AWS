/** Assignment kinds for ticket_assignments.assignment_type (additive enum strings). */
export const ASSIGNMENT_TYPE_FIELD_EXECUTIVE = "FIELD_EXECUTIVE";
export const ASSIGNMENT_TYPE_SERVICE_MANAGER = "SERVICE_MANAGER";

export const ASSIGNMENT_TYPES = [
  ASSIGNMENT_TYPE_FIELD_EXECUTIVE,
  ASSIGNMENT_TYPE_SERVICE_MANAGER,
];

export function normalizeAssignmentType(value) {
  const raw = value != null ? String(value).trim().toUpperCase() : "";
  if (raw === ASSIGNMENT_TYPE_SERVICE_MANAGER) return ASSIGNMENT_TYPE_SERVICE_MANAGER;
  return ASSIGNMENT_TYPE_FIELD_EXECUTIVE;
}

export function isServiceManagerAssignment(assignmentOrType) {
  if (assignmentOrType == null) return false;
  if (typeof assignmentOrType === "string") {
    return normalizeAssignmentType(assignmentOrType) === ASSIGNMENT_TYPE_SERVICE_MANAGER;
  }
  return (
    normalizeAssignmentType(assignmentOrType.assignment_type) === ASSIGNMENT_TYPE_SERVICE_MANAGER
  );
}

export function isFieldExecutiveAssignment(assignmentOrType) {
  return !isServiceManagerAssignment(assignmentOrType);
}
