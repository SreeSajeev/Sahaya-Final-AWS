import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import React from "react";
import { SahayaBootLoading } from "@/components/auth/SahayaBootLoading";

/* ================= LOADING UI ================= */

function AuthLoading() {
  return <SahayaBootLoading />;
}

interface GuardProps {
  fallback?: React.ReactNode;
}

/* ================= BASE AUTH ================= */
/**
 * Authenticated users only.
 * Loading allowed ONLY while user is unresolved.
 */
export function RequireAuth({ fallback }: GuardProps) {
  const { user, loading } = useAuth();

  if (loading && !user) {
    return fallback ?? <AuthLoading />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

/* ================= STAFF ONLY ================= */
/**
 * STAFF / ADMIN only.
 * FE and CLIENT are explicitly redirected.
 * Blocks until profile is resolved (avoids role decision with null userProfile).
 */
export function RequireStaff({ fallback }: GuardProps) {
  const { user, loading, userProfile, isFieldExecutive, isClient } = useAuth();

  const authNotReady = loading || (user != null && userProfile == null);
  if (authNotReady) {
    return fallback ?? <AuthLoading />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (isFieldExecutive) {
    return <Navigate to="/" replace />;
  }

  if (isClient) {
    return <Navigate to="/app/client" replace />;
  }

  return <Outlet />;
}

/* ================= CLIENT ONLY ================= */
/**
 * CLIENT only. Redirect non-CLIENT to /app.
 * Blocks until profile is resolved (avoids role decision with null userProfile).
 */
export function RequireClient({ children, fallback }: GuardProps & { children?: React.ReactNode }) {
  const { user, loading, userProfile } = useAuth();

  const authNotReady = loading || (user != null && userProfile == null);
  if (authNotReady) {
    return (fallback ?? <AuthLoading />) as React.ReactElement;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (userProfile?.role !== "CLIENT") {
    return <Navigate to="/app" replace />;
  }

  return children as React.ReactElement;
}

/* ================= FE ONLY ================= */
/**
 * FIELD_EXECUTIVE only.
 * Blocks until profile is resolved.
 */
export function RequireFE({ fallback }: GuardProps) {
  const { user, loading, userProfile, isFieldExecutive, isClient } = useAuth();

  const authNotReady = loading || (user != null && userProfile == null);
  if (authNotReady) {
    return fallback ?? <AuthLoading />;
  }

  if (!user) {
    // Send to login (not marketing `/`) so session expiry or deep links to `/fe` recover clearly.
    return <Navigate to="/login" replace />;
  }

  if (!isFieldExecutive) {
    if (isClient) return <Navigate to="/app/client" replace />;
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}

/* ================= ADMIN ONLY ================= */
/**
 * ADMIN / SUPER_ADMIN only.
 * Blocks until profile is resolved.
 */
export function RequireAdmin({ fallback }: GuardProps) {
  const { user, loading, userProfile, isAdmin } = useAuth();

  const authNotReady = loading || (user != null && userProfile == null);
  if (authNotReady) {
    return fallback ?? <AuthLoading />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

/* ================= SUPER ADMIN ONLY ================= */
/**
 * SUPER_ADMIN only. Used for SaaS super-admin dashboard.
 * Blocks until profile is resolved.
 */
export function RequireSuperAdmin({ fallback }: GuardProps) {
  const { user, loading, userProfile } = useAuth();

  const authNotReady = loading || (user != null && userProfile == null);
  if (authNotReady) {
    return fallback ?? <AuthLoading />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (userProfile?.role !== "SUPER_ADMIN") {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}
