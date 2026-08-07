/**
 * Service Manager Assigned Tickets portal — mirrors FE My Tickets without tokens/onsite.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { fetchJson } from "@/lib/backendDataApi";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, Ticket } from "lucide-react";
import { formatIST } from "@/lib/dateUtils";

type SmTicket = {
  id: string;
  ticket_number: string;
  status: string;
  client_slug?: string | null;
  location?: string | null;
  issue_type?: string | null;
  vehicle_number?: string | null;
  assigned_at?: string | null;
  assignment_type?: string | null;
};

export default function SMMyTickets() {
  const { user, userProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["sm-my-tickets"],
    queryFn: () => fetchJson<{ items: SmTicket[] }>("/sm/me/tickets"),
  });

  const items = useMemo(() => {
    const rows = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) =>
      [t.ticket_number, t.client_slug, t.location, t.issue_type, t.vehicle_number, t.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data?.items, search]);

  return (
    <AppLayoutNew>
      <main className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">My Assigned Tickets</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Service Manager internal resolution — upload proof and submit for verification.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{userProfile?.name || user?.email}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Sign out
            </Button>
          </div>
        </div>

        <Input
          placeholder="Search ticket number, client, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading assigned tickets…
          </div>
        ) : error ? (
          <p className="text-destructive">{error instanceof Error ? error.message : "Failed to load"}</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No tickets currently assigned to you.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {items.map((t) => (
              <Link key={t.id} to={`/sm/ticket/${t.id}`} className="block">
                <Card className="hover:border-primary/40 transition-colors">
                  <CardHeader className="py-3 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base font-mono flex items-center gap-2">
                      <Ticket className="h-4 w-4" />
                      {t.ticket_number}
                    </CardTitle>
                    <Badge variant="outline">{t.status}</Badge>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground pb-3 grid gap-1 sm:grid-cols-3">
                    <span>{t.client_slug || "—"}</span>
                    <span>{t.location || "—"}</span>
                    <span>
                      Assigned {t.assigned_at ? formatIST(t.assigned_at, "PPp") : "—"}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppLayoutNew>
  );
}
