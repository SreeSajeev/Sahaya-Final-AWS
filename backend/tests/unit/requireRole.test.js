import { describe, it, expect, vi } from "vitest";
import { requireRole } from "../../src/middleware/requireRole.js";

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    req: { requestId: "test-rid" },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe("requireRole", () => {
  it("allows appUser.role", () => {
    const mw = requireRole(["ADMIN", "STAFF"]);
    const next = vi.fn();
    const res = mockRes();
    mw({ appUser: { role: "ADMIN" }, requestId: "r1" }, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("falls back to JWT req.user.role (local auth shape)", () => {
    const mw = requireRole(["ADMIN", "STAFF"]);
    const next = vi.fn();
    const res = mockRes();
    mw({ appUser: {}, user: { role: "STAFF" }, requestId: "r2" }, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("normalizes role case", () => {
    const mw = requireRole(["ADMIN"]);
    const next = vi.fn();
    const res = mockRes();
    mw({ appUser: { role: "admin" } }, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("denies missing role", () => {
    const mw = requireRole(["ADMIN"]);
    const next = vi.fn();
    const res = mockRes();
    mw({ appUser: {}, user: {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toBe("Forbidden");
  });
});
