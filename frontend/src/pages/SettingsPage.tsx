import { useEffect, useState } from "react";
import { Cpu, Database, HardDrive, Info, Palette, Sparkles } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import GlassCard from "../components/ui/GlassCard";
import ThemeToggle from "../components/ui/ThemeToggle";
import ErrorState from "../components/ui/ErrorState";
import { getHealth, listDocuments } from "../lib/api";
import { useTheme } from "../lib/theme-context";
import type { HealthStatus } from "../types";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState(false);
  const [storageUsed, setStorageUsed] = useState<number | null>(null);
  const [docCount, setDocCount] = useState<number | null>(null);
  const { theme } = useTheme();

  const load = () => {
    getHealth()
      .then((h) => {
        setHealth(h);
        setError(false);
      })
      .catch(() => setError(true));
    listDocuments()
      .then((res) => {
        setStorageUsed(res.documents.reduce((sum, d) => sum + d.size_bytes, 0));
        setDocCount(res.documents.length);
      })
      .catch(() => {
        setStorageUsed(null);
        setDocCount(null);
      });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-2xl space-y-6">
        <GlassCard className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Palette className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
            <h2 className="font-display text-lg">Appearance</h2>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: "var(--color-border)" }}>
            <div>
              <p className="text-sm">Theme</p>
              <p className="text-xs text-[var(--color-text-faint)]">Currently using {theme} mode.</p>
            </div>
            <ThemeToggle />
          </div>
        </GlassCard>

        <GlassCard className="p-6" delay={0.05}>
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
            <h2 className="font-display text-lg">System status</h2>
          </div>
          {error && <ErrorState message="Could not reach the LegalGPT API. Make sure the backend is running." onRetry={load} />}
          {!error && !health && <p className="text-sm text-[var(--color-text-muted)]">Checking status...</p>}
          {health && (
            <div className="space-y-4">
              <Row
                icon={Sparkles}
                label="LLM provider"
                value={health.llm_provider}
                hint={
                  health.llm_provider === "ollama"
                    ? "Local, free — requires Ollama running with a pulled model."
                    : "Requires an API key set in the backend .env file."
                }
              />
              <Row
                icon={Cpu}
                label="Embedding provider"
                value={health.embedding_provider}
                hint={
                  health.embedding_provider === "local"
                    ? "Local sentence-transformers model, no API key required."
                    : "Requires OPENAI_API_KEY in the backend .env file."
                }
              />
              <Row icon={Database} label="Vector store" value={health.vector_store_ready ? "Connected" : "Unavailable"} />
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-6" delay={0.1}>
          <div className="mb-4 flex items-center gap-2">
            <HardDrive className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
            <h2 className="font-display text-lg">Storage</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-display text-2xl">{docCount ?? "—"}</div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Documents stored</p>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)" }}>
              <div className="font-display text-2xl">{storageUsed !== null ? formatBytes(storageUsed) : "—"}</div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Total size</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6" delay={0.15}>
          <div className="mb-3 flex items-center gap-2">
            <Info className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
            <h2 className="font-display text-lg">Changing providers</h2>
          </div>
          <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
            LegalGPT's LLM and embedding providers, temperature, and token limits are configured
            via environment variables in the backend's{" "}
            <code className="font-mono" style={{ color: "var(--color-accent-strong)" }}>.env</code>{" "}
            file (see <code className="font-mono" style={{ color: "var(--color-accent-strong)" }}>.env.example</code>).
            Set <code className="font-mono" style={{ color: "var(--color-accent-strong)" }}>LLM_PROVIDER</code> to{" "}
            <code className="font-mono">ollama</code>, <code className="font-mono">openai</code>, or{" "}
            <code className="font-mono">anthropic</code>, then restart the backend. This page reflects
            live values only — it can't change them, since the API doesn't currently expose a
            settings-write endpoint.
          </p>
        </GlassCard>

        <GlassCard className="p-6" delay={0.2}>
          <h2 className="mb-2 font-display text-lg">About</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            LegalGPT {health?.version ?? ""} — a retrieval-grounded legal document assistant. Not a
            law firm; not a substitute for legal advice.
          </p>
        </GlassCard>
      </div>
    </AppShell>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border p-4" style={{ borderColor: "var(--color-border)" }}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
          <span className="rounded-full px-2 py-0.5 font-mono text-xs" style={{ background: "var(--color-border)" }}>
            {value}
          </span>
        </div>
        {hint && <p className="mt-1 text-xs text-[var(--color-text-faint)]">{hint}</p>}
      </div>
    </div>
  );
}
