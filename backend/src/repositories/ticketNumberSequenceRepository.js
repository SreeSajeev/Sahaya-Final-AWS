import { prisma } from "../db/prisma.js";

/**
 * Atomically allocate the next IST-day ticket sequence for a source code (S/E/C).
 * Mirrors public.allocate_ticket_sequence PostgreSQL function.
 *
 * @param {'S' | 'E' | 'C'} sourceCode
 * @returns {Promise<{ last_number: number, sequence_date: Date }>}
 */
export async function allocateTicketSequence(sourceCode) {
  if (!["S", "E", "C"].includes(sourceCode)) {
    const err = new Error(`invalid source_code: ${sourceCode}`);
    err.code = "22023";
    throw err;
  }

  const rows = await prisma.$queryRaw`
    INSERT INTO public.ticket_number_sequences (sequence_date, source_code, last_number)
    VALUES ((NOW() AT TIME ZONE 'Asia/Kolkata')::DATE, ${sourceCode}::CHAR(1), 1)
    ON CONFLICT (sequence_date, source_code)
    DO UPDATE SET
      last_number = ticket_number_sequences.last_number + 1,
      updated_at = now()
    RETURNING last_number, sequence_date
  `;

  const row = Array.isArray(rows) ? rows[0] : null;
  const lastNumber = Number(row?.last_number);
  const sequenceDate = row?.sequence_date;

  if (!Number.isInteger(lastNumber) || lastNumber < 1 || lastNumber > 9999 || sequenceDate == null) {
    const err = new Error("Ticket number allocation returned invalid payload");
    err.code = "TICKET_NUMBER_ALLOCATION_FAILED";
    throw err;
  }

  if (lastNumber > 9999) {
    const err = new Error(`ticket_number_sequence_exhausted for ${sourceCode} on ${sequenceDate}`);
    err.code = "P0001";
    throw err;
  }

  return { last_number: lastNumber, sequence_date: sequenceDate };
}
