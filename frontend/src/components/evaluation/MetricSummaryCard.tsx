import type { LucideIcon } from "lucide-react";
import GlassCard from "../ui/GlassCard";

interface MetricSummaryCardProps {
  icon: LucideIcon;
  label: string;
  value: number; // 0..1
  delay?: number;
}

export default function MetricSummaryCard({ icon: Icon, label, value, delay = 0 }: MetricSummaryCardProps) {
  const pct = Math.round(value * 1000) / 10; // one decimal place

  return (
    <GlassCard className="flex flex-col gap-3 p-5" delay={delay} hoverable>
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "var(--color-accent-soft)" }}
        >
          <Icon className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
        </div>
        <span className="text-xs uppercase tracking-wide text-[var(--color-text-faint)]">{label}</span>
      </div>
      <div className="font-display text-3xl">{pct.toFixed(1)}%</div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-border)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: "var(--color-accent)" }}
        />
      </div>
    </GlassCard>
  );
}
