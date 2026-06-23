// src/services/tokenService.js
// Single-responsibility token lifecycle service

import crypto from "crypto"
import { hasPublicColumn } from "./schemaCompatService.js"
import { FE_ACTION_TOKEN_EXPIRY_HOURS, SAFE_TOKEN_LIFECYCLE } from "../config/appConfig.js"
import {
  findReusableFeActionToken,
  insertFeActionToken,
  markFeActionTokenUsedAtomic,
  findResolutionFallbackToken,
  activateLockedResolutionToken,
  revokeFeActionTokensForTicket,
} from "../repositories/feActionTokenRepository.js"

export const TOKEN_STATES = {
  LOCKED: "LOCKED",
  ACTIVE: "ACTIVE",
  USED: "USED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
}

function buildExpiryIso(hours = FE_ACTION_TOKEN_EXPIRY_HOURS) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

async function findReusableToken({ ticketId, feId, actionType, allowedStates, nowIso }) {
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state")
  return findReusableFeActionToken({
    ticketId,
    feId,
    actionType,
    allowedStates,
    nowIso,
    hasTokenState,
  })
}

async function insertToken({
  ticketId,
  feId,
  actionType,
  tokenState,
  expiresAtIso,
  idempotencyKey = null,
}) {
  const tokenId = crypto.randomUUID()
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state")
  const hasIdempotencyKey = await hasPublicColumn("fe_action_tokens", "idempotency_key")

  const payload = {
    id: tokenId,
    ticket_id: ticketId,
    fe_id: feId,
    action_type: actionType,
    expires_at: expiresAtIso,
    used: false,
  }
  if (hasTokenState) payload.token_state = tokenState
  if (hasIdempotencyKey) payload.idempotency_key = idempotencyKey
  else if (idempotencyKey) {
    console.warn("[token-service] fe_action_tokens.idempotency_key missing; skipping safe write")
  }

  await insertFeActionToken(payload)
  return tokenId
}

export async function issueAssignmentTokenPair({
  ticketId,
  feId,
  expiryHours = FE_ACTION_TOKEN_EXPIRY_HOURS,
  idempotencyKey = null,
}) {
  const nowIso = new Date().toISOString()
  const expiresAtIso = buildExpiryIso(expiryHours)

  const existingOnSite = await findReusableToken({
    ticketId,
    feId,
    actionType: "ON_SITE",
    allowedStates: [TOKEN_STATES.ACTIVE],
    nowIso,
  })

  const existingResolution = await findReusableToken({
    ticketId,
    feId,
    actionType: "RESOLUTION",
    allowedStates: [TOKEN_STATES.LOCKED],
    nowIso,
  })

  let onSiteToken = existingOnSite
  let resolutionToken = existingResolution

  if (!onSiteToken) {
    try {
      onSiteToken = await insertToken({
        ticketId,
        feId,
        actionType: "ON_SITE",
        tokenState: TOKEN_STATES.ACTIVE,
        expiresAtIso,
        idempotencyKey,
      })
    } catch (_err) {
      onSiteToken = await findReusableToken({
        ticketId,
        feId,
        actionType: "ON_SITE",
        allowedStates: [TOKEN_STATES.ACTIVE],
        nowIso,
      })
      if (!onSiteToken) throw _err
    }
  }

  if (!resolutionToken) {
    try {
      resolutionToken = await insertToken({
        ticketId,
        feId,
        actionType: "RESOLUTION",
        tokenState: TOKEN_STATES.LOCKED,
        expiresAtIso,
        idempotencyKey,
      })
    } catch (_err) {
      resolutionToken = await findReusableToken({
        ticketId,
        feId,
        actionType: "RESOLUTION",
        allowedStates: [TOKEN_STATES.LOCKED],
        nowIso,
      })
      if (!resolutionToken) throw _err
    }
  }

  return { onSiteToken, resolutionToken }
}

/**
 * Create FE action token
 * - One active, unexpired token per (ticket_id, action_type)
 * - Idempotent and race-safe
 */
export async function createActionToken({
  ticketId,
  feId,
  actionType,
}) {
  const nowIso = new Date().toISOString()
  const tokenState = actionType === "RESOLUTION" ? TOKEN_STATES.LOCKED : TOKEN_STATES.ACTIVE
  const reusableStates = actionType === "RESOLUTION" ? [TOKEN_STATES.LOCKED] : [TOKEN_STATES.ACTIVE]

  const existing = await findReusableToken({
    ticketId,
    feId,
    actionType,
    allowedStates: reusableStates,
    nowIso,
  })

  if (existing) {
    return existing
  }

  const expiresAtIso = buildExpiryIso()

  try {
    return await insertToken({
      ticketId,
      feId,
      actionType,
      tokenState,
      expiresAtIso,
    })
  } catch (insertError) {
    const retry = await findReusableToken({
      ticketId,
      feId,
      actionType,
      allowedStates: reusableStates,
      nowIso,
    })
    if (retry) return retry
    throw insertError
  }
}

/**
 * Mark token as used (atomic single-use guarantee)
 */
export async function markTokenUsed(tokenId) {
  const nowIso = new Date().toISOString()
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state")
  const hasUsedAt = await hasPublicColumn("fe_action_tokens", "used_at")

  const updatePayload = { used: true }
  if (hasTokenState) updatePayload.token_state = TOKEN_STATES.USED
  if (hasUsedAt) updatePayload.used_at = nowIso

  return markFeActionTokenUsedAtomic({
    tokenId,
    updatePayload,
    hasTokenState,
    nowIso,
    allowedStates: [TOKEN_STATES.ACTIVE, TOKEN_STATES.LOCKED],
  })
}

export async function activateResolutionTokenAfterOnSiteProof({ ticketId, feId = null }) {
  const nowIso = new Date().toISOString()
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state")
  const hasActivatedAt = await hasPublicColumn("fe_action_tokens", "activated_at")

  if (!hasTokenState || !SAFE_TOKEN_LIFECYCLE) {
    return findResolutionFallbackToken({ ticketId, feId, nowIso })
  }

  const updatePayload = { token_state: TOKEN_STATES.ACTIVE }
  if (hasActivatedAt) updatePayload.activated_at = nowIso

  return activateLockedResolutionToken({ ticketId, feId, updatePayload, nowIso })
}

export async function revokeTokensForTicket({ ticketId, reason = null }) {
  const nowIso = new Date().toISOString()
  const hasTokenState = await hasPublicColumn("fe_action_tokens", "token_state")
  const hasRevokedAt = await hasPublicColumn("fe_action_tokens", "revoked_at")
  const hasIdempotencyKey = await hasPublicColumn("fe_action_tokens", "idempotency_key")

  const updatePayload = { used: true }
  if (hasTokenState) updatePayload.token_state = TOKEN_STATES.REVOKED
  if (hasRevokedAt) updatePayload.revoked_at = nowIso
  if (hasIdempotencyKey) updatePayload.idempotency_key = reason ?? null

  const { error } = await revokeFeActionTokensForTicket({
    ticketId,
    updatePayload,
    hasTokenState,
  })

  if (error) throw error
}

export function isTokenExpired(expiresAt) {
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() <= Date.now()
}
