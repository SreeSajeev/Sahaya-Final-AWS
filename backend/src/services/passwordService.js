import argon2 from "argon2";

const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password) {
  return argon2.hash(String(password), ARGON2_OPTS);
}

export async function verifyPassword(passwordHash, password) {
  if (!passwordHash || !password) return false;
  try {
    return await argon2.verify(String(passwordHash), String(password));
  } catch {
    return false;
  }
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
