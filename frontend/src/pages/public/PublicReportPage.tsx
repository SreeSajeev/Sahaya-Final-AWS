import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicReportLayout, type PublicReportStepId } from "@/components/public/PublicReportLayout";
import { PublicReportLandingStep } from "@/components/public/PublicReportLandingStep";
import { PublicReportVerifyStep } from "@/components/public/PublicReportVerifyStep";
import { PublicReportFormStep } from "@/components/public/PublicReportFormStep";
import { PublicReportSuccessStep } from "@/components/public/PublicReportSuccessStep";
import { PublicReportDraftSuccessStep } from "@/components/public/PublicReportDraftSuccessStep";
import { fetchComplaintPointContext, validatePublicSession } from "@/lib/publicComplaintApi";
import {
  isPublicComplaintsEnabled,
  isPublicSubmitEnabled,
} from "@/lib/publicComplaintsFeature";
import {
  clearPublicReportSession,
  clearVerificationSession,
  loadPublicReportSession,
  savePublicReportSession,
  type PublicReportSession,
  type PublicSubmitSuccess,
} from "@/lib/publicReportSession";
import { toast } from "@/hooks/use-toast";

type WizardStep = "landing" | "verify" | "form" | "success";

function stepToProgress(step: WizardStep): PublicReportStepId {
  switch (step) {
    case "landing":
      return "location";
    case "verify":
      return "verify";
    case "form":
      return "details";
    case "success":
      return "done";
    default:
      return "location";
  }
}

export default function PublicReportPage() {
  const { publicToken } = useParams<{ publicToken: string }>();
  const token = publicToken?.trim() ?? "";
  const submitEnabled = isPublicSubmitEnabled();

  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [session, setSession] = useState<PublicReportSession | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>("landing");
  const [submitResult, setSubmitResult] = useState<PublicSubmitSuccess | null>(null);
  const [draftSuccessSession, setDraftSuccessSession] = useState<PublicReportSession | null>(
    null
  );

  useEffect(() => {
    if (!isPublicComplaintsEnabled()) {
      setLoadState("error");
      setErrorMessage("Public reporting is not available.");
      return;
    }
    if (!token) {
      setLoadState("error");
      setErrorMessage("This link is not available.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const existing = loadPublicReportSession(token);

        const ctx = await fetchComplaintPointContext(token);
        if (cancelled) return;

        let nextSession: PublicReportSession = existing ?? {
          publicToken: token,
          complaintPointContext: ctx,
        };
        if (!existing) {
          nextSession = { publicToken: token, complaintPointContext: ctx };
          savePublicReportSession(nextSession);
        } else {
          nextSession = { ...existing, complaintPointContext: ctx };
          savePublicReportSession(nextSession);
        }

        if (existing?.verificationToken) {
          try {
            const validated = await validatePublicSession(existing.verificationToken);
            nextSession = {
              ...nextSession,
              verificationExpiresAt: validated.verification_expires_at,
              mobileLast4: validated.mobile_last4 ?? undefined,
            };
            savePublicReportSession(nextSession);
            if (!cancelled) {
              setSession(nextSession);
              setWizardStep("form");
              setLoadState("ready");
            }
            return;
          } catch {
            nextSession =
              clearVerificationSession(token, nextSession) ?? {
                ...nextSession,
                verificationToken: undefined,
                verifiedAt: undefined,
                verificationExpiresAt: undefined,
                otpSessionId: undefined,
                otpExpiresAt: undefined,
              };
            if (!cancelled) {
              toast({
                title: "Session expired",
                description: "Please verify your mobile number again to continue.",
                variant: "destructive",
              });
            }
          }
        }

        if (!cancelled) {
          setSession(nextSession);
          setWizardStep("landing");
          setLoadState("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setLoadState("error");
          setErrorMessage(
            err instanceof Error ? err.message : "This link is not available."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSessionExpired = () => {
    if (!token) return;
    const cleared = clearVerificationSession(token, session);
    if (cleared) {
      setSession(cleared);
    } else if (session) {
      setSession({
        ...session,
        verificationToken: undefined,
        verifiedAt: undefined,
        verificationExpiresAt: undefined,
        otpSessionId: undefined,
        otpExpiresAt: undefined,
        formDraft: undefined,
      });
    }
    toast({
      title: "Session expired",
      description: "Please verify your mobile number again to continue.",
      variant: "destructive",
    });
    setWizardStep("verify");
  };

  const handleSubmitSuccess = (result: PublicSubmitSuccess) => {
    clearPublicReportSession(token);
    setSubmitResult(result);
    setDraftSuccessSession(null);
    if (session) {
      setSession({
        publicToken: token,
        complaintPointContext: session.complaintPointContext,
      });
    }
    setWizardStep("success");
  };

  const handleDraftComplete = (next: PublicReportSession) => {
    setSession(next);
    setDraftSuccessSession(next);
    setSubmitResult(null);
    setWizardStep("success");
  };

  const handleDone = async () => {
    clearPublicReportSession(token);
    setSubmitResult(null);
    setDraftSuccessSession(null);
    try {
      const ctx = await fetchComplaintPointContext(token);
      const fresh: PublicReportSession = {
        publicToken: token,
        complaintPointContext: ctx,
      };
      savePublicReportSession(fresh);
      setSession(fresh);
      setWizardStep("landing");
    } catch {
      setLoadState("error");
      setErrorMessage("This link is not available.");
    }
  };

  if (!isPublicComplaintsEnabled()) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <UnavailableCard message="Public reporting is not enabled." />
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  if (loadState === "error" || !session) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <UnavailableCard message={errorMessage ?? "This link is not available."} />
      </div>
    );
  }

  const progress = stepToProgress(wizardStep);
  const successTitle = submitResult ? "Submitted" : "All set";

  return (
    <PublicReportLayout
      activeStep={progress}
      title={
        wizardStep === "landing"
          ? "Report an issue"
          : wizardStep === "verify"
            ? "Verify mobile"
            : wizardStep === "form"
              ? "Your complaint"
              : successTitle
      }
    >
      {wizardStep === "landing" && (
        <PublicReportLandingStep
          context={session.complaintPointContext}
          onContinue={() => setWizardStep("verify")}
        />
      )}
      {wizardStep === "verify" && (
        <PublicReportVerifyStep
          session={session}
          onVerified={(next) => {
            setSession(next);
            setWizardStep("form");
          }}
        />
      )}
      {wizardStep === "form" && session.verificationToken && (
        <PublicReportFormStep
          session={session}
          submitEnabled={submitEnabled}
          onSubmitSuccess={handleSubmitSuccess}
          onDraftComplete={handleDraftComplete}
          onSessionExpired={handleSessionExpired}
        />
      )}
      {wizardStep === "form" && !session.verificationToken && (
        <PublicReportVerifyStep
          session={session}
          onVerified={(next) => {
            setSession(next);
            setWizardStep("form");
          }}
        />
      )}
      {wizardStep === "success" && submitResult && (
        <PublicReportSuccessStep
          result={submitResult}
          complaintPointName={session.complaintPointContext.name}
          onDone={handleDone}
        />
      )}
      {wizardStep === "success" && !submitResult && draftSuccessSession && (
        <PublicReportDraftSuccessStep session={draftSuccessSession} onDone={handleDone} />
      )}
    </PublicReportLayout>
  );
}

function UnavailableCard({ message }: { message: string }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <CardTitle>Unavailable</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" className="w-full" asChild>
          <a href="/">Go to home</a>
        </Button>
      </CardContent>
    </Card>
  );
}
