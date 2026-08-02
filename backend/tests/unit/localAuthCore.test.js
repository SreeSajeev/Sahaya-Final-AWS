import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("passwordService", () => {
  it("hashes and verifies with argon2id; wrong password fails", async () => {
    const { hashPassword, verifyPassword } = await import("../../src/services/passwordService.js");
    const hash = await hashPassword("CorrectHorse1!");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "CorrectHorse1!")).toBe(true);
    expect(await verifyPassword(hash, "WrongHorse1!")).toBe(false);
    expect(await verifyPassword(null, "CorrectHorse1!")).toBe(false);
  });
});

describe("jwtAccessService", () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = "unit-test-jwt-access-secret-32chars-min!!";
    process.env.JWT_ACCESS_TTL_SEC = "900";
  });
  afterEach(() => {
    delete process.env.JWT_ACCESS_SECRET;
  });

  it("signs and verifies access tokens", async () => {
    const { signAccessToken, verifyAccessToken } = await import("../../src/services/jwtAccessService.js");
    const { token } = await signAccessToken({
      userId: "11111111-1111-1111-1111-111111111111",
      email: "a@example.com",
      role: "ADMIN",
      organisationId: "22222222-2222-2222-2222-222222222222",
    });
    const claims = await verifyAccessToken(token);
    expect(claims.userId).toBe("11111111-1111-1111-1111-111111111111");
    expect(claims.role).toBe("ADMIN");
    expect(claims.organisationId).toBe("22222222-2222-2222-2222-222222222222");
  });

  it("rejects malformed and wrong-signature tokens", async () => {
    const { signAccessToken, verifyAccessToken } = await import("../../src/services/jwtAccessService.js");
    await expect(verifyAccessToken("not-a-jwt")).rejects.toBeTruthy();
    const { token } = await signAccessToken({
      userId: "11111111-1111-1111-1111-111111111111",
      email: "a@example.com",
      role: "STAFF",
      organisationId: null,
    });
    process.env.JWT_ACCESS_SECRET = "different-secret-at-least-32-characters-xx";
    await expect(verifyAccessToken(token)).rejects.toBeTruthy();
  });

  it("hashes opaque tokens (refresh/reset) without storing raw", async () => {
    const { generateOpaqueToken, hashOpaqueToken } = await import("../../src/services/jwtAccessService.js");
    const raw = generateOpaqueToken(32);
    const h = hashOpaqueToken(raw);
    expect(h).toHaveLength(64);
    expect(h).not.toEqual(raw);
  });
});

describe("phase D supabase auth zero-runtime (static)", () => {
  const root = path.resolve(__dirname, "../../src");

  function walk(dir, files = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p, files);
      else if (/\.(js|ts)$/.test(ent.name) && !ent.name.includes(" 2.")) files.push(p);
    }
    return files;
  }

  it("backend runtime routes/services do not call supabase.auth or /auth/v1", () => {
    const files = walk(root).filter(
      (f) => !f.endsWith("supabaseAuthClient.js") && !f.endsWith("supabaseClient.js")
    );
    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      if (/supabase\.auth|\/auth\/v1|admin\.createUser|admin\.deleteUser|generateLink/.test(src)) {
        offenders.push(path.relative(root, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("frontend app source (excl. integrations scaffold) has no supabase.auth runtime calls", () => {
    const feRoot = path.resolve(__dirname, "../../../frontend/src");
    const offenders = [];
    function walkFe(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.includes(" 2.")) continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === "integrations") continue;
          walkFe(p);
        } else if (/\.(ts|tsx)$/.test(ent.name)) {
          const src = fs.readFileSync(p, "utf8");
          if (
            /supabase\.auth|signInWithPassword|onAuthStateChange|auth\.getSession|auth\.updateUser/.test(
              src
            )
          ) {
            offenders.push(path.relative(feRoot, p));
          }
        }
      }
    }
    walkFe(feRoot);
    expect(offenders).toEqual([]);
  });
});
