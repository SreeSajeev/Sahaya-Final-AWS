import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicSubmitSuccess } from "@/lib/publicReportSession";

type PublicReportSuccessStepProps = {
  result: PublicSubmitSuccess;
  complaintPointName: string;
  onDone: () => void;
};

function formatSubmittedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function PublicReportSuccessStep({
  result,
  complaintPointName,
  onDone,
}: PublicReportSuccessStepProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="h-6 w-6" />
          <CardTitle>Complaint submitted</CardTitle>
        </div>
        <CardDescription>
          Your complaint has been submitted successfully.
          {result.idempotent ? " (Already registered — same ticket number.)" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Ticket number</dt>
            <dd className="font-mono text-base font-semibold tracking-tight">
              {result.ticket_number}
            </dd>
          </div>
          {result.complaint_id ? (
            <div>
              <dt className="text-muted-foreground">Complaint ID</dt>
              <dd className="font-medium">{result.complaint_id}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted-foreground">Reporter</dt>
            <dd className="font-medium">{result.reporter_name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd className="font-medium">{complaintPointName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Submitted</dt>
            <dd>{formatSubmittedAt(result.submitted_at)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Save your ticket number for follow-up. To report another issue, verify your mobile again.
        </p>
        <Button className="w-full" variant="outline" onClick={onDone}>
          Done
        </Button>
      </CardContent>
    </Card>
  );
}
