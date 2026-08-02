import { jsonRes } from '../utils/http.js';
import { findUserById } from '../repositories/userRepository.js';
import { verifyAccessToken } from '../services/jwtAccessService.js';
import { mapPrismaRowToSnake } from '../repositories/db/rowMapper.js';
import { prisma } from '../db/prisma.js';

/**
 * Backend authentication middleware — Sahaya local JWT (no Supabase Auth).
 * Loads app user from public.users and denies access if is_active === false.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.warn("[auth] missing authorization", {
      method: req.method,
      path: req.originalUrl || req.url,
      origin: req.headers.origin ?? null,
      requestId: req.requestId ?? null,
    });
    return jsonRes(res, 401, { error: 'Missing Authorization header' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return jsonRes(res, 401, { error: 'Missing Authorization header' });
  }

  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch (err) {
    console.warn("[auth] invalid token", {
      method: req.method,
      path: req.originalUrl || req.url,
      origin: req.headers.origin ?? null,
      requestId: req.requestId ?? null,
      errorMessage: err?.message ?? null,
    });
    return jsonRes(res, 401, { error: 'Invalid or expired token' });
  }

  req.user = {
    id: claims.userId,
    email: claims.email,
    role: claims.role,
    organisation_id: claims.organisationId,
  };
  req.authClaims = claims;

  const { data: appUser, error: appError } = await findUserById(claims.userId);

  if (!appError && appUser) {
    const isActive = appUser.is_active !== false && appUser.is_active !== null;
    if (!isActive) {
      return jsonRes(res, 403, {
        error: 'Account deactivated. Contact administrator.',
      });
    }
    req.appUser = appUser;
  }

  next();
}

/**
 * Requires a row in public.users (CRM profile). Use after requireAuth on protected CRM routes.
 */
export function requireAppUser(req, res, next) {
  if (!req.appUser) {
    return jsonRes(res, 403, {
      error:
        'User profile not provisioned. Contact an administrator.',
    });
  }
  next();
}

/** Resolve app user from access JWT for tenant context (no throw). */
export async function resolveAppUserFromAccessToken(token) {
  try {
    const claims = await verifyAccessToken(token);
    const row = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: {
        id: true,
        role: true,
        organisationId: true,
        isActive: true,
        active: true,
        email: true,
        name: true,
      },
    });
    return row ? mapPrismaRowToSnake(row) : null;
  } catch {
    return null;
  }
}
