import { z } from "zod";

const mobileDigits = z
  .string()
  .trim()
  .min(8, "Enter a valid mobile number")
  .max(20)
  .refine((v) => {
    const d = v.replace(/\D/g, "");
    return d.length >= 10;
  }, "Enter a valid 10-digit mobile number");

export const publicMobileSchema = mobileDigits;

export const publicOtpSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const publicComplaintFormSchema = z
  .object({
    reporter_name: z.string().trim().min(2, "Name is required").max(120),
    category: z.string().trim().min(1, "Category is required").max(200),
    issue_type: z.string().trim().min(1, "Issue type is required").max(200),
    custom_category: z.string().trim().max(200),
    custom_issue_type: z.string().trim().max(200),
    description: z.string().trim().min(10, "Please describe the issue").max(5000),
    location: z.string().trim().max(500),
    vehicle_number: z.string().trim().max(80),
    complaint_id: z.string().trim().max(120),
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

export type PublicComplaintFormValues = z.infer<typeof publicComplaintFormSchema>;

export function formatPublicZodError(error: z.ZodError): string {
  const first = error.errors[0];
  return first?.message ?? "Please check the form";
}

/** Normalize to 10-digit national number for API (backend sanitizes further). */
export function normalizeMobileForApi(raw: string): string {
  let d = raw.replace(/\D/g, "");
  while (d.startsWith("00") && d.length > 10) d = d.slice(2);
  if (d.startsWith("91") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length > 10) d = d.slice(-10);
  return d;
}
