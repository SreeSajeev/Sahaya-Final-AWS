import { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Branded page shell: purple-tinted gradient, grid, soft depth (matches staff Dashboard). */
export function ClientPortalBackground({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative min-h-full", className)}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, hsl(285 30% 96%) 0%, hsl(285 20% 97%) 35%, hsl(30 5% 98%) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 hidden md:block"
        style={{
          backgroundImage:
            "linear-gradient(hsl(285 45% 55% / 0.03) 1px, transparent 1px), linear-gradient(90deg, hsl(285 45% 55% / 0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        className="pointer-events-none absolute hidden md:block"
        style={{
          top: "-15%",
          right: "5%",
          width: 420,
          height: 320,
          background: "radial-gradient(ellipse, hsl(32 95% 52% / 0.07) 0%, transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute hidden md:block"
        style={{
          bottom: "10%",
          left: "-5%",
          width: 360,
          height: 280,
          background: "radial-gradient(ellipse, hsl(285 45% 55% / 0.05) 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export const clientElevatedCardStyle: CSSProperties = {
  background: "linear-gradient(135deg, hsl(0 0% 100% / 0.98), hsl(285 15% 99%))",
  border: "1px solid hsl(270 15% 88% / 0.75)",
  boxShadow:
    "0 1px 4px hsl(285 25% 10% / 0.05), 0 8px 24px hsl(285 25% 10% / 0.06), inset 0 1px 0 hsl(0 0% 100% / 0.85)",
};

export const clientPortalHeaderClass =
  "fixed top-0 left-0 right-0 z-50 bg-sidebar border-b border-sidebar-border shadow-[0_2px_12px_hsl(285_45%_10%/0.25)]";

export const clientSectionTitleClass = "text-lg font-semibold text-foreground tracking-tight";
