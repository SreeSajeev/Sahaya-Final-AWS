import express from "express";
import { requirePublicComplaintsEnabled } from "../middleware/publicComplaintsGate.js";
import { createRateLimitWithAuditLog } from "../utils/rateLimitWithAuditLog.js";
import { sendOtpHandler, verifyOtpHandler } from "../controllers/publicOtpController.js";

const router = express.Router();

const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);

const sendOtpLimiter = createRateLimitWithAuditLog("public-send-otp", {
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_PUBLIC_SEND_OTP_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP requests. Try again later." },
});

const verifyOtpLimiter = createRateLimitWithAuditLog("public-verify-otp", {
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_PUBLIC_VERIFY_OTP_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Try again later." },
});

router.use(requirePublicComplaintsEnabled);

router.post("/send-otp", sendOtpLimiter, sendOtpHandler);
router.post("/verify-otp", verifyOtpLimiter, verifyOtpHandler);

export default router;
