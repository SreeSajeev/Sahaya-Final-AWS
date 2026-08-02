import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/common";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fetchJson } from "@/lib/backendDataApi";
import { useAuth } from "@/hooks/useAuth";

/**
 * Change password via Sahaya backend (Argon2id). Revokes all sessions.
 */
export default function ChangePassword() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword: password },
      });
      toast({ title: "Password updated", description: "Please sign in again." });
      await signOut();
      navigate("/");
    } catch (err) {
      toast({
        title: "Failed to update password",
        description: err instanceof Error ? err.message : "Error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayoutNew>
      <PageContainer>
        <PageHeader title="Change password" />
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Update password</CardTitle>
            <CardDescription>You will be signed out after a successful change.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current">Current password</Label>
                <PasswordField
                  id="current"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">New password</Label>
                <PasswordField
                  id="new"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <PasswordField
                  id="confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </PageContainer>
    </AppLayoutNew>
  );
}
