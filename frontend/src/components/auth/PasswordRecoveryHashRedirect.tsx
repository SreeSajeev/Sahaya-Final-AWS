import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * If Supabase recovery lands on / with #access_token, send user to /reset-password with hash intact.
 * Does not change auth/session logic — navigation only.
 */
export function PasswordRecoveryHashRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;

    const path = location.pathname.replace(/\/$/, "") || "/";
    if (path === "/reset-password") return;

    navigate(`/reset-password${hash}${location.search}`, { replace: true });
  }, [location.pathname, location.hash, location.search, navigate]);

  return null;
}
