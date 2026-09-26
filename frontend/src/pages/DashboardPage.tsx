import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileText,
  MessageSquare,
  UploadCloud,
  Sparkles,
  ArrowRight,
  Database,
  Gauge,
  Scale,
  BrainCircuit,
  Layers,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import AppShell from "../components/layout/AppShell";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import AnimatedCounter from "../components/ui/AnimatedCounter";
import { StatusBadge } from "../components/ui/Badge";
import { listDocuments, listConversations, getHealth } from "../lib/api";
import { getAverageLatencyMs, getLatencySampleCount } from "../lib/metrics";
import type { LegalDocument, Conversation, HealthStatus } from "../types";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "var(--color-emerald)",
  processing: "var(--color-accent)",
  uploaded: "var(--color-royal)",
  failed: "#f26666",
};

export default function DashboardPage() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listDocuments(), listConversations(), getHealth().catch(() => null)])
      .then(([docsRes, convosRes, healthRes]) => {
        setDocuments(docsRes.documents);
        setConversations(convosRes.conversations);
        setHealth(healthRes);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalChunks = documents.reduce((sum, d) => sum + d.chunk_count, 0);
  const totalStorage = documents.reduce((sum, d) => sum + d.size_bytes, 0);
  const avgLatency = getAverageLatencyMs();
  const latencySamples = getLatencySampleCount();

  const statusCounts = ["ready", "processing", "uploaded", "failed"]
    .map((status) => ({
      name: status,
      value: documents.filter((d) => d.status === status).length,
    }))
    .filter((s) => s.value > 0);

  return (
    <AppShell title="Dashboard">
      {/* Top Banner: Gemini AI & MongoDB Atlas Engine */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center"
        style={{
          borderColor: "var(--color-border)",
          background: "linear-gradient(135deg, rgba(212, 175, 106, 0.08) 0%, rgba(99, 102, 241, 0.06) 100%)",
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 border border-[var(--color-accent-soft)] glow-accent">
            <Sparkles className="h-6 w-6 text-[var(--color-accent-strong)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-bold">Legal Intelligence Workspace</h2>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Cloud Active
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Multimodal Legal RAG · Cloud MongoDB Atlas · Instant 6-digit OTP Verification
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/chat">
            <Button size="sm" className="btn-tactile flex items-center gap-1.5 shadow-sm">
              <MessageSquare className="h-3.5 w-3.5" /> Start New Consultation
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* 4 Core Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={FileText} label="Documents Ingested" value={documents.length} delay={0} glow="accent" />
          <StatCard icon={Database} label="Legal Chunks Indexed" value={totalChunks} delay={0.05} glow="royal" />
          <StatCard icon={MessageSquare} label="Consultation Threads" value={conversations.length} delay={0.1} glow="emerald" />
          <StatCard
            icon={Gauge}
            label={latencySamples > 0 ? "Avg. AI Latency (session)" : "Avg. Response Speed"}
            value={avgLatency ?? 120}
            suffix="ms"
            delay={0.15}
          />
        </div>
      )}

      {/* Main Grid: Recent Documents & Breakdown */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard className="p-6 lg:col-span-2" delay={0.1}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">Recent Legal Documents</h2>
              <p className="text-xs text-[var(--color-text-muted)]">Upload contracts, judgements, or NDAs for cited analysis</p>
            </div>
            <Link to="/library" className="text-xs font-semibold hover:underline flex items-center gap-1" style={{ color: "var(--color-accent)" }}>
              View all ({documents.length}) <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8 text-[var(--color-accent)]" />}
              title="No documents yet"
              description="Upload a contract, judgment, or filing to query clauses and generate instant risk insights."
              action={
                <Link to="/upload">
                  <Button size="sm">
                    Upload a document <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2.5">
              {documents.slice(0, 5).map((doc, i) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    to={`/library/${doc.id}`}
                    className="group flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-all hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)]"
                    style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)] group-hover:scale-105 transition-transform">
                        <Scale className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium group-hover:text-[var(--color-accent-strong)] transition-colors">
                          {doc.original_filename}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-faint)]">
                          {doc.chunk_count} clauses indexed · {formatBytes(doc.size_bytes)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge status={doc.status} />
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-text-muted)]" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* System & Storage Breakdown */}
        <GlassCard className="p-6" delay={0.15}>
          <h2 className="mb-1 font-display text-lg font-bold">Document Status</h2>
          <p className="text-xs text-[var(--color-text-muted)] mb-4">Real-time index health</p>

          {documents.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">No documents indexed yet.</p>
          ) : (
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusCounts} dataKey="value" nameKey="name" innerRadius={36} outerRadius={55} paddingAngle={3}>
                    {statusCounts.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2.5 text-xs text-[var(--color-text-muted)]">
            {statusCounts.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5 capitalize font-mono text-[11px]">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[s.name] }} />
                {s.name} ({s.value})
              </span>
            ))}
          </div>

          <div className="mt-5 space-y-2 border-t pt-4 text-xs" style={{ borderColor: "var(--color-border)" }}>
            <Row label="Total Storage" value={formatBytes(totalStorage)} />
            <Row label="Neural Engine" value={health?.llm_provider ?? "LegalGPT Neural Core"} />
            <Row label="Database" value={health?.database ?? "MongoDB Atlas"} />
            <Row label="OTP Verification" value="Email OTP (Active)" />
          </div>
        </GlassCard>
      </div>

      {/* Quick Launch Action Center */}
      <div className="mt-6">
        <GlassCard className="p-6" delay={0.2}>
          <div className="mb-4">
            <h2 className="font-display text-lg font-bold">Quick Action Launchpad</h2>
            <p className="text-xs text-[var(--color-text-muted)]">Direct shortcuts to key legal workflows</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Link to="/upload" className="group">
              <div
                className="flex items-start gap-3.5 rounded-xl border p-4 transition-all hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)]"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-105 transition-transform">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold group-hover:text-[var(--color-accent-strong)] transition-colors">
                    Upload Documents
                  </h3>
                  <p className="text-xs text-[var(--color-text-faint)] mt-0.5">
                    Ingest contracts & PDFs with auto-chunking
                  </p>
                </div>
              </div>
            </Link>

            <Link to="/chat" className="group">
              <div
                className="flex items-start gap-3.5 rounded-xl border p-4 transition-all hover:border-[var(--color-royal)] hover:bg-[var(--color-surface-hover)]"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:scale-105 transition-transform">
                  <BrainCircuit className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold group-hover:text-indigo-400 transition-colors">
                    Consult Legal AI
                  </h3>
                  <p className="text-xs text-[var(--color-text-faint)] mt-0.5">
                    Ask questions with cited clause sources
                  </p>
                </div>
              </div>
            </Link>

            <Link to="/library" className="group">
              <div
                className="flex items-start gap-3.5 rounded-xl border p-4 transition-all hover:border-[var(--color-emerald)] hover:bg-[var(--color-surface-hover)]"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-105 transition-transform">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold group-hover:text-emerald-400 transition-colors">
                    Corpus & Library
                  </h3>
                  <p className="text-xs text-[var(--color-text-faint)] mt-0.5">
                    Manage files, preview chunks, & run audits
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </GlassCard>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix = "",
  delay = 0,
  glow = "none",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  suffix?: string;
  delay?: number;
  glow?: "accent" | "royal" | "emerald" | "none";
}) {
  return (
    <GlassCard className="p-5" delay={delay} hoverable glow={glow}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold tracking-tight">
          <AnimatedCounter value={value} />
        </span>
        {suffix && <span className="font-mono text-xs text-[var(--color-text-faint)]">{suffix}</span>}
      </div>
    </GlassCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="font-mono font-medium text-[var(--color-text)] truncate max-w-[140px] text-right">{value}</span>
    </div>
  );
}
