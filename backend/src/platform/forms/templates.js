/**
 * Built-in form templates (marketplace-ready seeds) — METADATA only.
 */
export const FORM_TEMPLATES = Object.freeze([
  {
    key: "incident",
    name: "Incident",
    description: "IT / ops incident intake",
    schema: {
      fields: [
        { internalName: "title", displayLabel: "Title", fieldType: "single_line_text", required: true, searchable: true },
        { internalName: "description", displayLabel: "Description", fieldType: "paragraph", required: true },
        { internalName: "priority", displayLabel: "Priority", fieldType: "dropdown", required: true, options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
        { internalName: "category", displayLabel: "Category", fieldType: "dropdown", options: ["Network", "Hardware", "Software", "Other"] },
        { internalName: "impact", displayLabel: "Impact", fieldType: "radio", options: ["User", "Team", "Org"] },
      ],
    },
    layout: {
      type: "root",
      children: [
        {
          type: "section",
          key: "main",
          title: "Incident details",
          children: [
            { type: "columns", columns: 2, children: [
              { type: "column", children: [{ type: "field", fieldKey: "title", span: 12 }] },
              { type: "column", children: [{ type: "field", fieldKey: "priority", span: 12 }] },
            ]},
            { type: "field", fieldKey: "description", span: 12 },
            { type: "columns", columns: 2, children: [
              { type: "column", children: [{ type: "field", fieldKey: "category", span: 12 }] },
              { type: "column", children: [{ type: "field", fieldKey: "impact", span: 12 }] },
            ]},
          ],
        },
      ],
    },
  },
  {
    key: "complaint",
    name: "Complaint",
    description: "Customer complaint intake",
    schema: {
      fields: [
        { internalName: "customer_name", displayLabel: "Customer", fieldType: "single_line_text", required: true },
        { internalName: "vehicle", displayLabel: "Vehicle", fieldType: "vehicle" },
        { internalName: "issue", displayLabel: "Issue", fieldType: "paragraph", required: true },
        { internalName: "location", displayLabel: "Location", fieldType: "location" },
        { internalName: "contact_phone", displayLabel: "Phone", fieldType: "phone" },
      ],
    },
  },
  {
    key: "asset",
    name: "Asset",
    description: "Asset request / record",
    schema: {
      fields: [
        { internalName: "asset_tag", displayLabel: "Asset tag", fieldType: "single_line_text", required: true },
        { internalName: "asset_type", displayLabel: "Type", fieldType: "dropdown", options: ["Laptop", "Phone", "Vehicle", "Other"] },
        { internalName: "owner", displayLabel: "Owner", fieldType: "user" },
        { internalName: "notes", displayLabel: "Notes", fieldType: "paragraph" },
      ],
    },
  },
  {
    key: "maintenance",
    name: "Maintenance",
    description: "Maintenance work order",
    schema: {
      fields: [
        { internalName: "title", displayLabel: "Work order", fieldType: "single_line_text", required: true },
        { internalName: "asset", displayLabel: "Asset", fieldType: "asset", required: true },
        { internalName: "scheduled_at", displayLabel: "Scheduled", fieldType: "datetime" },
        { internalName: "duration_hours", displayLabel: "Est. hours", fieldType: "decimal" },
        { internalName: "checklist", displayLabel: "Checklist", fieldType: "repeater" },
      ],
    },
  },
  {
    key: "it_support",
    name: "IT Support",
    description: "Help desk request",
    schema: {
      fields: [
        { internalName: "subject", displayLabel: "Subject", fieldType: "single_line_text", required: true },
        { internalName: "body", displayLabel: "Details", fieldType: "rich_text", required: true },
        { internalName: "urgency", displayLabel: "Urgency", fieldType: "dropdown", options: ["Low", "Normal", "High"] },
        { internalName: "attachment", displayLabel: "Screenshot", fieldType: "image_upload" },
      ],
    },
  },
  {
    key: "hr",
    name: "HR Request",
    description: "HR service request",
    schema: {
      fields: [
        { internalName: "request_type", displayLabel: "Type", fieldType: "dropdown", options: ["Leave", "Onboarding", "Policy", "Other"], required: true },
        { internalName: "employee", displayLabel: "Employee", fieldType: "user", required: true },
        { internalName: "details", displayLabel: "Details", fieldType: "paragraph" },
        { internalName: "start_date", displayLabel: "Start", fieldType: "date" },
        { internalName: "end_date", displayLabel: "End", fieldType: "date" },
      ],
    },
  },
]);

export function getFormTemplate(key) {
  return FORM_TEMPLATES.find((t) => t.key === key) || null;
}
