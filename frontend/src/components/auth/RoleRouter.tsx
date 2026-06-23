import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function RoleRouter() {
  const { loading, user, userProfile } = useAuth();

  // Wait for auth session to resolve
  if (loading && !user) {
    return <FullPageLoader />;
  }

  // Authenticated but profile still loading
  if (user && !userProfile) {
    return <FullPageLoader />;
  }

  // Not authenticated
  if (!user || !userProfile) {
    return <Navigate to="/" replace />;
  }

  if (userProfile.role === "FIELD_EXECUTIVE") {
    return <Navigate to="/fe/dashboard" replace />;
  }

  // STAFF / ADMIN / SUPER_ADMIN
  return <Navigate to="/staff/dashboard" replace />;
}
