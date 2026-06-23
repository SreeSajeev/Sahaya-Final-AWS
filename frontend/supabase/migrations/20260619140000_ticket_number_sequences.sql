-- Global per-source daily ticket number sequences (IST calendar day).
-- Used only after TICKET_NUMBERING_CUTOVER_IST; legacy tickets are never updated.

CREATE TABLE IF NOT EXISTS public.ticket_number_sequences (
  sequence_date DATE NOT NULL,
  source_code   CHAR(1) NOT NULL CHECK (source_code IN ('S', 'E', 'C')),
  last_number   INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sequence_date, source_code)
);

COMMENT ON TABLE public.ticket_number_sequences IS
  'Atomic daily counters for source-aware ticket numbers (PKQS/PKQE/PKQC). Global, IST date.';

COMMENT ON COLUMN public.ticket_number_sequences.source_code IS
  'S=MANUAL (PKQS), E=EMAIL (PKQE), C=PUBLIC_QR (PKQC)';

CREATE OR REPLACE FUNCTION public.allocate_ticket_sequence(p_source_code CHAR(1))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
  v_sequence_date DATE;
BEGIN
  IF p_source_code NOT IN ('S', 'E', 'C') THEN
    RAISE EXCEPTION 'invalid source_code: %', p_source_code USING ERRCODE = '22023';
  END IF;

  v_sequence_date := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;

  INSERT INTO public.ticket_number_sequences (sequence_date, source_code, last_number)
  VALUES (v_sequence_date, p_source_code, 1)
  ON CONFLICT (sequence_date, source_code)
  DO UPDATE SET
    last_number = ticket_number_sequences.last_number + 1,
    updated_at = now()
  RETURNING last_number, sequence_date INTO v_next, v_sequence_date;

  IF v_next > 9999 THEN
    RAISE EXCEPTION 'ticket_number_sequence_exhausted for % on %', p_source_code, v_sequence_date
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'last_number', v_next,
    'sequence_date', v_sequence_date
  );
END;
$$;

COMMENT ON FUNCTION public.allocate_ticket_sequence(CHAR) IS
  'Atomically increments the global IST-day sequence for MANUAL/EMAIL/PUBLIC_QR ticket numbers.';

REVOKE ALL ON FUNCTION public.allocate_ticket_sequence(CHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_ticket_sequence(CHAR) TO service_role;
