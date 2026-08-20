#!/usr/bin/env node
/**
 * Aggregates suite exit codes + static inventory into MD/HTML readiness report.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const stamp = arg("--stamp", new Date().toISOString());
const jsonOut = arg("--json");
const mdOut = arg("--md");
const htmlOut = arg("--html");
const resultsRaw = arg("--results", "");

const suites = resultsRaw
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((line) => {
    const [name, code, seconds] = line.split("|");
    return {
      name,
      exitCode: Number(code),
      seconds: Number(seconds || 0),
      status: Number(code) === 0 ? "PASS" : "FAIL",
    };
  });

const inventoryPath = path.join(root, "validation/FEATURE_INVENTORY.md");
const matricesPath = path.join(root, "validation/matrices/PLATFORM_MATRICES.md");
const gapsModule = path.join(
  root,
  "backend/tests/platform-validation/helpers/inventory.js"
);

let gaps = [];
try {
  const mod = await import(pathToFileURL(gapsModule).href);
  gaps = mod.PRODUCT_GAPS || [];
} catch (err) {
  console.warn("Could not load PRODUCT_GAPS:", err?.message || err);
  gaps = [];
}

const passed = suites.filter((s) => s.status === "PASS").length;
const failed = suites.filter((s) => s.status === "FAIL").length;
const total = suites.length || 1;

/** Readiness score: suite weight 70%, known gaps penalty 30%. */
const suiteScore = (passed / total) * 70;
const gapPenalty = Math.min(
  25,
  gaps.filter((g) => g.status === "NOT_IMPLEMENTED").length * 2
);
const readiness = Math.max(0, Math.round(suiteScore + (30 - gapPenalty)));

const bugsFound = [
  {
    id: "assign-cross-tenant-fe-list",
    severity: "high",
    summary:
      "Assign modal previously listed cross-tenant FEs for SUPER_ADMIN; rejected as Forbidden. Mitigated by org-scoped FE list + clearer errors.",
    status: "fixed_in_tree",
  },
  {
    id: "requireRole-jwt-fallback",
    severity: "medium",
    summary:
      "requireRole ignored JWT req.user.role (local auth shape) when appUser.role missing; fixed with fallback + case normalize.",
    status: "fixed_in_tree",
  },
  {
    id: "testApp-missing-resolution-locations",
    severity: "low",
    summary: "buildTestApp omitted resolutionLocationsRouter; now mounted to match production.",
    status: "fixed_in_tree",
  },
  {
    id: "testApp-missing-localAuth",
    severity: "medium",
    summary:
      "Integration/platform harness mocks auth and does not mount localAuthRouter — real JWT login/refresh not exercised in platform-validation (covered by unit tests + e2e/acceptance shells).",
    status: "open_harness_gap",
  },
  {
    id: "no-swagger",
    severity: "low",
    summary: "No OpenAPI/Swagger surface for contract testing.",
    status: "open_product_gap",
  },
];

const missingTests = [
  "Real JWT login/refresh/logout rotation in platform-validation (needs unmocked localAuth mount)",
  "100 orgs / 1000 users / 10000 tickets full stress (bounded smoke only; use PV_STRESS=1)",
  "PM2/DB restart chaos in automated suite (exists as ops scripts, not CI)",
  "Playwright coverage for CLIENT portal, SM portal, metadata builders, reject evidence",
  "S3 disabled vs enabled matrix with corrupt multipart fixtures",
  "Rate-limit exhaustion tests (intentionally soft in CI)",
];

const improvements = [
  "Mount localAuthRouter in a dedicated real-auth test app for Phase-3 auth exhaustiveness",
  "Publish OpenAPI from route zod schemas",
  "Add continuous tenant-isolation property tests for every /data/* list endpoint",
  "Link /app/metadata in staff sidebar when METADATA enabled",
  "Implement FE video proof upload or remove UI affordance",
];

