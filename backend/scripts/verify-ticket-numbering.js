/**
 * Ticket numbering cutover + format verification (no DB required).
 * Run: node scripts/verify-ticket-numbering.js
 */
import {
  generateLegacyEmailTicketNumber,
  generateLegacyManualTicketNumber,
  generateTicketNumberForCreation,
  isSourceAwareTicketNumberingActive,
} from "../src/utils/ticketNumber.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withEnvAsync(overrides, fn) {
  return withEnv(overrides, fn);
}

function testLegacyFormats() {
  const pkq = generateLegacyEmailTicketNumber();
  assert(/^PKQ-\d{8}-\d{4}$/.test(pkq), `legacy email format: ${pkq}`);

  const tkt = generateLegacyManualTicketNumber();
  assert(/^TKT-[A-Z0-9]+-[A-Z0-9]+$/.test(tkt), `legacy manual format: ${tkt}`);
}

function testCutoverGating() {
  withEnv(
    {
      TICKET_NUMBERING_CUTOVER_IST: "2026-06-20 00:00:00 Asia/Kolkata",
      USE_SOURCE_AWARE_TICKET_NUMBERS: "true",
    },
    () => {
      const before = new Date("2026-06-19T18:29:59.000Z"); // 2026-06-19 23:59:59 IST
      const after = new Date("2026-06-19T18:30:00.000Z"); // 2026-06-20 00:00:00 IST

      assert(!isSourceAwareTicketNumberingActive(before), "should be legacy before cutover");
      assert(isSourceAwareTicketNumberingActive(after), "should be source-aware on/after cutover");
    }
  );

  withEnv(
    {
      TICKET_NUMBERING_CUTOVER_IST: "2026-06-20 00:00:00 Asia/Kolkata",
      USE_SOURCE_AWARE_TICKET_NUMBERS: "false",
    },
    () => {
      const after = new Date("2026-06-20T12:00:00.000Z");
      assert(!isSourceAwareTicketNumberingActive(after), "flag off forces legacy after cutover");
    }
  );
}

async function testCreationEntrypointBeforeCutover() {
  await withEnvAsync(
    {
      TICKET_NUMBERING_CUTOVER_IST: "2026-06-20 00:00:00 Asia/Kolkata",
      USE_SOURCE_AWARE_TICKET_NUMBERS: "true",
    },
    async () => {
      const ref = new Date("2026-06-19T12:00:00.000Z");

      const manual = await generateTicketNumberForCreation("MANUAL", ref);
      assert(/^TKT-/.test(manual), `Test A manual before cutover: ${manual}`);

      const email = await generateTicketNumberForCreation("EMAIL", ref);
      assert(/^PKQ-/.test(email), `Test C email before cutover: ${email}`);

      const pub = await generateTicketNumberForCreation("PUBLIC_QR", ref);
      assert(/^PKQ-/.test(pub), `Test D public before cutover: ${pub}`);
    }
  );
}

async function main() {
  testLegacyFormats();
  testCutoverGating();
  await testCreationEntrypointBeforeCutover();
  console.log("verify-ticket-numbering: all checks passed");
}

main().catch((err) => {
  console.error("verify-ticket-numbering: FAILED", err.message);
  process.exit(1);
});
