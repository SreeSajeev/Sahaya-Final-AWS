/**
 * Resolution location close/proof workflow tests (Req 19).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../src/repositories/tenantResolutionLocationRepository.js", () => ({
  getResolutionLocationById: vi.fn(),
  listResolutionLocations: vi.fn(),
}));

import {
  getResolutionLocationById,
  listResolutionLocations as listResolutionLocationsRepo,
} from "../../src/repositories/tenantResolutionLocationRepository.js";
import {
  resolveResolutionLocationForTicketClose,
  validateResolutionLocationForClose,
} from "../../src/services/resolutionLocationService.js";

const ORG = "11111111-1111-1111-1111-111111111111";
const LOC = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";

describe("resolutionLocationService close workflow", () => {
  beforeEach(() => {
    vi.mocked(getResolutionLocationById).mockReset();
    vi.mocked(listResolutionLocationsRepo).mockReset();
  });

  it("validates active tenant location", () => {
    const out = validateResolutionLocationForClose(
      { id: LOC, organisation_id: ORG, name: "Site A", is_active: true },
      ORG
    );
    expect(out.error).toBeUndefined();
    expect(out.data?.name).toBe("Site A");
  });

  it("rejects cross-tenant location", () => {
    const out = validateResolutionLocationForClose(
      { id: LOC, organisation_id: OTHER, name: "Site A", is_active: true },
      ORG
    );
    expect(out.error?.status).toBe(400);
  });

  it("rejects inactive location", () => {
    const out = validateResolutionLocationForClose(
      { id: LOC, organisation_id: ORG, name: "Site A", is_active: false },
      ORG
    );
    expect(out.error?.status).toBe(400);
  });

  it("preserves existing FE location when manager omits body id", async () => {
    vi.mocked(getResolutionLocationById).mockResolvedValue({
      data: { id: LOC, organisation_id: ORG, name: "FE Site", is_active: true },
      error: null,
    });
    vi.mocked(listResolutionLocationsRepo).mockResolvedValue({
      data: [{ id: LOC, name: "FE Site" }],
      error: null,
    });

    const out = await resolveResolutionLocationForTicketClose({
      bodyLocationId: null,
      existingLocationId: LOC,
      existingLocationName: "FE Site",
      organisationId: ORG,
    });
    expect(out.error).toBeUndefined();
    expect(out.preserved).toBe(true);
    expect(out.data?.id).toBe(LOC);
    expect(out.data?.name).toBe("FE Site");
  });

  it("uses manager-selected location when body id provided", async () => {
    const newLoc = "44444444-4444-4444-4444-444444444444";
    vi.mocked(getResolutionLocationById).mockResolvedValue({
      data: { id: newLoc, organisation_id: ORG, name: "Manager Site", is_active: true },
      error: null,
    });

    const out = await resolveResolutionLocationForTicketClose({
      bodyLocationId: newLoc,
      existingLocationId: LOC,
      existingLocationName: "FE Site",
      organisationId: ORG,
    });
    expect(out.data?.id).toBe(newLoc);
    expect(out.data?.name).toBe("Manager Site");
  });

  it("preserves existing location when catalog empty and body omitted", async () => {
    vi.mocked(getResolutionLocationById).mockResolvedValue({
      data: { id: LOC, organisation_id: ORG, name: "Legacy Site", is_active: false },
      error: null,
    });
    vi.mocked(listResolutionLocationsRepo).mockResolvedValue({ data: [], error: null });

    const out = await resolveResolutionLocationForTicketClose({
      bodyLocationId: undefined,
      existingLocationId: LOC,
      existingLocationName: "Legacy Site",
      organisationId: ORG,
    });
    expect(out.preserved).toBe(true);
    expect(out.data?.name).toBe("Legacy Site");
  });

  it("allows close without location when no existing and empty catalog", async () => {
    vi.mocked(listResolutionLocationsRepo).mockResolvedValue({ data: [], error: null });

    const out = await resolveResolutionLocationForTicketClose({
      bodyLocationId: null,
      existingLocationId: null,
      existingLocationName: null,
      organisationId: ORG,
    });
    expect(out.skipped).toBe(true);
    expect(out.data?.id).toBeNull();
  });

  it("requires location when catalog exists and nothing to preserve", async () => {
    vi.mocked(listResolutionLocationsRepo).mockResolvedValue({
      data: [{ id: LOC, name: "Site A" }],
      error: null,
    });

    const out = await resolveResolutionLocationForTicketClose({
      bodyLocationId: "",
      existingLocationId: null,
      existingLocationName: null,
      organisationId: ORG,
    });
    expect(out.error?.status).toBe(400);
  });
});
