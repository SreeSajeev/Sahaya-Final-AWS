import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORBIDDEN =
  /@supabase\/|supabase\.auth|supabase\.from\s*\(|supabase\.rpc\s*\(|supabase\.storage|\/auth\/v1\/|\/rest\/v1\/|\/storage\/v1\/|process\.env\.SUPABASE_|import\.meta\.env\.VITE_SUPABASE_|SHARED_SUPABASE_MUTATIONS|sharedSupabaseMutationFreeze|supabaseAuthClient|PasswordRecoveryHashRedirect|createClient\s*<|from ['"]@supabase/;

describe("phase E supabase zero-runtime (static)", () => {
  function walk(dir, files = [], { skipDirs = [] } = {}) {
    if (!fs.existsSync(dir)) return files;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.includes(" 2.")) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (skipDirs.includes(ent.name)) continue;
        walk(p, files, { skipDirs });
      } else if (/\.(js|ts|tsx)$/.test(ent.name)) {
        files.push(p);
      }
    }
    return files;
  }

  it("backend runtime src has no Supabase SDK/client/env requirements", () => {
    const root = path.resolve(__dirname, "../../src");
    const offenders = [];
    for (const f of walk(root)) {
      const src = fs.readFileSync(f, "utf8");
      if (FORBIDDEN.test(src)) offenders.push(path.relative(root, f));
    }
    expect(offenders).toEqual([]);
  });

  it("frontend runtime src has no Supabase SDK/client/env requirements", () => {
    const feRoot = path.resolve(__dirname, "../../../frontend/src");
    const offenders = [];
    for (const f of walk(feRoot, [], { skipDirs: [] })) {
      // Filename may still say *Supabase* for historical API helpers that use backendDataApi only.
      const src = fs.readFileSync(f, "utf8");
      if (FORBIDDEN.test(src)) offenders.push(path.relative(feRoot, f));
    }
    expect(offenders).toEqual([]);
  });

  it("package.json files do not list @supabase dependencies", () => {
    const be = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
    );
    const fe = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../../frontend/package.json"), "utf8")
    );
    const beDeps = { ...(be.dependencies || {}), ...(be.devDependencies || {}) };
    const feDeps = { ...(fe.dependencies || {}), ...(fe.devDependencies || {}) };
    expect(Object.keys(beDeps).filter((k) => k.startsWith("@supabase/"))).toEqual([]);
    expect(Object.keys(feDeps).filter((k) => k.startsWith("@supabase/"))).toEqual([]);
  });
});
