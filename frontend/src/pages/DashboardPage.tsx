import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, MessageSquare, UploadCloud, Activity, ArrowRight, Database, Gauge } from "lucide-react";
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
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={FileText} label="Documents" value={documents.length} delay={0} />
          <StatCard icon={Database} label="Chunks indexed" value={totalChunks} delay={0.05} />
          <StatCard icon={MessageSquare} label="Conversations" value={conversations.length} delay={0.1} />
          <StatCard
            icon={Gauge}
            label={latencySamples > 0 ? "Avg. response (session)" : "Avg. response"}
            value={avgLatency ?? 0}
            suffix={avgLatency ? "ms" : ""}
            delay={0.15}
          />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard className="p-6 lg:col-span-2" delay={0.1}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg">Recent documents</h2>
            <Link to="/library" className="text-sm hover:underline" style={{ color: "var(--color-accent)" }}>
              View all
            </Link>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="No documents yet"
              description="Upload a contract, NDA, or filing to start asking questions and generating AI insights."
              action={
                <Link to="/upload">
                  <Button size="sm">
                    Upload a document <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {documents.slice(0, 5).map((doc, i) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    to={`/library/${doc.id}`}
                    className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)]"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <span className="truncate">{doc.original_filename}</span>
                    <StatusBadge status={doc.status} />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-6" delay={0.15}>
          <h2 className="mb-4 font-display text-lg">Document status</h2>
          {documents.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No documents to chart yet.</p>
          ) : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusCounts} dataKey="value" nameKey="name" innerRadius={40} outerRadius={60} paddingAngle={3}>
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
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)]">
            {statusCounts.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5 capitalize">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[s.name] }} />
                {s.name} ({s.value})
              </span>
            ))}
          </div>

          <div className="mt-6 space-y-2 border-t pt-4 text-sm" style={{ borderColor: "var(--color-border)" }}>
            <Row label="Storage used" value={formatBytes(totalStorage)} />
            <Row label="LLM provider" value={health?.llm_provider ?? "—"} />
            <Row label="Embedding provider" value={health?.embedding_provider ?? "—"} />
          </div>
        </GlassCard>
      </div>

      <div className="mt-6">
        <GlassCard className="p-6" delay={0.2}>
          <h2 className="mb-4 font-display text-lg">Quick actions</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link to="/upload">
              <Button variant="secondary" className="w-full justify-start">
                <UploadCloud className="h-4 w-4" /> Upload a document
              </Button>
            </Link>
            <Link to="/chat">
              <Button variant="secondary" className="w-full justify-start">
                <MessageSquare className="h-4 w-4" /> Start a chat
              </Button>
            </Link>
            <Link to="/insights">
              <Button variant="secondary" className="w-full justify-start">
                <Activity className="h-4 w-4" /> System Status
              </Button>
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
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  suffix?: string;
  delay?: number;
}) {
  return (
    <GlassCard className="p-5" delay={delay}>
      <Icon className="mb-3 h-5 w-5" style={{ color: "var(--color-accent)" }} />
      <div className="font-display text-3xl">
        <AnimatedCounter value={value} suffix={suffix} />
      </div>
      <div className="mt-1 text-sm text-[var(--color-text-muted)]">{label}</div>
    </GlassCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
