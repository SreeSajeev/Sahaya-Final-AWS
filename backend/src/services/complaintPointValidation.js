import { z } from "zod";
import { normalizeClientSlug } from "./tenantClientService.js";

const optionalText = (max) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || String(v).trim() === "" ? null : String(v).trim()));

export const complaintPointStatusSchema = z.enum(["active", "disabled"]);

export const createComplaintPointBodySchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  description: optionalText(2000),
  building: optionalText(200),
  floor: optionalText(200),
  site_name: optionalText(200),
  asset_reference: optionalText(200),
  default_client_slug: z
    .string()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => {
      if (v == null || String(v).trim() === "") return null;
      const normalized = normalizeClientSlug(v);
      if (!normalized) {
        throw new z.ZodError([
          {
            code: "custom",
            message: "default_client_slug format is invalid",
            path: ["default_client_slug"],
          },
        ]);
      }
      return normalized;
    }),
  default_category: optionalText(200),
  default_issue_type: optionalText(200),
  organisation_id: z.string().uuid().optional().nullable(),
});

export const updateComplaintPointBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: optionalText(2000),
    building: optionalText(200),
    floor: optionalText(200),
    site_name: optionalText(200),
    asset_reference: optionalText(200),
    default_client_slug: z
      .string()
      .max(120)
      .optional()
      .nullable()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (v == null || String(v).trim() === "") return null;
        const normalized = normalizeClientSlug(v);
        if (!normalized) {
          throw new z.ZodError([
            {
              code: "custom",
              message: "default_client_slug format is invalid",
              path: ["default_client_slug"],
            },
          ]);
        }
        return normalized;
      }),
    default_category: optionalText(200),
    default_issue_type: optionalText(200),
    status: complaintPointStatusSchema.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field is required",
  });

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: z.infer<typeof createComplaintPointBodySchema> } | { ok: false, status: number, message: string, details?: unknown }}
 */
export function parseCreateComplaintPointBody(body) {
  const parsed = createComplaintPointBodySchema.safeParse(body ?? {});
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
 * @returns {{ ok: true, data: z.infer<typeof updateComplaintPointBodySchema> } | { ok: false, status: number, message: string, details?: unknown }}
 */
export function parseUpdateComplaintPointBody(body) {
  const parsed = updateComplaintPointBodySchema.safeParse(body ?? {});
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
