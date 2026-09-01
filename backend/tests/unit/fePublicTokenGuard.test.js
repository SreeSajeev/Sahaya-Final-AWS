import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../src/services/schemaCompatService.js", () => ({
  hasPublicColumn: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../src/repositories/feActionTokenRepository.js", () => ({
  markFeActionTokenExpired: vi.fn(),
}));

import { markFeActionTokenExpired } from "../../src/repositories/feActionTokenRepository.js";
import { validateFeActionTokenLifecycle } from "../../src/services/fePublicTokenGuard.js";

describe("fePublicTokenGuard", () => {
  beforeEach(() => {
    vi.mocked(markFeActionTokenExpired).mockReset();
  });

  it("accepts valid active token", async () => {
    const out = await validateFeActionTokenLifecycle({
      used: false,
      token_state: "ACTIVE",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(out.ok).toBe(true);
  });

  it("rejects used token", async () => {
    const out = await validateFeActionTokenLifecycle({ used: true, token_state: "USED" });
    expect(out.ok).toBe(false);
    expect(out.code).toBe("TOKEN_USED");
  });

  it("rejects revoked token", async () => {
    const out = await validateFeActionTokenLifecycle({ used: false, token_state: "REVOKED" });
    expect(out.ok).toBe(false);
    expect(out.code).toBe("TOKEN_REVOKED");
  });

  it("rejects expired token", async () => {
    const out = await validateFeActionTokenLifecycle(
      { used: false, token_state: "EXPIRED", expires_at: "2020-01-01T00:00:00Z" },
      { tokenId: "tok-1" }
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("TOKEN_EXPIRED");
  });
});
