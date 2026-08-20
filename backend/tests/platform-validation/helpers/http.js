export function authHeaders({ userId, role, orgId, clientSlug, email }) {
  return {
    Authorization: "Bearer test-token",
    "x-test-user-id": userId,
    "x-test-role": role,
    ...(orgId ? { "x-test-org-id": orgId } : {}),
    ...(clientSlug ? { "x-test-client-slug": clientSlug } : {}),
    ...(email ? { "x-test-email": email } : {}),
  };
}

export function expectStatus(res, allowed, label) {
  if (!allowed.includes(res.status)) {
    throw new Error(
      `${label}: expected ${allowed.join("|")} got ${res.status} body=${JSON.stringify(res.body).slice(0, 400)}`
    );
  }
}
