-- Phase 6.1: Atomic public complaint submit (ticket + submission + session consume).
-- Called only from backend service role via supabase.rpc('submit_public_complaint', { p_payload }).
-- Requires 20260602120000_public_submission_otp_session_unique.sql applied.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.submit_public_complaint(jsonb);

CREATE OR REPLACE FUNCTION public.submit_public_complaint(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_session_id uuid;
  v_org_id uuid;
  v_cp_id uuid;
  v_session public.public_otp_sessions%ROWTYPE;
  v_point_status text;
  v_existing_ticket_number text;
  v_ticket_status text;
  v_ticket_id uuid;
  v_now timestamptz := now();
  v_complaint_id text;
  v_reporter_name text;
BEGIN
  v_otp_session_id := NULLIF(trim(COALESCE(p_payload->>'otp_session_id', '')), '')::uuid;
  v_org_id := NULLIF(trim(COALESCE(p_payload->>'organisation_id', '')), '')::uuid;
  v_cp_id := NULLIF(trim(COALESCE(p_payload->>'complaint_point_id', '')), '')::uuid;

  IF v_otp_session_id IS NULL OR v_org_id IS NULL OR v_cp_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PAYLOAD');
  END IF;

  IF NULLIF(trim(COALESCE(p_payload->>'ticket_number', '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PAYLOAD');
  END IF;

  SELECT * INTO v_session
  FROM public.public_otp_sessions
  WHERE id = v_otp_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND');
  END IF;

  IF v_session.organisation_id IS DISTINCT FROM v_org_id
     OR v_session.complaint_point_id IS DISTINCT FROM v_cp_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_BINDING_MISMATCH');
  END IF;

  IF v_session.status = 'consumed' THEN
    IF v_session.ticket_id IS NOT NULL THEN
      SELECT t.ticket_number, t.status
      INTO v_existing_ticket_number, v_ticket_status
      FROM public.tickets t
      WHERE t.id = v_session.ticket_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'ticket_number', v_existing_ticket_number,
        'status', v_ticket_status,
        'otp_session_id', v_session.id::text,
        'ticket_id', v_session.ticket_id::text
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_INVALID');
  END IF;

  IF v_session.status <> 'verified' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_INVALID');
  END IF;

  SELECT tcp.status INTO v_point_status
  FROM public.tenant_complaint_points tcp
  WHERE tcp.id = v_session.complaint_point_id;

  IF v_point_status IS NULL OR v_point_status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'COMPLAINT_POINT_INACTIVE');
  END IF;

  v_complaint_id := NULLIF(trim(COALESCE(p_payload->>'complaint_id', '')), '');
  IF v_complaint_id IS NOT NULL THEN
    SELECT t.ticket_number
    INTO v_existing_ticket_number
    FROM public.tickets t
    WHERE t.organisation_id = v_session.organisation_id
      AND t.complaint_id = v_complaint_id
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'COMPLAINT_ID_EXISTS',
        'ticket_number', v_existing_ticket_number
      );
    END IF;
  END IF;

  v_reporter_name := NULLIF(trim(COALESCE(p_payload->>'reporter_name', '')), '');
  IF v_reporter_name IS NULL THEN
    v_reporter_name := v_session.reporter_name;
  END IF;

  INSERT INTO public.tickets (
    ticket_number,
    status,
    organisation_id,
    complaint_id,
    vehicle_number,
    category,
    issue_type,
    location,
    short_description,
    opened_by_email,
    opened_at,
    confidence_score,
    needs_review,
    source,
    client_slug,
    priority,
    updated_at
  ) VALUES (
    trim(p_payload->>'ticket_number'),
    trim(p_payload->>'status'),
    v_session.organisation_id,
    v_complaint_id,
    NULLIF(trim(COALESCE(p_payload->>'vehicle_number', '')), ''),
    trim(p_payload->>'category'),
    trim(p_payload->>'issue_type'),
    NULLIF(trim(COALESCE(p_payload->>'location', '')), ''),
    NULLIF(trim(COALESCE(p_payload->>'short_description', '')), ''),
    NULL,
    v_now,
    COALESCE((p_payload->>'confidence_score')::numeric, 100),
    COALESCE((p_payload->>'needs_review')::boolean, false),
    'PUBLIC_QR',
    NULLIF(trim(COALESCE(p_payload->>'client_slug', '')), ''),
    COALESCE((p_payload->>'priority')::boolean, false),
    v_now
  )
  RETURNING id, ticket_number, status
  INTO v_ticket_id, v_existing_ticket_number, v_ticket_status;

  INSERT INTO public.public_complaint_submissions (
    ticket_id,
    complaint_point_id,
    organisation_id,
    otp_session_id,
    reporter_name,
    reporter_mobile
  ) VALUES (
    v_ticket_id,
    v_session.complaint_point_id,
    v_session.organisation_id,
    v_session.id,
    v_reporter_name,
    v_session.reporter_mobile
  );

  UPDATE public.public_otp_sessions
  SET
    status = 'consumed',
    consumed_at = v_now,
    ticket_id = v_ticket_id,
    reporter_name = v_reporter_name,
    updated_at = v_now
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'ticket_number', v_existing_ticket_number,
    'status', v_ticket_status,
    'otp_session_id', v_session.id::text,
    'ticket_id', v_ticket_id::text
  );

EXCEPTION
  WHEN unique_violation THEN
    IF EXISTS (
      SELECT 1
      FROM public.public_complaint_submissions pcs
      WHERE pcs.otp_session_id = COALESCE(v_session.id, v_otp_session_id)
    ) THEN
      SELECT t.ticket_number, t.status, pcs.ticket_id, pcs.otp_session_id
      INTO v_existing_ticket_number, v_ticket_status, v_ticket_id, v_otp_session_id
      FROM public.public_complaint_submissions pcs
      JOIN public.tickets t ON t.id = pcs.ticket_id
      WHERE pcs.otp_session_id = COALESCE(v_session.id, v_otp_session_id)
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'ticket_number', v_existing_ticket_number,
        'status', v_ticket_status,
        'otp_session_id', COALESCE(v_session.id, v_otp_session_id)::text,
        'ticket_id', v_ticket_id::text
      );
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_complaint(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_complaint(jsonb) TO service_role;

COMMENT ON FUNCTION public.submit_public_complaint(jsonb) IS
  'Phase 6.1: atomically create PUBLIC_QR ticket, submission row, and consume OTP session.';
