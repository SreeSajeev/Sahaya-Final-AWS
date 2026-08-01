import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors frontend/src/lib/sharedSupabaseMutationFreeze.ts enablement rule.
 * Keep in sync: only the string "true" (any case) enables the freeze.
 */
function viteFlagEnabled(raw) {
  return String(raw ?? "").trim().toLowerCase() === "true";
}

describe("flag enablement matrix (backend + Vite mirror)", () => {
  afterEach(() => {
    delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
    vi.resetModules();
  });

  const cases = [
    { raw: undefined, enabled: false, label: "missing" },
    { raw: "", enabled: false, label: "empty" },
    { raw: "false", enabled: false, label: "false" },
    { raw: "FALSE", enabled: false, label: "FALSE" },
    { raw: "0", enabled: false, label: "0" },
    { raw: "1", enabled: false, label: "1" },
    { raw: "yes", enabled: false, label: "yes" },
    { raw: "true", enabled: true, label: "true" },
    { raw: "TRUE", enabled: true, label: "TRUE" },
    { raw: " True ", enabled: true, label: " True " },
  ];

  for (const c of cases) {
    it(`backend: ${c.label} → enabled=${c.enabled}`, async () => {
      if (c.raw === undefined) delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
      else process.env.SHARED_SUPABASE_MUTATIONS_DISABLED = c.raw;
      const mod = await import("../../src/security/sharedSupabaseMutationFreeze.js");
      expect(mod.areSharedSupabaseMutationsDisabled()).toBe(c.enabled);
      expect(viteFlagEnabled(c.raw)).toBe(c.enabled);
    });
  }
});

describe("TicketSettings / organisations PostgREST guard pattern", () => {
  afterEach(() => {
    delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
    vi.resetModules();
  });

  it("never invokes .update when freeze is on (TicketSettings path)", async () => {
    process.env.SHARED_SUPABASE_MUTATIONS_DISABLED = "true";
    const mod = await import("../../src/security/sharedSupabaseMutationFreeze.js");
    const update = vi.fn();
    const eq = vi.fn(() => ({ error: null }));
    const from = vi.fn(() => ({
      update: (...args) => {
        update(...args);
        return { eq };
      },
    }));

    const block = mod.sharedSupabaseMutationBlock();
    expect(block?.blocked).toBe(true);

    // Mirrors TicketSettings.tsx: guard before supabase.from(...).update(...)
    let threw = false;
    try {
      if (block) throw new Error(block.message);
      from("organisations").update({ review_field_label: "x" }).eq("id", "org-1");
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
    expect(from).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("invokes .update when freeze is off", async () => {
    delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
    const mod = await import("../../src/security/sharedSupabaseMutationFreeze.js");
    expect(mod.sharedSupabaseMutationBlock()).toBeNull();

    const update = vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) }));
    const from = vi.fn(() => ({ update }));
    from("organisations").update({ review_field_label: "x" });
    expect(from).toHaveBeenCalledWith("organisations");
    expect(update).toHaveBeenCalled();
  });
});

describe("Storage upload skip under freeze", () => {
  afterEach(() => {
    delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
    vi.resetModules();
  });

  it("does not call storage.upload when freeze is on", async () => {
    process.env.SHARED_SUPABASE_MUTATIONS_DISABLED = "true";
    const mod = await import("../../src/security/sharedSupabaseMutationFreeze.js");
    const upload = vi.fn();

    // Mirrors proofController / proofBackupQueueProcessor gate
    if (!mod.areSharedSupabaseMutationsDisabled()) {
      await upload();
    }

    expect(upload).not.toHaveBeenCalled();
  });

  it("allows storage.upload call path when freeze is off", async () => {
    delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
    const mod = await import("../../src/security/sharedSupabaseMutationFreeze.js");
    const upload = vi.fn(async () => ({ error: null }));

    if (!mod.areSharedSupabaseMutationsDisabled()) {
      await upload();
    }

    expect(upload).toHaveBeenCalledTimes(1);
  });
});
