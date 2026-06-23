import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicComplaintPointContext } from "@/lib/publicComplaintApi";
import { buildDefaultLocation } from "@/lib/publicReportSession";

type PublicReportLandingStepProps = {
  context: PublicComplaintPointContext;
  onContinue: () => void;
};

export function PublicReportLandingStep({ context, onContinue }: PublicReportLandingStepProps) {
  const locationLine = buildDefaultLocation(context);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <CardTitle>{context.name}</CardTitle>
            {locationLine && (
              <CardDescription className="mt-1">{locationLine}</CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {context.description && (
          <p className="text-sm text-muted-foreground">{context.description}</p>
        )}
        <p className="text-sm text-slate-600">
          You can report a maintenance or service issue at this location. We will verify your
          mobile number before you submit details.
        </p>
        <Button className="w-full" size="lg" onClick={onContinue}>
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
