import GlassCard from "../ui/GlassCard";

interface ConfusionMatrixProps {
  labels: string[];
  matrix: Record<string, number[]>;
}

export default function ConfusionMatrix({ labels, matrix }: ConfusionMatrixProps) {
  const maxCell = Math.max(1, ...labels.flatMap((row) => matrix[row] ?? []));

  return (
    <GlassCard className="overflow-x-auto p-5" hoverable>
      <h3 className="mb-1 font-display text-base">Confusion Matrix</h3>
      <p className="mb-4 text-xs text-[var(--color-text-faint)]">
        Rows = ground-truth label, columns = predicted label. Diagonal cells are correct predictions.
      </p>
      <table className="w-full min-w-[420px] border-collapse text-center text-xs">
        <thead>
          <tr>
            <th className="p-2 text-left font-normal text-[var(--color-text-faint)]">true \ pred</th>
            {labels.map((l) => (
              <th key={l} className="p-2 font-medium capitalize text-[var(--color-text-muted)]">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((rowLabel) => (
            <tr key={rowLabel}>
              <th className="p-2 text-left font-medium capitalize text-[var(--color-text-muted)]">{rowLabel}</th>
              {labels.map((colLabel, colIdx) => {
                const value = matrix[rowLabel]?.[colIdx] ?? 0;
                const isDiagonal = rowLabel === colLabel;
                const intensity = value / maxCell;
                return (
                  <td key={colLabel} className="p-1">
                    <div
                      className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg font-mono"
                      style={{
                        background: isDiagonal
                          ? `color-mix(in srgb, var(--color-emerald) ${20 + intensity * 60}%, transparent)`
                          : value > 0
                            ? `color-mix(in srgb, #f26666 ${20 + intensity * 50}%, transparent)`
                            : "var(--color-border)",
                        color: value > 0 ? "var(--color-text)" : "var(--color-text-faint)",
                      }}
                    >
                      {value}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
