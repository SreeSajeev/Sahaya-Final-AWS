import { z } from "zod";

export const publicTokenParamSchema = z.string().trim().min(8).max(128);

export const validateSessionBodySchema = z.object({
  verification_token: z.string().trim().min(16, "verification_token is required"),
});

export const patchSessionProfileBodySchema = z.object({
  verification_token: z.string().trim().min(16, "verification_token is required"),
  reporter_name: z.string().trim().min(2, "reporter_name must be at least 2 characters").max(120),
});

/**
 * @param {unknown} publicToken
 */
export function parsePublicTokenParam(publicToken) {
  const parsed = publicTokenParamSchema.safeParse(publicToken ?? "");
  if (!parsed.success) {
    return { ok: false, status: 400, message: "Invalid complaint point token" };
  }
  return { ok: true, data: parsed.data };
}

/**
 * @param {unknown} body
 */
export function parseValidateSessionBody(body) {
  const parsed = validateSessionBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "Invalid request body",
      details: parsed.error.flatten(),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * @param {unknown} body
 */
export function parsePatchSessionProfileBody(body) {
  const parsed = patchSessionProfileBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "Invalid request body",
      details: parsed.error.flatten(),
    };
  }
  return { ok: true, data: parsed.data };
}
