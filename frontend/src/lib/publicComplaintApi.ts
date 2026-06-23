import { fetchPublicJson, patchPublicJson, postPublicJson } from "@/lib/backendDataApi";
import type { PublicComplaintFormValues } from "@/lib/publicComplaintValidation";

export type PublicComplaintPointContext = {
  name: string;
  description: string | null;
  building: string | null;
  floor: string | null;
  site_name: string | null;
  defaults: {
    category: string | null;
    issue_type: string | null;
    client_slug: string | null;
  };
};

export type SendOtpResponse = {
  success: boolean;
  otp_session_id: string;
  expires_at: string;
};

export type VerifyOtpResponse = {
  success: boolean;
  otp_session_id: string;
  status: string;
  verification_token: string;
  verified_at: string;
};

export type ValidateSessionResponse = {
  valid: boolean;
  status: string;
  otp_session_id: string;
  verified_at: string;
  verification_expires_at: string;
  mobile_last4: string | null;
  complaint_point: {
    name: string;
    building: string | null;
    floor: string | null;
    site_name: string | null;
  };
};

export type PatchProfileResponse = {
  success: boolean;
  otp_session_id: string;
  reporter_name: string;
};

export function fetchComplaintPointContext(publicToken: string) {
  return fetchPublicJson<PublicComplaintPointContext>(
    `/public/complaint-points/${encodeURIComponent(publicToken)}/context`
  );
}

export function sendPublicOtp(mobile: string, complaintPointToken: string) {
  return postPublicJson<SendOtpResponse>("/public/send-otp", {
    mobile,
    complaint_point_token: complaintPointToken,
  });
}

export function verifyPublicOtp(otpSessionId: string, otp: string) {
  return postPublicJson<VerifyOtpResponse>("/public/verify-otp", {
    otp_session_id: otpSessionId,
    otp,
  });
}

export function validatePublicSession(verificationToken: string) {
  return postPublicJson<ValidateSessionResponse>("/public/session/validate", {
    verification_token: verificationToken,
  });
}

export function patchPublicSessionProfile(verificationToken: string, reporterName: string) {
  return patchPublicJson<PatchProfileResponse>("/public/session/profile", {
    verification_token: verificationToken,
    reporter_name: reporterName,
  });
}

export type SubmitPublicComplaintResponse = {
  success: boolean;
  ticket_number: string;
  status: string;
  otp_session_id: string;
  idempotent?: boolean;
};

export function submitPublicComplaint(
  verificationToken: string,
  form: PublicComplaintFormValues
) {
  return postPublicJson<SubmitPublicComplaintResponse>("/public/submit-complaint", {
    verification_token: verificationToken,
    reporter_name: form.reporter_name,
    category: form.category,
    issue_type: form.issue_type,
    custom_category: form.custom_category,
    custom_issue_type: form.custom_issue_type,
    description: form.description,
    location: form.location,
    vehicle_number: form.vehicle_number,
    complaint_id: form.complaint_id,
  });
}
