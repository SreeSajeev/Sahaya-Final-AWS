#!/usr/bin/env node
/**
 * TEST-only: set local PostgreSQL password_hash for an existing users row.
 * Does NOT call or mutate Supabase Auth.
 *
 * Usage:
 *   node scripts/set-test-password.js --email user@example.com
 *   AUTH_SET_PASSWORD='...' node scripts/set-test-password.js --email user@example.com --from-env
 *
 * Never commit passwords. Prefer interactive prompt or AUTH_SET_PASSWORD env.
 */
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { prisma } from "../src/db/prisma.js";
import { hashPassword, normalizeEmail } from "../src/services/passwordService.js";
import { revokeAllAuthSessionsForUser } from "../src/services/authSessionService.js";

function parseArgs(argv) {
  const out = { email: null, fromEnv: false, listRoles: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email" || a === "-e") out.email = argv[++i];
    else if (a === "--from-env") out.fromEnv = true;
    else if (a === "--list-roles") out.listRoles = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

async function listRoleCounts() {
  const rows = await prisma.user.groupBy({
    by: ["role"],
    _count: { _all: true },
  });
  for (const r of rows) {
    console.log(`${r.role}: ${r._count._all}`);
  }
  const withHash = await prisma.user.count({ where: { passwordHash: { not: null } } });
  const total = await prisma.user.count();
  console.log(`password_hash set: ${withHash}/${total}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node scripts/set-test-password.js --email <email>
  AUTH_SET_PASSWORD='...' node scripts/set-test-password.js --email <email> --from-env
  node scripts/set-test-password.js --list-roles`);
    process.exit(0);
  }

  if (args.listRoles) {
    await listRoleCounts();
    await prisma.$disconnect();
    return;
  }

  const email = normalizeEmail(args.email);
  if (!email) {
    console.error("Missing --email");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      role: true,
      organisationId: true,
      isActive: true,
      approvalStatus: true,
    },
  });
  if (!user) {
    console.error("No local user found for that email (PostgreSQL only).");
    process.exit(1);
  }

  let password = null;
  if (args.fromEnv) {
    password = process.env.AUTH_SET_PASSWORD || "";
    if (!password) {
      console.error("AUTH_SET_PASSWORD env is empty");
      process.exit(1);
    }
  } else {
    const rl = readline.createInterface({ input, output });
    password = await rl.question(`New TEST password for ${user.email} (${user.role}): `);
    rl.close();
  }

  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
  await revokeAllAuthSessionsForUser(user.id);

  console.log(
    JSON.stringify({
      ok: true,
      userId: user.id,
      email: user.email,
      role: user.role,
      organisationId: user.organisationId,
      note: "Local PostgreSQL password_hash updated. Supabase untouched.",
    })
  );
}

main()
  .catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
  });
