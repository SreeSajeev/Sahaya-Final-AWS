import { z } from "zod";

export const submitPublicComplaintBodySchema = z
  .object({
    verification_token: z.string().trim().min(16, "verification_token is required"),
    reporter_name: z.string().trim().min(2, "Name is required").max(120),
    category: z.string().trim().min(1, "Category is required").max(200),
    issue_type: z.string().trim().min(1, "Issue type is required").max(200),
    custom_category: z.string().trim().max(200).optional().default(""),
    custom_issue_type: z.string().trim().max(200).optional().default(""),
    description: z.string().trim().min(10, "Please describe the issue").max(5000),
    location: z.string().trim().max(500).optional().default(""),
    vehicle_number: z.string().trim().max(80).optional().default(""),
    complaint_id: z.string().trim().max(120).optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.category === "Other" && data.custom_category.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please specify the category",
        path: ["custom_category"],
      });
    }
    if (data.issue_type === "Other" && data.custom_issue_type.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please specify the issue type",
        path: ["custom_issue_type"],
      });
    }
  });

/** @param {unknown} body */
export function parseSubmitPublicComplaintBody(body) {
  const parsed = submitPublicComplaintBodySchema.safeParse(body ?? {});
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
 * @param {z.infer<typeof submitPublicComplaintBodySchema>} data
 */
export function resolveEffectiveCategoryAndIssue(data) {
  const category =
    data.category === "Other" ? data.custom_category.trim() : data.category.trim();
  const issue_type =
    data.issue_type === "Other" ? data.custom_issue_type.trim() : data.issue_type.trim();
  return { category, issue_type };
}
