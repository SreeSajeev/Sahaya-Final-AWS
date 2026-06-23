import { ReactNode } from "react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "location", label: "Location" },
  { id: "verify", label: "Verify" },
  { id: "details", label: "Details" },
  { id: "done", label: "Done" },
] as const;

export type PublicReportStepId = (typeof STEPS)[number]["id"];

type PublicReportLayoutProps = {
  children: ReactNode;
  activeStep: PublicReportStepId;
  title?: string;
  subtitle?: string;
};

export function PublicReportLayout({
  children,
  activeStep,
  title,
  subtitle,
}: PublicReportLayoutProps) {
  const activeIndex = STEPS.findIndex((s) => s.id === activeStep);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/90">
      <header className="border-b bg-white/80 px-4 py-3 backdrop-blur">
        <p className="text-center text-sm font-medium text-slate-600">Sahaya — Report an issue</p>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 py-6 pb-10">
        <nav aria-label="Progress" className="mb-8">
          <ol className="flex items-center justify-between gap-1">
            {STEPS.map((step, i) => (
              <li key={step.id} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                    i <= activeIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-slate-200 text-slate-500"
                  )}
                >
                  {i + 1}
                </span>
                <span className="hidden text-[10px] text-muted-foreground sm:block">
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </nav>

        {(title || subtitle) && (
          <div className="mb-6 text-center">
            {title && <h1 className="text-xl font-semibold tracking-tight">{title}</h1>}
            {subtitle && (
              <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
