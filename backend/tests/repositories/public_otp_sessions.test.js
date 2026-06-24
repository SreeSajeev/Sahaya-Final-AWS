import crypto from "crypto";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { cleanupTestData, createTestOrganisation } from "../helpers/db.js";
import { insertComplaintPoint } from "../../src/repositories/tenantComplaintPointRepository.js";
import {
  insertOtpSession,
  findOtpSessionById,
  updateOtpSessionById,
} from "../../src/repositories/publicOtpSessionRepository.js";

describeIfDb("publicOtpSessionRepository", () => {
  let org;
  let complaintPointId;

  beforeEach(async () => {
    org = await createTestOrganisation();
    const publicToken = crypto.randomBytes(16).toString("hex");
    const { data } = await insertComplaintPoint({
      organisation_id: org.id,
      name: "OTP Test Point",
      public_token: publicToken,
      status: "active",
      token_version: 1,
    });
    complaintPointId = data.id;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates and reads OTP session", async () => {
    const id = crypto.randomUUID();
    const { error } = await insertOtpSession({
      id,
      complaint_point_id: complaintPointId,
      organisation_id: org.id,
      reporter_name: "Test Reporter",
      reporter_mobile: "9876543210",
      otp_hash: crypto.createHash("sha256").update("123456").digest("hex"),
      status: "pending",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    expect(error).toBeNull();

    const { data } = await findOtpSessionById(id);
    expect(data?.reporter_mobile).toBe("9876543210");
  });

  it("updates OTP session status", async () => {
    const id = crypto.randomUUID();
    await insertOtpSession({
      id,
      complaint_point_id: complaintPointId,
      organisation_id: org.id,
      reporter_name: "Test Reporter",
      reporter_mobile: "9876543211",
      otp_hash: crypto.createHash("sha256").update("654321").digest("hex"),
      status: "pending",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    const { error } = await updateOtpSessionById(id, { status: "verified" });
    expect(error).toBeNull();
    const { data } = await findOtpSessionById(id);
    expect(data?.status).toBe("verified");
  });
});
