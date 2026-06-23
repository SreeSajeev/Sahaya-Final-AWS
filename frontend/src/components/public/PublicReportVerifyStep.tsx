import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpInput } from "@/components/public/OtpInput";
import { sendPublicOtp, verifyPublicOtp, validatePublicSession } from "@/lib/publicComplaintApi";
import {
  normalizeMobileForApi,
  publicMobileSchema,
  publicOtpSchema,
} from "@/lib/publicComplaintValidation";
import { mergePublicReportSession, type PublicReportSession } from "@/lib/publicReportSession";
import { toast } from "@/hooks/use-toast";

type PublicReportVerifyStepProps = {
  session: PublicReportSession;
  onVerified: (session: PublicReportSession) => void;
};

function msUntil(iso: string | undefined): number {
  if (!iso) return 0;
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

function formatCountdown(ms: number): string {
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Client-side spacing between resend attempts (backend still enforces limits). */
const RESEND_COOLDOWN_MS = 30_000;

export function PublicReportVerifyStep({ session, onVerified }: PublicReportVerifyStepProps) {
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSessionId, setOtpSessionId] = useState(session.otpSessionId ?? "");
  const [otpExpiresAt, setOtpExpiresAt] = useState(session.otpExpiresAt ?? "");
  const [phase, setPhase] = useState<"mobile" | "otp">(session.otpSessionId ? "otp" : "mobile");
  const [sendPending, setSendPending] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [otpCountdownMs, setOtpCountdownMs] = useState(() => msUntil(session.otpExpiresAt));
  const [resendCooldownMs, setResendCooldownMs] = useState(0);

  useEffect(() => {
    if (resendCooldownMs <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldownMs((ms) => Math.max(0, ms - 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendCooldownMs]);

  useEffect(() => {
    if (!otpExpiresAt) return;
    const tick = () => setOtpCountdownMs(msUntil(otpExpiresAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [otpExpiresAt]);

  const handleSendOtp = async () => {
    const parsed = publicMobileSchema.safeParse(mobile);
    if (!parsed.success) {
      toast({ title: parsed.error.errors[0]?.message ?? "Invalid mobile", variant: "destructive" });
      return;
    }
    setSendPending(true);
    try {
      const res = await sendPublicOtp(
        normalizeMobileForApi(mobile),
        session.publicToken
      );
      setOtpSessionId(res.otp_session_id);
      setOtpExpiresAt(res.expires_at);
      setPhase("otp");
      setOtp("");
      mergePublicReportSession(session.publicToken, {
        otpSessionId: res.otp_session_id,
        otpExpiresAt: res.expires_at,
      });
      setResendCooldownMs(RESEND_COOLDOWN_MS);
      toast({ title: "OTP sent", description: "Check your SMS for the 6-digit code." });
    } catch (err) {
      toast({
        title: "Could not send OTP",
        description: err instanceof Error ? err.message : "Try again later.",
        variant: "destructive",
      });
    } finally {
      setSendPending(false);
    }
  };

  const handleVerifyOtp = async () => {
    const parsed = publicOtpSchema.safeParse(otp);
    if (!parsed.success) {
      toast({ title: parsed.error.errors[0]?.message ?? "Invalid OTP", variant: "destructive" });
      return;
    }
    if (!otpSessionId) {
      toast({ title: "Request an OTP first", variant: "destructive" });
      return;
    }
    if (otpCountdownMs <= 0) {
      toast({ title: "OTP expired", description: "Request a new code.", variant: "destructive" });
      return;
    }
    setVerifyPending(true);
    try {
      const res = await verifyPublicOtp(otpSessionId, otp);
      const validated = await validatePublicSession(res.verification_token);
      const next = mergePublicReportSession(session.publicToken, {
        otpSessionId: res.otp_session_id,
        verificationToken: res.verification_token,
        verifiedAt: res.verified_at,
        verificationExpiresAt: validated.verification_expires_at,
        mobileLast4: validated.mobile_last4 ?? undefined,
      });
      if (next) onVerified(next);
    } catch (err) {
      toast({
        title: "Verification failed",
        description: err instanceof Error ? err.message : "Check the code and try again.",
        variant: "destructive",
      });
    } finally {
      setVerifyPending(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldownMs > 0) return;
    if (!mobile.trim()) {
      toast({ title: "Enter your mobile number first", variant: "destructive" });
      setPhase("mobile");
      return;
    }
    await handleSendOtp();
  };

  if (phase === "mobile") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verify your mobile</CardTitle>
          <CardDescription>
            We will send a one-time code to confirm your number. Standard SMS rates may apply.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile number</Label>
            <Input
              id="mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="10-digit mobile"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              disabled={sendPending}
            />
          </div>
          <Button className="w-full" size="lg" onClick={handleSendOtp} disabled={sendPending}>
            {sendPending ? "Sending…" : "Send OTP"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter OTP</CardTitle>
        <CardDescription>
          Code sent to your mobile
          {session.mobileLast4 ? ` ending ${session.mobileLast4}` : ""}.
          {otpCountdownMs > 0 ? (
            <span className="mt-1 block font-medium text-foreground">
              Expires in {formatCountdown(otpCountdownMs)}
            </span>
          ) : (
            <span className="mt-1 block text-destructive">Code expired — request a new one.</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <OtpInput value={otp} onChange={setOtp} disabled={verifyPending} />
        <Button
          className="w-full"
          size="lg"
          onClick={handleVerifyOtp}
          disabled={verifyPending || otpCountdownMs <= 0}
        >
          {verifyPending ? "Verifying…" : "Verify"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={handleResend}
          disabled={sendPending || resendCooldownMs > 0}
        >
          {resendCooldownMs > 0
            ? `Resend OTP in ${formatCountdown(resendCooldownMs)}`
            : "Resend OTP"}
        </Button>
        <Button type="button" variant="link" className="w-full" onClick={() => setPhase("mobile")}>
          Change mobile number
        </Button>
      </CardContent>
    </Card>
  );
}
