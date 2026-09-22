import GlassCard from "../ui/GlassCard";
import { RiskBadge } from "../ui/Badge";
import type { AverageMetrics, ClassMetric } from "../../types";

interface ClassMetricsTableProps {
  perClass: ClassMetric[];
  macroAvg: AverageMetrics;
  weightedAvg: AverageMetrics;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function ClassMetricsTable({ perClass, macroAvg, weightedAvg }: ClassMetricsTableProps) {
  return (
    <GlassCard className="overflow-x-auto p-5" hoverable>
      <h3 className="mb-4 font-display text-base">Per-Class Metrics</h3>
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-[var(--color-text-faint)]" style={{ borderColor: "var(--color-border)" }}>
            <th className="py-2 pr-3">Class</th>
            <th className="py-2 pr-3 text-right">Precision</th>
            <th className="py-2 pr-3 text-right">Recall</th>
            <th className="py-2 pr-3 text-right">F1</th>
            <th className="py-2 text-right">Support</th>
          </tr>
        </thead>
        <tbody>
          {perClass.map((c) => (
            <tr key={c.label} className="border-b" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2.5 pr-3">
                <RiskBadge level={c.label} />
              </td>
              <td className="py-2.5 pr-3 text-right font-mono">{pct(c.precision)}</td>
              <td className="py-2.5 pr-3 text-right font-mono">{pct(c.recall)}</td>
              <td className="py-2.5 pr-3 text-right font-mono">{pct(c.f1)}</td>
              <td className="py-2.5 text-right font-mono text-[var(--color-text-faint)]">{c.support}</td>
            </tr>
          ))}
          <tr className="border-b font-medium" style={{ borderColor: "var(--color-border)" }}>
            <td className="py-2.5 pr-3 text-[var(--color-text-muted)]">Macro avg</td>
            <td className="py-2.5 pr-3 text-right font-mono">{pct(macroAvg.precision)}</td>
            <td className="py-2.5 pr-3 text-right font-mono">{pct(macroAvg.recall)}</td>
            <td className="py-2.5 pr-3 text-right font-mono">{pct(macroAvg.f1)}</td>
            <td className="py-2.5" />
          </tr>
          <tr className="font-medium">
            <td className="py-2.5 pr-3 text-[var(--color-text-muted)]">Weighted avg</td>
            <td className="py-2.5 pr-3 text-right font-mono">{pct(weightedAvg.precision)}</td>
            <td className="py-2.5 pr-3 text-right font-mono">{pct(weightedAvg.recall)}</td>
            <td className="py-2.5 pr-3 text-right font-mono">{pct(weightedAvg.f1)}</td>
            <td className="py-2.5" />
          </tr>
        </tbody>
      </table>
    </GlassCard>
  );
}
