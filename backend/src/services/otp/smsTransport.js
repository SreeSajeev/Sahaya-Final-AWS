/**
 * SMS transport adapter — OTP logic depends on this, not on Airtel directly.
 * Future: whatsappTransport, emailTransport implementing the same sendSms contract.
 */

import {
  renderOtpSms,
  resolveOtpSmsProviderOverrides,
  sendFESmsWithResult,
} from "../smsService.js";

/**
 * @typedef {object} SmsSendOptions
 * @property {string} [dltTemplateId]
 * @property {string} [messageType]
 * @property {boolean} [logRedactOtp]
 */

/**
 * @typedef {object} SmsTransportResult
 * @property {boolean} delivered
 * @property {boolean} skipped
 * @property {string | null} reason_code
 * @property {string | null} error
 */

/**
 * @param {{ phoneNumber: string, message: string, options?: SmsSendOptions }} params
 * @returns {Promise<SmsTransportResult>}
 */
export async function sendSms({ phoneNumber, message, options = {} }) {
  const dltTemplateId = options.dltTemplateId ?? null;
  const messageType = options.messageType ?? null;
  const out = await sendFESmsWithResult({
    phoneNumber,
    message,
    dltTemplateId,
    messageType,
    logRedactOtp: Boolean(options.logRedactOtp),
  });
  const skipped = Boolean(out.skipped);
  const delivered = Boolean(out.ok);
  return {
    delivered,
    skipped,
    reason_code: out.reason_code ?? null,
    error: out.error ?? null,
  };
}

/**
 * Send public OTP SMS via configured DLT OTP template.
 * @param {{ phoneNumber: string, otp: string }} params
 * @returns {Promise<SmsTransportResult>}
 */
export async function sendOtpSms({ phoneNumber, otp }) {
  const message = renderOtpSms({ otp });
  const overrides = resolveOtpSmsProviderOverrides();
  return sendSms({
    phoneNumber,
    message,
    options: { ...overrides, logRedactOtp: true },
  });
}
