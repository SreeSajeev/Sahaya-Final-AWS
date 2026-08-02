import { hash, verify, Algorithm } from "@node-rs/argon2";

/** Argon2id via @node-rs/argon2 (prebuilt N-API; no native toolchain on EC2). */
const ARGON2_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password) {
  return hash(String(password), ARGON2_OPTS);
}

export async function verifyPassword(passwordHash, password) {
  if (!passwordHash || !password) return false;
  try {
    return await verify(String(passwordHash), String(password));
  } catch {
    return false;
  }
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
