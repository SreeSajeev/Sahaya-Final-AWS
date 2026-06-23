import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicReportSession } from "@/lib/publicReportSession";
import { formatMobileDisplay } from "@/lib/publicReportSession";

/** Phase 5 draft-only success when VITE_PUBLIC_SUBMIT_ENABLED is false. */
type PublicReportDraftSuccessStepProps = {
  session: PublicReportSession;
  onDone: () => void;
};

export function PublicReportDraftSuccessStep({ session, onDone }: PublicReportDraftSuccessStepProps) {
  const draft = session.formDraft;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="h-6 w-6" />
          <CardTitle>Details saved</CardTitle>
        </div>
        <CardDescription>
          Thank you{draft?.reporter_name ? `, ${draft.reporter_name}` : ""}. Your complaint details
          are saved locally. Ticket submission is not enabled yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft && (
          <dl className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Location</dt>
              <dd className="font-medium">{session.complaintPointContext.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Mobile</dt>
              <dd>{formatMobileDisplay(session.mobileLast4)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Category</dt>
              <dd>{draft.category}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Issue</dt>
              <dd>{draft.issue_type}</dd>
            </div>
          </dl>
        )}
        <Button className="w-full" variant="outline" onClick={onDone}>
          Done
        </Button>
      </CardContent>
    </Card>
  );
}
