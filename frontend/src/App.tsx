/*
 * App.tsx - Main Application Router
 * 
 * Route Structure:
 * - /fe/ticket/:ticketId - FE ticket detail (requires FE auth; see RequireFE routes)
 * - /fe/action/:tokenId - Public FE action page (no auth required)
 * - /* - Protected routes requiring authentication
 *   - / - Dashboard (routes FE to their portal, Staff to dashboard)
 *   - /tickets, /review, etc. - Staff-only routes
 * 
 * Authentication is handled by AuthProvider wrapping protected routes.
 * Role-based routing is handled by Index.tsx based on user role.
 
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";

import Index from "./pages/Index";
import TicketsList from "./pages/TicketsList";
import TicketDetail from "./pages/TicketDetail";
import ReviewQueue from "./pages/ReviewQueue";
import RawEmails from "./pages/RawEmails";
import FieldExecutives from "./pages/FieldExecutives";
import SLAMonitor from "./pages/SLAMonitor";
import AuditLogs from "./pages/AuditLogs";
import Analytics from "./pages/Analytics";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import FEActionPage from "@/pages/FEActionPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <Routes>
          <Route
            path="/fe/action/:tokenId"
            element={<FEActionPage />}
          />

          <Route
            path="/*"
            element={
              <AuthProvider>
                <Routes>
                
                  <Route path="/" element={<Index />} />
                  
              
                  <Route path="/tickets" element={<TicketsList />} />
                  <Route path="/tickets/:ticketId" element={<TicketDetail />} />
                  <Route path="/review" element={<ReviewQueue />} />
                  <Route path="/emails" element={<RawEmails />} />
                  <Route path="/field-executives" element={<FieldExecutives />} />
                  <Route path="/sla" element={<SLAMonitor />} />
                  <Route path="/audit" element={<AuditLogs />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/settings" element={<Settings />} />
                  
                
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AuthProvider>
            }
          />
        </Routes>

      </TooltipProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
*/
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

import { AuthProvider } from "@/hooks/useAuth";
import {
  RequireStaff,
  RequireFE,
  RequireSuperAdmin,
  RequireClient,
  RequireAdmin,
} from "@/components/auth/AuthGuards";
import { PasswordResetDeepLinkRedirect } from "@/components/auth/PasswordResetDeepLinkRedirect";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

// Eager shell / auth / landing
import SahayaLanding from "@/pages/SahayaLanding";
import EnquiryPage from "@/pages/EnquiryPage";
import Index from "@/pages/Index";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import ChangePassword from "@/pages/ChangePassword";
import NotFound from "@/pages/NotFound";
import FEActionPage from "@/pages/FEActionPage";
import PublicReportPage from "@/pages/public/PublicReportPage";
import { isTenantClientsEnabled } from "@/lib/tenantClientsFeature";
import { isPublicComplaintsEnabled } from "@/lib/publicComplaintsFeature";

