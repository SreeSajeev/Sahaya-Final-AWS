/**
 * Validation schemas for security-critical operations
 * 
 * These Zod schemas validate user input before database operations
 * to prevent data integrity issues, injection attacks, and business logic bypass.
 */

import { z } from 'zod';

// ============================================================
// User & Auth Validation
// ============================================================

/** Reject strings that could be used for XSS (HTML/script markers). */
const safeDisplayName = z.string()
  .trim()
  .min(1, { message: 'Name is required' })
  .max(100, { message: 'Name must be less than 100 characters' })
  .refine(
    (s) => !/[<>"'\\]|\p{C}/u.test(s),
    { message: 'Name cannot contain <, >, quotes, backslash, or control characters' }
  );

/** Password must include uppercase, lowercase, number, and special character. */
const passwordComplexity = z.string()
  .min(8, { message: 'Password must be at least 8 characters' })
  .max(72, { message: 'Password must be less than 72 characters' })
  .refine(
    (s) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[^\w\s]/.test(s),
    { message: 'Password must include uppercase, lowercase, a number, and a special character' }
  );

export const SignUpSchema = z.object({
  email: z.string()
    .trim()
    .email({ message: 'Invalid email address' })
    .max(255, { message: 'Email must be less than 255 characters' }),
  password: passwordComplexity,
  name: safeDisplayName,
  role: z.enum(['CLIENT', 'STAFF', 'FIELD_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN']),
});

export type SignUpInput = z.infer<typeof SignUpSchema>;

// ============================================================
// Ticket Validation
// ============================================================

export const TicketStatusSchema = z.enum([
  'OPEN',
  'NEEDS_REVIEW',
  'ASSIGNED',
  'EN_ROUTE',
  'ON_SITE',
  'RESOLVED_PENDING_VERIFICATION',
  'RESOLVED',
  'REOPENED',
]);

export const TicketUpdateSchema = z.object({
  status: TicketStatusSchema.optional(),
  vehicle_number: z.string().max(20, { message: 'Vehicle number too long' }).nullable().optional(),
  category: z.string().max(50, { message: 'Category too long' }).nullable().optional(),
  issue_type: z.string().max(100, { message: 'Issue type too long' }).nullable().optional(),
  location: z.string().max(255, { message: 'Location too long' }).nullable().optional(),
  state: z.string().max(100, { message: 'State too long' }).nullable().optional(),
  needs_review: z.boolean().optional(),
  current_assignment_id: z.string().uuid().nullable().optional(),
}).strict(); // Reject unknown fields

export type TicketUpdateInput = z.infer<typeof TicketUpdateSchema>;

/** Required when completing "Needs Review" – ensures key structured fields are set. */
export const ReviewCompleteSchema = z.object({
  category: z.string().trim().min(1, { message: 'Category is required' }).max(50),
  issue_type: z.string().trim().min(1, { message: 'Issue type is required' }).max(100),
  location: z.string().trim().min(1, { message: 'Location is required' }).max(255),
  vehicle_number: z.string().trim().max(20).nullable().optional(),
  priority: z.boolean().optional(),
  priority_level: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

export type ReviewCompleteInput = z.infer<typeof ReviewCompleteSchema>;

export const CreateTicketSchema = z.object({
  vehicle_number: z.string().max(20).nullable().optional(),
  incident_title: z
    .string({ required_error: 'Incident title is required' })
    .trim()
    .min(1, { message: 'Incident title is required' })
    .max(255, { message: 'Incident title too long' }),
  category: z.string().max(50).nullable().optional(),
  issue_type: z.string().max(100).nullable().optional(),
  location: z
    .string({ required_error: 'Location is required' })
    .trim()
    .min(1, { message: 'Location is required' })
    .max(255, { message: 'Location too long' }),
  state: z.string().max(100).nullable().optional(),
  complaint_id: z.string().max(50).nullable().optional(),
  source: z.enum(['EMAIL', 'MANUAL', 'SYSTEM']).default('MANUAL'),
  needs_review: z.boolean().default(false),
  confidence_score: z.number().min(0).max(100).nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
});

export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

// ============================================================
// Comment Validation
// ============================================================

export const CommentSchema = z.object({
  ticketId: z.string().uuid({ message: 'Invalid ticket ID' }),
  body: z.string()
    .trim()
    .min(1, { message: 'Comment cannot be empty' })
    .max(5000, { message: 'Comment must be less than 5000 characters' }),
  source: z.enum(['EMAIL', 'FE', 'STAFF', 'SYSTEM']),
  attachments: z.array(z.object({
    type: z.string(),
    bucket: z.string().optional(),
    path: z.string().optional(),
    public_url: z.string().url().optional(),
    uploaded_at: z.string().optional(),
  })).nullable().optional(),
});

export type CommentInput = z.infer<typeof CommentSchema>;

// ============================================================
// Assignment Validation
// ============================================================

export const AssignmentSchema = z.object({
  ticketId: z.string().uuid({ message: 'Invalid ticket ID' }),
  feId: z.string().uuid({ message: 'Invalid Field Executive ID' }),
});

export type AssignmentInput = z.infer<typeof AssignmentSchema>;

// ============================================================
// Field Executive Validation
// ============================================================

export const CreateFESchema = z.object({
  name: safeDisplayName,
  email: z
    .union([z.string().email({ message: 'Invalid email address' }).max(255), z.literal(''), z.null()])
    .optional()
    .nullable(),
  phone: z.string()
    .max(20, { message: 'Phone number too long' })
    .nullable()
    .optional(),
  base_location: z.string()
    .max(255, { message: 'Location too long' })
    .nullable()
    .optional(),
  skills: z.object({
    categories: z.array(z.string().max(50)).max(20),
    resource_kind: z.enum(['own', 'outsourced']).optional(),
  }).nullable().optional(),
  active: z.boolean().default(true),
});

export type CreateFEInput = z.infer<typeof CreateFESchema>;

// ============================================================
// Audit Log Validation
// ============================================================

export const AuditLogSchema = z.object({
  entity_type: z.enum(['ticket', 'field_executive', 'user', 'assignment', 'comment']),
  entity_id: z.string().uuid().nullable().optional(),
  action: z.string().max(100),
  metadata: z.record(z.unknown()).optional(),
});

export type AuditLogInput = z.infer<typeof AuditLogSchema>;

// ============================================================
// UUID Validation Helper
// ============================================================

export const UUIDSchema = z.string().uuid({ message: 'Invalid ID format' });

// ============================================================
// Validation Error Helper
// ============================================================

export function formatZodError(error: z.ZodError): string {
  return error.errors.map(e => e.message).join(', ');
}
