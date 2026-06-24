import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb, tenantReq, superAdminReq } from "../helpers/testContext.js";
import {
  cleanupTestData,
  createTestOrganisation,
  createTestUser,
  trackCleanup,
} from "../helpers/db.js";
import {
  insertUser,
  findUserById,
  updateUserById,
  listUsersScoped,
} from "../../src/repositories/userRepository.js";

describeIfDb("userRepository", () => {
  let orgA;
  let orgB;

  beforeEach(async () => {
    orgA = await createTestOrganisation();
    orgB = await createTestOrganisation();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates and reads a user", async () => {
    const { data, error } = await insertUser({
      name: "Repo Test User",
      email: `repo-user-${Date.now()}@test.sahaya.local`,
      role: "STAFF",
      organisation_id: orgA.id,
      active: true,
      is_active: true,
      approval_status: "approved",
    });
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    trackCleanup("user", data.id);

    const { data: loaded } = await findUserById(data.id);
    expect(loaded?.email).toBe(data.email);
  });

  it("updates a user", async () => {
    const user = await createTestUser(orgA.id, { role: "STAFF" });
    const { data, error } = await updateUserById(user.id, { name: "Updated Name" });
    expect(error).toBeNull();
    expect(data?.name).toBe("Updated Name");
  });

  it("enforces tenant isolation on listUsersScoped", async () => {
    await createTestUser(orgA.id, { role: "STAFF" });
    await createTestUser(orgB.id, { role: "STAFF" });

    const { data: scopedA } = await listUsersScoped(tenantReq(orgA.id), {
      limit: 50,
      offset: 0,
    });
    const emailsA = (scopedA || []).map((u) => u.organisation_id);
    expect(emailsA.every((id) => id === orgA.id)).toBe(true);

    const { data: superRows } = await listUsersScoped(superAdminReq(), {
      limit: 100,
      offset: 0,
    });
    expect((superRows || []).length).toBeGreaterThanOrEqual(2);
  });
});
