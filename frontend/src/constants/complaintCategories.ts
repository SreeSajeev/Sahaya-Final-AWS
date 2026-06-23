/**
 * Structured complaint and resolution categories for ticket UI.
 * Reusable across CreateTicketModal, CloseTicketDialog, filters, and reports.
 * Backend does not enforce these; they are for consistent UX only.
 */

/** Complaint categories for ticket creation (dropdown). "Other" must remain last. */
export const COMPLAINT_CATEGORIES = [
  'Tracker not working ( GPS)',
  'Camera not working',
  'MDVR not working',
  'External Camera not working',
  'Auto Dialler Not working',
  'Location issue',
  'Video Footage Issue',
  'Video Issue',
  'Power Issue',
  'Battery Issue',
  'Fuel Sensor Not Working',
  'Fuel Data issue',
  'Data missing',
  'Fuel Theft Check',
  'Fuel Filling Check',
  'Auto Dialler Number Change',
  'Geo Fence Creation Request',
  'Driver Addition Request',
  'Login Creation Request',
  'Password Change Request',
  'Vehicle addition to Login',
  'Vehicle Deletion from Login',
  'API Vehicle Addition Request',
  'API Vehicle Deletion Request',
  'Other',
] as const;

/** Issue types for ticket creation (dropdown). "Other" allows custom entry in UI. */
export const ISSUE_TYPES = [
  'Delayed Delivery',
  'Missing Package',
  'Wrong Address',
  'Vehicle Maintenance',
  'Flat Tire',
  'Engine Issue',
  'Missing Documents',
  'Incorrect Invoice',
  'Damaged Goods',
  'Lost Shipment',
  'Route Change',
  'Other',
] as const;

/** Resolution categories for close dialog (dropdown). */
export const RESOLUTION_CATEGORIES = [
  'Tampering',
  'Tampering and Damage',
  'Damaged beyond Repair',
  'Tracker needs replacement',
  'Camera needs replacement',
  'MDVR needs replacement',
  'External Camera needs replacement',
  'Auto Dialler needs replacement',
  'Fuel Sensor need replacement',
  'Power Connection Disconnected',
  'Vehicle Power Issue',
  'Vehicle Battery Issue',
  'Vehicle Cabling burnt',
  'Tracker Replaced',
  'Camera Replaced',
  'MDVR Replaced',
  'External Camera Replaced',
  'Fuel Sensor Replaced',
  'Auto Dialler Number updated',
  'Login Created',
  'Password updated',
  'Vehicle added to Login',
  'Vehicle removed from Login',
  'Vehicle added to API',
  'Vehicle removed from API',
  'Video Footage updated',
  'Unable to recover Video Footage',
] as const;

/** Resolution category value when staff enters custom resolution details. */
export const RESOLUTION_CATEGORY_OTHER = 'OTHER' as const;
