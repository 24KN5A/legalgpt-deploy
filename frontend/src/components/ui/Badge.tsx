import clsx from "clsx";
import type { RiskLevel } from "../../types";

const RISK_STYLES: Record<RiskLevel, string> = {
  low: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  medium: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  high: "bg-orange-400/10 text-orange-300 border-orange-400/30",
  critical: "bg-red-400/10 text-red-300 border-red-400/30",
};

export function RiskBadge({ level }: { level: RiskLevel | string }) {
  const key = (RISK_STYLES[level as RiskLevel] && level) as RiskLevel | undefined;
  const style = key ? RISK_STYLES[key] : "border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-border)]";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-mono uppercase tracking-wide",
        style
      )}
    >
      {level}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  uploaded: "border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-border)]",
  processing: "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] border-[var(--color-accent)]/30",
  ready: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  failed: "bg-red-400/10 text-red-300 border-red-400/30",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status] ?? STATUS_STYLES.uploaded
      )}
    >
      {status === "processing" && (
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {status}
    </span>
  );
}
