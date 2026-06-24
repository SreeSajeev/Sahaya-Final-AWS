import crypto from "crypto";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { cleanupTestData, createTestOrganisation } from "../helpers/db.js";
import {
  insertComplaintPoint,
  findComplaintPointById,
  updateComplaintPointById,
} from "../../src/repositories/tenantComplaintPointRepository.js";

describeIfDb("tenantComplaintPointRepository", () => {
  let org;

  beforeEach(async () => {
    org = await createTestOrganisation();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates and reads complaint point", async () => {
    const publicToken = crypto.randomBytes(16).toString("hex");
    const { data, error } = await insertComplaintPoint({
      organisation_id: org.id,
      name: "Test Point",
      public_token: publicToken,
      status: "active",
      token_version: 1,
    });
    expect(error).toBeNull();

    const { data: loaded } = await findComplaintPointById(data.id);
    expect(loaded?.public_token).toBe(publicToken);
  });

  it("updates complaint point status", async () => {
    const publicToken = crypto.randomBytes(16).toString("hex");
    const { data: created } = await insertComplaintPoint({
      organisation_id: org.id,
      name: "Disable Me",
      public_token: publicToken,
      status: "active",
      token_version: 1,
    });
    const { data, error } = await updateComplaintPointById(created.id, { status: "disabled" });
    expect(error).toBeNull();
    expect(data?.status).toBe("disabled");
  });
});