// Lazy-loaded heavy pages
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ClientDashboard = lazy(() => import("@/pages/ClientDashboard"));
const ClientReports = lazy(() => import("@/pages/ClientReports"));
const ClientSupport = lazy(() => import("@/pages/ClientSupport"));
const ClientTicketDetail = lazy(() => import("@/pages/ClientTicketDetail"));
const SuperAdminDashboard = lazy(() => import("@/pages/SuperAdminDashboard"));
const SuperAdminOrgView = lazy(() => import("@/pages/SuperAdminOrgView"));
const PlatformOverview = lazy(() => import("@/pages/PlatformOverview"));
const Organisations = lazy(() => import("@/pages/Organisations"));
const TenantView = lazy(() => import("@/pages/TenantView"));
const ServiceManagers = lazy(() => import("@/pages/ServiceManagers"));
const TicketsList = lazy(() => import("@/pages/TicketsList"));
const ReviewQueue = lazy(() => import("@/pages/ReviewQueue"));
const RawEmails = lazy(() => import("@/pages/RawEmails"));
const FieldExecutives = lazy(() => import("@/pages/FieldExecutives"));
const SLAMonitor = lazy(() => import("@/pages/SLAMonitor"));
const Settings = lazy(() => import("@/pages/Settings"));
const TicketSettings = lazy(() => import("@/pages/TicketSettings"));
const TenantAdminDashboard = lazy(() => import("@/pages/TenantAdminDashboard"));
const Users = lazy(() => import("@/pages/Users"));
const Clients = lazy(() => import("@/pages/Clients"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const ComplaintPoints = lazy(() => import("@/pages/ComplaintPoints"));
const ResolutionLocations = lazy(() => import("@/pages/ResolutionLocations"));
const TicketDetail = lazy(() => import("@/pages/TicketDetail"));
const AuditLogs = lazy(() => import("@/pages/AuditLogs"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const FEMyTickets = lazy(() => import("@/pages/FEMyTickets"));
const FETicketView = lazy(() => import("@/pages/FETicketView"));
const SMMyTickets = lazy(() => import("@/pages/SMMyTickets"));
const SMTicketView = lazy(() => import("@/pages/SMTicketView"));

// Metadata Platform Layer (isolated — does not replace legacy pages)
const MetadataPlatformLayout = lazy(() => import("@/platform/components/MetadataPlatformLayout"));
const MetadataOverviewPage = lazy(() => import("@/platform/pages/MetadataOverviewPage"));
const MetadataFormsPage = lazy(() => import("@/platform/pages/MetadataFormsPage"));
const MetadataRuntimePage = lazy(() => import("@/platform/pages/MetadataRuntimePage"));
const MetadataSettingsPage = lazy(() =>
  import("@/platform/pages/MetadataRuntimePage").then((m) => ({ default: m.MetadataSettingsPage }))
);
const EmailParserBuilderPage = lazy(() => import("@/platform/builders/EmailParserBuilderPage"));
const WorkflowBuilderPage = lazy(() => import("@/platform/builders/WorkflowBuilderPage"));
const MetadataTicketCreatePage = lazy(() => import("@/platform/runtime/MetadataTicketCreatePage"));
const AssignmentBuilderPage = lazy(() =>
  import("@/platform/builders/EnterpriseBuilders").then((m) => ({ default: m.AssignmentBuilderPage }))
);
const NotificationBuilderPage = lazy(() =>
  import("@/platform/builders/EnterpriseBuilders").then((m) => ({ default: m.NotificationBuilderPage }))
);
const AutomationBuilderPage = lazy(() =>
  import("@/platform/builders/EnterpriseBuilders").then((m) => ({ default: m.AutomationBuilderPage }))
);
const DashboardBuilderPage = lazy(() =>
  import("@/platform/builders/EnterpriseBuilders").then((m) => ({ default: m.DashboardBuilderPage }))
);
const ReportBuilderPage = lazy(() =>
  import("@/platform/builders/EnterpriseBuilders").then((m) => ({ default: m.ReportBuilderPage }))
);
const AiBuilderPage = lazy(() =>
  import("@/platform/builders/EnterpriseBuilders").then((m) => ({ default: m.AiBuilderPage }))
);
const PluginBuilderPage = lazy(() =>
  import("@/platform/builders/EnterpriseBuilders").then((m) => ({ default: m.PluginBuilderPage }))
);

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <PasswordResetDeepLinkRedirect />
          <TooltipProvider>
            <Toaster />
            <Sonner />

            <AuthProvider>
              <Suspense fallback={<PageLoader />}>
              <Routes>
              {/* ========================= */}
              {/* 🌐 PUBLIC — LANDING */}
              {/* ========================= */}
              <Route path="/" element={<SahayaLanding />} />

              {/* Login + role-based redirect */}
              <Route path="/login" element={<Index />} />

              {/* Password management (public except change = logged-in) */}
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/change-password" element={<ChangePassword />} />

              {/* Public enquiry / request demo */}
              <Route path="/enquiry" element={<EnquiryPage />} />

              {/* Token-based FE action (NO LOGIN REQUIRED) */}
              <Route
                path="/fe/action/:tokenId"
                element={<FEActionPage />}
              />

              {/* Public QR complaint intake (NO LOGIN REQUIRED) */}
              {isPublicComplaintsEnabled() && (
                <Route path="/public/report/:publicToken" element={<PublicReportPage />} />
              )}

              {/* ========================= */}
              {/* 🚚 FIELD EXECUTIVE */}
              {/* ========================= */}
              <Route element={<RequireFE />}>
                <Route path="/fe" element={<FEMyTickets />} />
                <Route
                  path="/fe/ticket/:ticketId"
                  element={<FETicketView />}
                />
              </Route>

              {/* ========================= */}
              {/* 👑 SUPER ADMIN (SaaS layer) */}
              {/* ========================= */}
              <Route element={<RequireSuperAdmin />}>
                <Route path="/super-admin" element={<SuperAdminDashboard />} />
                <Route path="/app/super-admin" element={<SuperAdminDashboard />} />
                <Route path="/super-admin/org/:clientSlug" element={<SuperAdminOrgView />} />
                <Route path="/app/platform" element={<PlatformOverview />} />
                <Route path="/app/organisations" element={<Organisations />} />
                <Route path="/app/tenant/:orgId" element={<TenantView />} />
              </Route>

              {/* ========================= */}
              {/* 🧩 METADATA PLATFORM (opt-in; isolated from LEGACY Sahaya) */}
              {/* ========================= */}
              <Route element={<RequireAdmin />}>
                <Route path="/app/metadata" element={<MetadataPlatformLayout />}>
                  <Route index element={<MetadataOverviewPage />} />
                  <Route path="forms" element={<MetadataFormsPage />} />
                  <Route path="email-parser" element={<EmailParserBuilderPage />} />
                  <Route path="workflows" element={<WorkflowBuilderPage />} />
                  <Route path="assignments" element={<AssignmentBuilderPage />} />
                  <Route path="notifications" element={<NotificationBuilderPage />} />
                  <Route path="automations" element={<AutomationBuilderPage />} />
                  <Route path="dashboards" element={<DashboardBuilderPage />} />
                  <Route path="reports" element={<ReportBuilderPage />} />
                  <Route path="ai" element={<AiBuilderPage />} />
                  <Route path="plugins" element={<PluginBuilderPage />} />
                  <Route path="runtime" element={<MetadataRuntimePage />} />
                  <Route path="runtime/create" element={<MetadataTicketCreatePage />} />
                  <Route path="settings" element={<MetadataSettingsPage />} />
                </Route>
              </Route>

              {/* ========================= */}
              {/* 📋 CLIENT — top nav only, no operations sidebar */}
              {/* ========================= */}
              <Route
                path="/app/client"
                element={
                  <RequireClient>
                    <ClientLayout />
                  </RequireClient>
                }
              >
                <Route index element={<ClientDashboard />} />
                <Route path="reports" element={<ClientReports />} />
                <Route path="support" element={<ClientSupport />} />
                <Route
                  path="tickets/:ticketId"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <ClientTicketDetail />
                    </Suspense>
                  }
                />
              </Route>

              {/* ========================= */}
              {/* 🧑‍💼 STAFF / ADMIN */}
              {/* ========================= */}
              <Route element={<RequireStaff />}>
                <Route path="/sm" element={<SMMyTickets />} />
                <Route path="/sm/ticket/:ticketId" element={<SMTicketView />} />
                <Route path="/app" element={<Dashboard />} />
                <Route path="/app/tenant-admin" element={<TenantAdminDashboard />} />
                <Route path="/app/tickets" element={<TicketsList />} />
                <Route path="/app/tickets/:ticketId" element={<TicketDetail />} />
                <Route path="/app/review" element={<ReviewQueue />} />
                <Route path="/app/emails" element={<RawEmails />} />
                <Route
                  path="/app/field-executives"
                  element={<FieldExecutives />}
                />
                <Route path="/app/service-managers" element={<ServiceManagers />} />
                <Route path="/app/sla" element={<SLAMonitor />} />
                <Route
                  path="/app/audit"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <AuditLogs />
                    </Suspense>
                  }
                />
                <Route
                  path="/app/analytics"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <Analytics />
                    </Suspense>
                  }
                />
                <Route
                  path="/app/users"
                  element={<Users />}
                />
                <Route path="/app/settings" element={<Settings />} />
                <Route path="/app/ticket-settings" element={<TicketSettings />} />
                <Route path="/app/resolution-locations" element={<ResolutionLocations />} />
              </Route>

              {isTenantClientsEnabled() && (
                <Route element={<RequireAdmin />}>
                  <Route path="/app/clients" element={<Clients />} />
                  <Route path="/app/clients/:clientId" element={<ClientDetail />} />
                </Route>
              )}

              {isPublicComplaintsEnabled() && (
                <Route element={<RequireAdmin />}>
                  <Route path="/app/complaint-points" element={<ComplaintPoints />} />
                </Route>
              )}

              {/* ========================= */}
              {/* ❌ 404 */}
              {/* ========================= */}
              <Route path="*" element={<NotFound />} />
            </Routes>
              </Suspense>
            </AuthProvider>
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
