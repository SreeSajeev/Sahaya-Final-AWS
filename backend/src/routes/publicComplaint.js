import express from "express";
import { requirePublicComplaintsEnabled } from "../middleware/publicComplaintsGate.js";
import { createRateLimitWithAuditLog } from "../utils/rateLimitWithAuditLog.js";
import {
  getComplaintPointContextHandler,
  patchSessionProfileHandler,
  validateSessionHandler,
} from "../controllers/publicComplaintController.js";
import { submitPublicComplaintHandler } from "../controllers/publicComplaintSubmitController.js";

const router = express.Router();

const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);

const contextLimiter = createRateLimitWithAuditLog("public-complaint-context", {
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_PUBLIC_CONTEXT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

const sessionValidateLimiter = createRateLimitWithAuditLog("public-session-validate", {
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_PUBLIC_SESSION_VALIDATE_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

const sessionProfileLimiter = createRateLimitWithAuditLog("public-session-profile", {
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_PUBLIC_SESSION_PROFILE_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

const submitComplaintLimiter = createRateLimitWithAuditLog("public-submit-complaint", {
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_PUBLIC_SUBMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

router.use(requirePublicComplaintsEnabled);

router.get(
  "/complaint-points/:publicToken/context",
  contextLimiter,
  getComplaintPointContextHandler
);
router.post("/session/validate", sessionValidateLimiter, validateSessionHandler);
router.patch("/session/profile", sessionProfileLimiter, patchSessionProfileHandler);
router.post("/submit-complaint", submitComplaintLimiter, submitPublicComplaintHandler);

export default router;
