/**
 * Exclusive runtime dispatcher.
 * Mode lookup is CACHED — LEGACY orgs do not hit DB on every ticket request after warm/negative cache.
 */
import { requireAuth } from "../../middleware/auth.js";
import { getOrganisationPlatformMode } from "./tenantSettingsRepository.js";
import { PLATFORM_MODES } from "./platformMode.js";
import { peekPlatformModeCache } from "./platformModeCache.js";

export function isPlatformCompatibilityModeEnabled() {
  return String(process.env.PLATFORM_COMPATIBILITY_MODE || "false").toLowerCase() === "true";
}

function runRequireAuth(req, res) {
  return new Promise((resolve) => {
    requireAuth(req, res, () => resolve());
  });
}

/**
 * @param {"all"|"ticketPaths"|"feMe"|"sm"} scope
 */
export function exclusiveLegacyTicketGate(scope = "all") {
  return async function exclusiveLegacyTicketGateMiddleware(req, res, next) {
    try {
      if (isPlatformCompatibilityModeEnabled()) {
        return next();
      }

      if (!matchesScope(req, scope)) {
        return next();
      }

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return next();
      }

      if (!req.appUser && !req.user) {
        await runRequireAuth(req, res);
        if (res.headersSent) return;
      }

      const orgId =
        req.appUser?.organisation_id ||
        req.appUser?.organisationId ||
        req.user?.organisation_id ||
        null;
      if (!orgId) return next();

      // Fast path: cached LEGACY → zero DB
      const cached = peekPlatformModeCache(orgId);
      let mode = cached;
      if (!mode) {
        mode = await getOrganisationPlatformMode(orgId);
      }
      if (mode === PLATFORM_MODES.METADATA) {
        return res.status(409).json({
          error:
            "This organisation uses Metadata Platform runtime. Legacy ticket APIs are disabled. Use /platform/runtime/*.",
          code: "PLATFORM_EXCLUSIVE_RUNTIME",
          runtime: "METADATA",
          hint: "Set PLATFORM_COMPATIBILITY_MODE=true only for documented dual-runtime migration windows.",
        });
      }
      return next();
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Runtime gate failed" });
    }
  };
}

function matchesScope(req, scope) {
  const path = req.path || "";
  if (scope === "all") return true;
  if (scope === "ticketPaths") {
    return (
      path === "/tickets" ||
      path.startsWith("/tickets/") ||
      path === "/tickets-row-supplement" ||
      path.startsWith("/tickets-row-supplement")
    );
  }
  if (scope === "feMe") {
    return path === "/me" || path.startsWith("/me/");
  }
  if (scope === "sm") {
    return true;
  }
  return false;
}

export function describeRuntimePolicy() {
  return {
    exclusive: !isPlatformCompatibilityModeEnabled(),
    compatibilityModeEnv: "PLATFORM_COMPATIBILITY_MODE",
    default: "OFF",
    modeCache: true,
    metadataUses: ["/platform/*"],
    legacyUses: ["/tickets", "/data/tickets*", "/fe/me*", "/sm/*"],
  };
}
