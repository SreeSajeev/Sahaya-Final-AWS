import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LoginForm } from "@/components/auth/LoginForm";
import { SahayaBootLoading } from "@/components/auth/SahayaBootLoading";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

const DEACTIVATED_KEY = "auth_deactivated";

export default function Index() {
  const { user, loading, userProfile, signOut } = useAuth();
  const [deactivatedMessage, setDeactivatedMessage] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem(DEACTIVATED_KEY) === "1") {
      sessionStorage.removeItem(DEACTIVATED_KEY);
      setDeactivatedMessage(true);
    }
  }, []);

  /* AUTH BOOTSTRAP — branded loading, never a blank white screen */
  if (loading) {
    return <SahayaBootLoading />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen w-full flex-col">
        {deactivatedMessage && (
          <Alert variant="destructive" className="mx-4 mt-4 max-w-md flex-shrink-0">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Account deactivated. Contact administrator.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-1 min-h-0 items-center justify-center">
          <LoginForm />
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="max-w-sm text-center text-muted-foreground">
          Your account is pending tenant assignment.
        </p>
        <Button variant="outline" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    );
  }

  if (import.meta.env.DEV && userProfile) {
    // eslint-disable-next-line no-console
    console.info("[AUTH DEBUG] redirect", {
      role: userProfile.role,
      email: userProfile.email,
    });
  }

  if (userProfile.role === "SUPER_ADMIN") {
    return <Navigate to="/app/super-admin" replace />;
  }

  if (userProfile.role === "CLIENT") {
    return <Navigate to="/app/client" replace />;
  }

  if (userProfile.role === "FIELD_EXECUTIVE") {
    return <Navigate to="/fe" replace />;
  }

  if (userProfile.role === "ADMIN" || userProfile.role === "STAFF") {
    return <Navigate to="/app" replace />;
  }

  console.error("Unknown role detected:", userProfile.role);
  signOut();
  return <SahayaBootLoading label="Signing out…" />;
}
