import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/PasswordField";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Reset password page: user lands here after clicking the email link.
 * Supabase restores the session from the URL hash; we show a form to set a new password.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [session, setSession] = useState<unknown>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setSession(data.session);
        setChecking(false);
      }
    };
    run();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!cancelled) setSession(sess);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Use at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirm) {
      toast({
        title: "Passwords don’t match",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({
        title: "Failed to update password",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Password updated. Sign in with your new password." });
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  if (checking) {
    return (
      <div className="grid min-h-screen w-full place-items-center bg-gradient-to-b from-gray-50 to-gray-100/80 p-6">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Checking reset link…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="grid min-h-screen w-full place-items-center bg-gradient-to-b from-gray-50 to-gray-100/80 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid or expired link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired. Request a new
              one from the sign-in page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/login">Go to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen w-full place-items-center bg-gradient-to-b from-gray-50 to-gray-100/80 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Set new password
          </CardTitle>
          <CardDescription>
            Enter your new password below. Use at least 6 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="reset-password">New password</Label>
              <PasswordField
                id="reset-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <div>
              <Label htmlFor="reset-confirm">Confirm password</Label>
              <PasswordField
                id="reset-confirm"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                "Update password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
