import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Local JWT password-reset links use `/reset-password?token=...`.
 * If a reset token lands on another path (bookmark, mis-routed link),
 * redirect to `/reset-password` while preserving the query string.
 * UX-only; does not create sessions or call auth APIs.
 */
export function PasswordResetDeepLinkRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hasQueryToken = params.has("token");
    if (!hasQueryToken) return;

    const path = location.pathname.replace(/\/$/, "") || "/";
    if (path === "/reset-password") return;

    navigate(`/reset-password${location.search}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  return null;
}
