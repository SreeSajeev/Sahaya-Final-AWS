import { useState } from "react";
import { DashboardFooter } from "@/pages/ClientDashboard";
import { PageHeader } from "@/components/common";
import { PageContainer } from "@/components/layout/PageContainer";
import { CreateTicketModal } from "@/components/tickets/CreateTicketModal";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle, Plus, Ticket } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Client Support: create tickets (same insertion as Service Manager). Ticket gets
 * opened_by_email = client email, client_slug = user.client_slug, status = OPEN.
 * No FE assignment, no SLA controls — only ticket creation form.
 */
export default function ClientSupport() {
  const { user, userProfile } = useAuth();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const email = user?.email ?? "";
  const clientSlug = userProfile?.client_slug ?? null;
  const organisationId = userProfile?.organisation_id ?? null;
  const canCreate = !!email && !!clientSlug;
  const clientContext = canCreate
    ? { openedByEmail: email, clientSlug }
    : null;
  const showUnlinkedWarning = !organisationId && !clientSlug;

  return (
    <>
      <PageContainer className="max-w-3xl">
        <PageHeader
          title="Support"
          description="Submit a support request and track it from your dashboard."
          icon={HelpCircle}
        />

        {showUnlinkedWarning && (
          <Alert variant="destructive">
            <AlertDescription>
              Your account is not linked to a client. Contact your administrator to submit support requests.
            </AlertDescription>
          </Alert>
        )}
        {!showUnlinkedWarning && !clientSlug && organisationId && (
          <Alert className="border-amber-200 bg-amber-50/80 text-amber-900">
            <AlertDescription>
              Support requests are available once your account is linked to a client. Please ask your administrator to link your account to a client so you can create and track requests.
            </AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              Create a support request
            </CardTitle>
            <CardDescription>
              Select a category and issue type, add optional details. Your request will be created with status Open and our team will assign a technician as needed. You can track progress on your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button
              onClick={() => setCreateModalOpen(true)}
              disabled={!canCreate}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Create support request
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
      <DashboardFooter />

      <CreateTicketModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        clientContext={clientContext}
      />
    </>
  );
}
