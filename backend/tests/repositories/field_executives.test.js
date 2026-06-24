import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb, tenantReq } from "../helpers/testContext.js";
import {
  cleanupTestData,
  createTestFieldExecutive,
  createTestOrganisation,
} from "../helpers/db.js";
import {
  insertFieldExecutive,
  getFieldExecutiveById,
  updateFieldExecutiveById,
  listFieldExecutivesScoped,
} from "../../src/repositories/fieldExecutiveRepository.js";

describeIfDb("fieldExecutiveRepository", () => {
  let orgA;
  let orgB;

  beforeEach(async () => {
    orgA = await createTestOrganisation();
    orgB = await createTestOrganisation();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates and reads a field executive", async () => {
    const { data, error } = await insertFieldExecutive({
      name: "FE Repo",
      email: `fe-${Date.now()}@test.sahaya.local`,
      phone: "919999999998",
      active: true,
      organisation_id: orgA.id,
    });
    expect(error).toBeNull();
    const { data: loaded } = await getFieldExecutiveById(data.id);
    expect(loaded?.name).toBe("FE Repo");
  });

  it("updates a field executive", async () => {
    const fe = await createTestFieldExecutive(orgA.id);
    const { data, error } = await updateFieldExecutiveById(fe.id, { phone: "919111111111" });
    expect(error).toBeNull();
    expect(data?.phone).toBe("919111111111");
  });

  it("scopes list by tenant", async () => {
    await createTestFieldExecutive(orgA.id);
    await createTestFieldExecutive(orgB.id);

    const { data } = await listFieldExecutivesScoped(tenantReq(orgA.id), {
      limit: 50,
      offset: 0,
    });
    expect((data || []).every((r) => r.organisation_id === orgA.id)).toBe(true);
  });
});
