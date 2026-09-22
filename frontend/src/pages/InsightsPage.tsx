/**
 * Improvement #6 — Replace static Model Evaluation page with a live
 * RAG Health & System Status page.
 *
 * Shows:
 *  - Backend health (LLM provider, embedding model, vector store)
 *  - RAG configuration (threshold, chunk size, top-k)
 *  - Session statistics (conversations, documents, avg latency)
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity, Database, Cpu, Layers, CheckCircle2, XCircle,
  MessageSquare, FileText, Gauge, RefreshCw, ShieldCheck,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import { getHealth, listDocuments, listConversations, ApiError } from "../lib/api";
import { getAverageLatencyMs, getLatencySampleCount } from "../lib/metrics";
import type { HealthStatus } from "../types";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: ok ? "var(--color-emerald)" : "var(--color-risk-critical)" }}
    />
  );
}

function InfoRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <span className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export default function InsightsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [convoCount, setConvoCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      getHealth(),
      listDocuments(),
      listConversations(),
    ])
      .then(([h, docs, convos]) => {
        setHealth(h);
        setDocCount(docs.total);
        setConvoCount(convos.conversations.length);
      })
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : "Could not reach the backend.";
        setError(message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const avgLatency = getAverageLatencyMs();
  const latencySamples = getLatencySampleCount();

  const cards = [
    {
      icon: CheckCircle2,
      label: "API Status",
      value: health ? "Online" : "Offline",
      ok: !!health,
      color: health ? "var(--color-emerald)" : "var(--color-risk-critical)",
    },
    {
      icon: Cpu,
      label: "LLM Provider",
      value: health?.llm_provider ?? "—",
      ok: !!health?.llm_provider,
      color: "var(--color-royal)",
    },
    {
      icon: Layers,
      label: "Embedding",
      value: health?.embedding_provider ?? "—",
      ok: !!health?.embedding_provider,
      color: "var(--color-purple)",
    },
    {
      icon: Database,
      label: "Vector Store",
      value: health?.vector_store_ready ? "Ready" : "Not ready",
      ok: !!health?.vector_store_ready,
      color: health?.vector_store_ready ? "var(--color-emerald)" : "var(--color-risk-high)",
    },
  ];

  return (
    <AppShell title="System Status">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--color-text-muted)]">
          Live health and configuration of your LegalGPT instance — LLM provider, vector
          store, RAG settings, and session statistics.
        </p>
        <Button variant="secondary" size="sm" onClick={load} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && (
        <div
          className="mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "var(--color-risk-high)", color: "var(--color-risk-high)", background: "rgba(242,102,102,0.07)" }}
        >
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Service health cards */}
      {loading && !health ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {cards.map(({ icon: Icon, label, value, ok, color }, i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <GlassCard className="p-5" hoverable>
                <div className="mb-3 flex items-center justify-between">
                  <Icon className="h-5 w-5" style={{ color }} />
                  <StatusDot ok={ok} />
                </div>
                <div className="font-mono text-lg font-semibold" style={{ color }}>
                  {value}
                </div>
                <div className="mt-1 text-xs text-[var(--color-text-muted)]">{label}</div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* RAG Configuration */}
        <GlassCard className="p-6" delay={0.1}>
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
            <h2 className="font-display text-lg">RAG Configuration</h2>
          </div>
          <InfoRow label="Similarity Threshold" value="0.70 (hallucination control)" />
          <InfoRow label="Top-K Retrieval" value="5 chunks per query" />
          <InfoRow label="Chunk Size" value="1000 characters" />
          <InfoRow label="Chunk Overlap" value="150 characters" />
          <InfoRow label="Embedding Model" value={health?.embedding_provider === "openai" ? "text-embedding-3-small" : "all-MiniLM-L6-v2"} />
          <InfoRow label="Document Ownership" value="Enforced (403 on cross-user)" />
          <InfoRow label="Inline Citations" value="Enabled in answers" />
        </GlassCard>

        {/* Session statistics */}
        <GlassCard className="p-6" delay={0.15}>
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" style={{ color: "var(--color-royal)" }} />
            <h2 className="font-display text-lg">Session Statistics</h2>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { icon: FileText, label: "Documents", value: docCount ?? 0, color: "var(--color-accent)" },
                  { icon: MessageSquare, label: "Conversations", value: convoCount ?? 0, color: "var(--color-royal)" },
                  { icon: Gauge, label: `Avg Latency${latencySamples > 0 ? ` (${latencySamples} samples)` : ""}`, value: avgLatency ? `${avgLatency}ms` : "N/A", color: "var(--color-purple)" },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="rounded-xl border p-3 text-center" style={{ borderColor: "var(--color-border)" }}>
                    <Icon className="mx-auto mb-1 h-4 w-4" style={{ color }} />
                    <div className="font-mono text-base font-semibold">{value}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--color-text-faint)]">{label}</div>
                  </div>
                ))}
              </div>
              <InfoRow label="Ollama Base URL" value="http://localhost:11434" />
              <InfoRow label="LLM Provider" value={health?.llm_provider ?? "—"} />
              <InfoRow label="Version" value={health?.version ?? "—"} />
            </>
          )}
        </GlassCard>
      </div>

      {/* Footer note */}
      <GlassCard className="mt-6 p-4 text-xs text-[var(--color-text-faint)]" hoverable>
        <span className="font-medium text-[var(--color-text-muted)]">Note: </span>
        The rule-based risk classifier benchmark (precision, recall, F1 by class) is still
        available via the REST API at{" "}
        <code
          className="rounded px-1 py-0.5 font-mono"
          style={{ background: "var(--color-surface)" }}
        >
          GET /evaluation/risk-classifier
        </code>{" "}
        for programmatic access without requiring an active LLM session.
      </GlassCard>
    </AppShell>
  );
}
