import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb, uniqueSlug } from "../helpers/testContext.js";
import { cleanupTestData, createTestOrganisation } from "../helpers/db.js";
import {
  insertOrganisation,
  getOrganisationById,
  listActiveOrganisationsPublic,
  findOrganisationsByIds,
} from "../../src/repositories/organisationRepository.js";

describeIfDb("organisationRepository", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates and reads an organisation", async () => {
    const slug = uniqueSlug("org-repo");
    const { data, error } = await insertOrganisation({
      name: "Repo Org",
      slug,
      status: "active",
    });
    expect(error).toBeNull();
    expect(data?.slug).toBe(slug);

    const { data: loaded } = await getOrganisationById(data.id);
    expect(loaded?.name).toBe("Repo Org");
  });

  it("lists active organisations for public auth", async () => {
    const org = await createTestOrganisation({ status: "active" });
    const { data, error } = await listActiveOrganisationsPublic();
    expect(error).toBeNull();
    expect((data || []).some((o) => o.id === org.id)).toBe(true);
  });

  it("finds organisations by ids", async () => {
    const org = await createTestOrganisation();
    const { data } = await findOrganisationsByIds([org.id]);
    expect(data?.[0]?.id).toBe(org.id);
  });
});
