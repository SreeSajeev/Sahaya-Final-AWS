import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb, uniqueSlug } from "../helpers/testContext.js";
import { cleanupTestData, createTestOrganisation } from "../helpers/db.js";
import {
  insertTenantClientRow,
  getTenantClientByIdRow,
  updateTenantClientRow,
  findActiveTenantClientBySlug,
} from "../../src/repositories/tenantClientRepository.js";

describeIfDb("tenantClientRepository", () => {
  let org;

  beforeEach(async () => {
    org = await createTestOrganisation();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates and reads tenant client", async () => {
    const slug = uniqueSlug("tc");
    const { data, error } = await insertTenantClientRow({
      organisation_id: org.id,
      name: "Test Client",
      slug,
      status: "active",
    });
    expect(error).toBeNull();

    const { data: loaded } = await getTenantClientByIdRow(data.id);
    expect(loaded?.slug).toBe(slug);
  });

  it("updates tenant client", async () => {
    const slug = uniqueSlug("tc-upd");
    const { data: created } = await insertTenantClientRow({
      organisation_id: org.id,
      name: "Before",
      slug,
      status: "active",
    });
    const { data, error } = await updateTenantClientRow(created.id, { name: "After" });
    expect(error).toBeNull();
    expect(data?.name).toBe("After");
  });

  it("finds active tenant client by slug", async () => {
    const slug = uniqueSlug("tc-find");
    await insertTenantClientRow({
      organisation_id: org.id,
      name: "Find Me",
      slug,
      status: "active",
    });
    const { data } = await findActiveTenantClientBySlug(slug, org.id);
    expect(data?.slug).toBe(slug);
  });
});
