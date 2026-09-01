/**
 * Shared FE magic-link token lifecycle validation for public routes.
 */
import { SAFE_TOKEN_LIFECYCLE } from "../config/appConfig.js";
import { TOKEN_STATES, isTokenExpired } from "./tokenService.js";
import { markFeActionTokenExpired } from "../repositories/feActionTokenRepository.js";
import { hasPublicColumn } from "./schemaCompatService.js";

/**
 * @param {Record<string, unknown>|null|undefined} actionToken
 * @param {{ checkUsed?: boolean, tokenId?: string, hasTokenStateColumn?: boolean }} opts
 * @returns {Promise<{ ok: true, effectiveTokenState: string|null }|{ ok: false, status: number, message: string, code?: string }>}
 */
export async function validateFeActionTokenLifecycle(actionToken, opts = {}) {
  if (!actionToken) {
    return { ok: false, status: 404, message: "Invalid token" };
  }

  const effectiveTokenState =
    actionToken.token_state == null && SAFE_TOKEN_LIFECYCLE
      ? TOKEN_STATES.ACTIVE
      : actionToken.token_state;

  if (opts.checkUsed !== false) {
    if (actionToken.used || effectiveTokenState === TOKEN_STATES.USED) {
      return { ok: false, status: 410, message: "Token already used", code: "TOKEN_USED" };
    }
  }
  if (effectiveTokenState === TOKEN_STATES.REVOKED) {
    return { ok: false, status: 410, message: "Token revoked", code: "TOKEN_REVOKED" };
  }
  if (effectiveTokenState === TOKEN_STATES.EXPIRED || isTokenExpired(actionToken.expires_at)) {
    const hasTokenStateColumn =
      opts.hasTokenStateColumn ?? (await hasPublicColumn("fe_action_tokens", "token_state"));
    if (hasTokenStateColumn && opts.tokenId) {
      await markFeActionTokenExpired(opts.tokenId);
    }
    return { ok: false, status: 410, message: "Token expired", code: "TOKEN_EXPIRED" };
  }

  return { ok: true, effectiveTokenState };
}