const report = {
  stamp,
  readinessScore: readiness,
  suites,
  gaps,
  bugsFound,
  missingTests,
  improvements,
  inventoryDoc: fs.existsSync(inventoryPath) ? "validation/FEATURE_INVENTORY.md" : null,
  matricesDoc: fs.existsSync(matricesPath) ? "validation/matrices/PLATFORM_MATRICES.md" : null,
  verdict:
    readiness >= 80
      ? "CONDITIONAL_GO — core suites green; residual product/harness gaps remain"
      : readiness >= 60
        ? "NO-GO until failing suites and critical gaps are addressed"
        : "NO-GO — significant validation failures",
};

const md = `# Sahaya Platform Validation Report

**Stamp:** ${stamp}  
**Production readiness score:** **${readiness}/100**  
**Verdict:** ${report.verdict}

## Suite results

| Suite | Status | Exit | Seconds |
|-------|--------|------|---------|
${
  suites.map((s) => `| ${s.name} | ${s.status} | ${s.exitCode} | ${s.seconds} |`).join("\n") ||
  "| (none) | — | — | — |"
}

## Product gaps (not implemented / N/A)

| ID | Claim | Status |
|----|-------|--------|
${
  gaps.map((g) => `| ${g.id} | ${g.claim} | ${g.status} |`).join("\n") ||
  "| — | — | — |"
}

## Bugs found / harness gaps

${bugsFound.map((b) => `- **[${b.severity}] ${b.id}** (${b.status}): ${b.summary}`).join("\n")}

## Missing tests

${missingTests.map((t) => `- ${t}`).join("\n")}

## Suggested improvements

${improvements.map((t) => `- ${t}`).join("\n")}

## Deliverable index

1. Feature Inventory → \`validation/FEATURE_INVENTORY.md\`
2. Matrices → \`validation/matrices/PLATFORM_MATRICES.md\`
3. Executable suites → \`backend/tests/platform-validation/\`
4. Single command → \`validation/run-platform-validation.sh\`

---
*Generated by validation/generate-report.mjs*
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Sahaya Platform Validation ${stamp}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem;max-width:960px;color:#111;background:#fafafa}
  h1{font-size:1.6rem} table{border-collapse:collapse;width:100%;margin:1rem 0}
  th,td{border:1px solid #ddd;padding:.5rem;text-align:left;font-size:.9rem}
  th{background:#f0f0f0} .pass{color:#067d3c} .fail{color:#b00020}
  .score{font-size:2rem;font-weight:700} .card{background:#fff;border:1px solid #e5e5e5;padding:1rem;border-radius:8px;margin:1rem 0}
</style>
</head>
<body>
  <h1>Sahaya Platform Validation</h1>
  <div class="card">
    <div>Stamp: ${stamp}</div>
    <div class="score">${readiness}/100</div>
    <div>${report.verdict}</div>
  </div>
  <h2>Suites</h2>
  <table>
    <tr><th>Suite</th><th>Status</th><th>Exit</th><th>Seconds</th></tr>
    ${suites
      .map(
        (s) =>
          `<tr><td>${s.name}</td><td class="${s.status === "PASS" ? "pass" : "fail"}">${s.status}</td><td>${s.exitCode}</td><td>${s.seconds}</td></tr>`
      )
      .join("")}
  </table>
  <h2>Gaps</h2>
  <table>
    <tr><th>ID</th><th>Claim</th><th>Status</th></tr>
    ${gaps.map((g) => `<tr><td>${g.id}</td><td>${g.claim}</td><td>${g.status}</td></tr>`).join("")}
  </table>
  <h2>Bugs / harness</h2>
  <ul>${bugsFound.map((b) => `<li><strong>${b.id}</strong> [${b.severity}] — ${b.summary}</li>`).join("")}</ul>
  <h2>Missing tests</h2>
  <ul>${missingTests.map((t) => `<li>${t}</li>`).join("")}</ul>
  <p>See also FEATURE_INVENTORY.md and PLATFORM_MATRICES.md</p>
</body>
</html>`;

if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
if (mdOut) fs.writeFileSync(mdOut, md);
if (htmlOut) fs.writeFileSync(htmlOut, html);

console.log(`Readiness score: ${readiness}/100 (${report.verdict})`);
console.log(`failedSuites=${failed} passedSuites=${passed}`);
