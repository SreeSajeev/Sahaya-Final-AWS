import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("FeActionToken usedAt Prisma contract", () => {
  it("schema maps used_at → usedAt (fixes /fe/proof 500 after S3)", () => {
    const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
    const model = schema.match(/model FeActionToken \{[\s\S]*?\n\}/)?.[0] || "";
    expect(model).toMatch(/usedAt\s+DateTime\?\s+@map\("used_at"\)/);
  });

  it("repository patch map includes used_at", () => {
    const repo = readFileSync(
      join(root, "src/repositories/feActionTokenRepository.js"),
      "utf8"
    );
    expect(repo).toMatch(/used_at:\s*"usedAt"/);
  });
});
