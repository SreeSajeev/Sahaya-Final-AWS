import { Loader2 } from "lucide-react";

/**
 * Intentional Sahaya boot / auth-hydration screen.
 * Used while session state is UNKNOWN — never an unexplained white flash.
 */
export function SahayaBootLoading({ label = "Loading Sahaya…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center gap-4 px-6"
      style={{
        background: "linear-gradient(160deg, hsl(285 45% 14%) 0%, hsl(285 40% 22%) 55%, hsl(32 70% 28%) 140%)",
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <img
        src="/sahaya-logo.png"
        alt=""
        className="h-12 w-auto object-contain"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div className="text-center">
        <p className="text-lg font-extrabold tracking-wide text-white">Sahaya</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
          By Pariskq
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm text-white/80">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>{label}</span>
      </div>
    </div>
  );
}
