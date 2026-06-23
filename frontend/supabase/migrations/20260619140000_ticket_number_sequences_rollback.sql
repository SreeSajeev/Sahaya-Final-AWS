-- Rollback: ticket_number_sequences (does not modify tickets.ticket_number).

DROP FUNCTION IF EXISTS public.allocate_ticket_sequence(CHAR);
DROP TABLE IF EXISTS public.ticket_number_sequences;
