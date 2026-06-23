/** Canonical Indian states and union territories for ticket.state. */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

const BY_LOWER = new Map(INDIAN_STATES.map((s) => [s.toLowerCase(), s]));

export function normalizeTicketState(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = value.trim();
  if (!s) return null;
  return BY_LOWER.get(s.toLowerCase()) ?? s;
}

/** Display helper — em dash when unset. */
export function formatStateDisplay(value: string | null | undefined): string {
  if (value == null) return '—';
  const s = String(value).trim();
  return s === '' ? '—' : s;
}
