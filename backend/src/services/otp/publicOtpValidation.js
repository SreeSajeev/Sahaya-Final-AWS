import { z } from "zod";

const mobileSchema = z
  .string()
  .trim()
  .min(8, "mobile is required")
  .max(20, "mobile is too long");

export const sendOtpBodySchema = z.object({
  mobile: mobileSchema,
  complaint_point_token: z.string().trim().min(8, "complaint_point_token is required").max(128),
});

export const verifyOtpBodySchema = z.object({
  otp_session_id: z.string().uuid("otp_session_id must be a UUID"),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "otp must be 6 digits"),
});

/**
 * @param {unknown} body
 */
export function parseSendOtpBody(body) {
  const parsed = sendOtpBodySchema.safeParse(body ?? {});
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
export function parseVerifyOtpBody(body) {
  const parsed = verifyOtpBodySchema.safeParse(body ?? {});
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
