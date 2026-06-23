import { useQuery } from '@tanstack/react-query';
import { RawEmail, ParsedEmail, RawEmailWithParsed, EmailProcessingStatus } from '@/lib/types';
import { fetchJson } from "@/lib/backendDataApi";

function determineProcessingStatus(
  rawEmail: RawEmail,
  parsedEmail: ParsedEmail | null
): EmailProcessingStatus {
  if (!parsedEmail) {
    return 'RECEIVED';
  }
  if (rawEmail.ticket_created) {
    return 'TICKET_CREATED';
  }
  if (parsedEmail.needs_review) {
    return 'NEEDS_REVIEW';
  }
  if (parsedEmail.confidence_score !== null && parsedEmail.confidence_score < 80) {
    return 'DRAFT';
  }
  return 'PARSED';
}

function mapRowToRawEmailWithParsed(row: Record<string, unknown>): RawEmailWithParsed {
  const rawEmail: RawEmail = {
    id: row.id as string,
    message_id: row.message_id as string,
    thread_id: row.thread_id as string | null,
    from_email: row.from_email as string,
    to_email: row.to_email as string,
    subject: row.subject as string,
    received_at: row.received_at as string,
    payload: row.payload as RawEmail['payload'],
    raw_text: (row.raw_text as string | null) ?? null,
    raw_html: (row.raw_html as string | null) ?? null,
    ticket_created: row.ticket_created as boolean,
    created_at: row.created_at as string,
  };
  const parsed = (row.parsed_email as ParsedEmail | null) ?? null;
  return {
    ...rawEmail,
    parsed_email: parsed,
    processing_status: determineProcessingStatus(rawEmail, parsed),
    linked_ticket_id: null,
  };
}

export function useRawEmails() {
  return useQuery({
    queryKey: ['raw-emails'],
    queryFn: async () => {
      const res = await fetchJson<{ items: Record<string, unknown>[] }>(`/data/raw-emails?limit=100&offset=0`);
      return (res.items ?? []).map(mapRowToRawEmailWithParsed);
    },
  });
}

export function useRawEmail(emailId: string) {
  return useQuery({
    queryKey: ['raw-email', emailId],
    queryFn: async () => {
      const res = await fetchJson<{ items: Record<string, unknown>[] }>(`/data/raw-emails?limit=200&offset=0`);
      const row = (res.items ?? []).find((x) => x.id === emailId) ?? null;
      if (!row) throw new Error("Email not found");
      return mapRowToRawEmailWithParsed(row);
    },
    enabled: !!emailId,
  });
}
