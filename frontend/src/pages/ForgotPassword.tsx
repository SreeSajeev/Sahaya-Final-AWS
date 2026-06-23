import { useState } from "react";
import { Link } from "react-router-dom";
import { postPublicJson } from "@/lib/backendDataApi";
import { getPasswordResetRedirectUrl } from "@/lib/passwordResetUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Forgot password: request a reset link via Postmark (backend generates Supabase recovery link).
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast({ title: "Enter your email", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const redirectTo = getPasswordResetRedirectUrl();
      await postPublicJson<{ message?: string }>("/auth/public/forgot-password", {
        email: trimmed,
        redirectTo,
      });
      setSent(true);
      toast({
        title: "Check your email",
        description: "If an account exists, we sent a password reset link.",
      });
    } catch (err) {
      toast({
        title: "Failed to send reset link",
        description: err instanceof Error ? err.message : "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="grid min-h-screen w-full place-items-center bg-gradient-to-b from-gray-50 to-gray-100/80 p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <CardTitle>Check your email</CardTitle>
            </div>
            <CardDescription>
              If an account exists for that email, we sent a password reset link.
              Click the link to set a new password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full" asChild>
              <Link to="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Link>
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
            <Mail className="h-5 w-5" />
            Forgot password
          </CardTitle>
          <CardDescription>
            Enter your email and we’ll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>
          <Button variant="ghost" className="w-full" asChild>
            <Link to="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
