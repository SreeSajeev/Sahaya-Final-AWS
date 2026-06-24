import crypto from "node:crypto";
import { findComplaintPointByPublicToken } from "../repositories/tenantComplaintPointRepository.js";

/**
 * URL-safe opaque token for public complaint point URLs (Phase 2+).
 * Uses UUID v4 — not guessable, unique in practice.
 */
export function generateComplaintPointPublicToken() {
  return crypto.randomUUID();
}

/**
 * @param {number} [maxAttempts]
 * @returns {Promise<string>}
 */
export async function generateUniqueComplaintPointPublicToken(maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    const token = generateComplaintPointPublicToken();
    const { data } = await findComplaintPointByPublicToken(token);
    if (!data) return token;
  }
  throw new Error("Unable to generate unique public token");
}
