/**
 * Client vehicle master — normalize, duplicate rules, import summary, ticket snapshots.
 */
import { describe, expect, it } from "vitest";

function normalizeVehicleNumber(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function optionalField(raw, max = 200) {
  const t = raw == null ? "" : String(raw).trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function summarizeImport(rows, existingNumbers) {
  const existing = new Set([...existingNumbers].map(normalizeVehicleNumber));
  let imported = 0;
  let skippedDuplicates = 0;
  let invalid = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? {};
    const vehicleNumber = normalizeVehicleNumber(row.vehicle_number);
    const blank =
      !vehicleNumber &&
      !optionalField(row.vehicle_type) &&
      !optionalField(row.vehicle_name) &&
      !optionalField(row.registration_number) &&
      !optionalField(row.description);
    if (blank) continue;
    if (!vehicleNumber) {
      invalid += 1;
      errors.push({ row: i + 1, error: "Vehicle Number is required" });
      continue;
    }
    if (existing.has(vehicleNumber)) {
      skippedDuplicates += 1;
      continue;
    }
    existing.add(vehicleNumber);
    imported += 1;
  }
  return { imported, skippedDuplicates, invalid, errors };
}

function canDeleteVehicle(ticketCount) {
  return ticketCount === 0;
}

function resolveTicketVehicle({ vehicleId, vehicleNumber, master }) {
  if (vehicleId) {
    const row = master.find((v) => v.id === vehicleId && v.is_active !== false);
    if (!row) return { error: "Selected vehicle is not available" };
    return {
      vehicle_id: row.id,
      vehicle_number: row.vehicle_number,
      vehicle_name: row.vehicle_name ?? null,
      vehicle_type: row.vehicle_type ?? null,
      registration_number: row.registration_number ?? null,
    };
  }
  const free = normalizeVehicleNumber(vehicleNumber);
  if (!free) {
    return {
      vehicle_id: null,
      vehicle_number: null,
      vehicle_name: null,
      vehicle_type: null,
      registration_number: null,
    };
  }
  return {
    vehicle_id: null,
    vehicle_number: free,
    vehicle_name: null,
    vehicle_type: null,
    registration_number: null,
  };
}

describe("client vehicle master", () => {
  it("normalizes vehicle numbers to uppercase and trims", () => {
    expect(normalizeVehicleNumber("  mh-12 ab 1234 ")).toBe("MH-12 AB 1234");
  });

  it("rejects blank vehicle number on import rows with other fields", () => {
    const s = summarizeImport([{ vehicle_name: "Bus" }], []);
    expect(s.invalid).toBe(1);
    expect(s.imported).toBe(0);
  });

  it("skips duplicate vehicle numbers per client", () => {
    const s = summarizeImport(
      [{ vehicle_number: "MH-01" }, { vehicle_number: "mh-01" }, { vehicle_number: "MH-02" }],
      ["MH-01"]
    );
    expect(s.imported).toBe(1);
    expect(s.skippedDuplicates).toBe(2);
  });

  it("ignores blank rows", () => {
    const s = summarizeImport([{}, { vehicle_number: "  " }, { vehicle_number: "AA-1" }], []);
    expect(s.imported).toBe(1);
    expect(s.invalid).toBe(0);
  });

  it("blocks delete when vehicle used on tickets", () => {
    expect(canDeleteVehicle(0)).toBe(true);
    expect(canDeleteVehicle(2)).toBe(false);
  });

  it("snapshots master vehicle onto ticket fields", () => {
    const resolved = resolveTicketVehicle({
      vehicleId: "v1",
      vehicleNumber: null,
      master: [
        {
          id: "v1",
          vehicle_number: "BUS-9",
          vehicle_name: "City Bus",
          vehicle_type: "Bus",
          registration_number: "KA01AB1234",
          is_active: true,
        },
      ],
    });
    expect(resolved.vehicle_id).toBe("v1");
    expect(resolved.vehicle_number).toBe("BUS-9");
    expect(resolved.vehicle_name).toBe("City Bus");
    expect(resolved.vehicle_type).toBe("Bus");
    expect(resolved.registration_number).toBe("KA01AB1234");
  });

  it("allows free-text vehicle without FK", () => {
    const resolved = resolveTicketVehicle({
      vehicleId: null,
      vehicleNumber: "temp-99",
      master: [],
    });
    expect(resolved.vehicle_id).toBeNull();
    expect(resolved.vehicle_number).toBe("TEMP-99");
  });

  it("rejects inactive master vehicle selection", () => {
    const resolved = resolveTicketVehicle({
      vehicleId: "v1",
      vehicleNumber: null,
      master: [{ id: "v1", vehicle_number: "X", is_active: false }],
    });
    expect(resolved.error).toMatch(/not available/i);
  });

  it("uniqueness is per client (same number allowed across clients conceptually)", () => {
    const clientA = summarizeImport([{ vehicle_number: "SAME" }], []);
    const clientB = summarizeImport([{ vehicle_number: "SAME" }], []);
    expect(clientA.imported).toBe(1);
    expect(clientB.imported).toBe(1);
  });
});
