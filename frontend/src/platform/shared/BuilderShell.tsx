import { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  toolbar?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  status?: string;
};

/** Shared chrome for every Metadata builder — not used by LEGACY Sahaya. */
export function BuilderShell({ title, subtitle, toolbar, sidebar, children, status }: Props) {
  return (
    <div className="flex min-h-[70vh] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p> : null}
          {status ? (
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-emerald-700">{status}</p>
          ) : null}
        </div>
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>
      <div className={`grid gap-4 ${sidebar ? "lg:grid-cols-[220px_1fr]" : ""}`}>
        {sidebar ? <aside className="space-y-2">{sidebar}</aside> : null}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

export function BuilderButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const cls =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : variant === "danger"
        ? "bg-red-600 text-white hover:bg-red-500"
        : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

export function EmptyBuilderState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <p className="text-base font-medium text-slate-800">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{hint}</p>
    </div>
  );
}
