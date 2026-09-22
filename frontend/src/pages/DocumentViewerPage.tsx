import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, BarChart3, MessageSquare, Trash2 } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import { StatusBadge } from "../components/ui/Badge";
import { useToast } from "../components/ui/toast-context";
import { getDocument, deleteDocument, listConversations } from "../lib/api";
import type { LegalDocument, Conversation } from "../types";

export default function DocumentViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<LegalDocument | null>(null);
  const [relatedChats, setRelatedChats] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const fetchDoc = () => {
      getDocument(id)
        .then((data) => {
          if (cancelled) return;
          setDoc(data);
          setLoading(false);
          if (data.status !== "processing" && data.status !== "uploaded") {
            clearInterval(interval);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNotFound(true);
            setLoading(false);
            clearInterval(interval);
          }
        });
    };

    fetchDoc();
    const interval: ReturnType<typeof setInterval> = setInterval(fetchDoc, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    listConversations()
      .then((res) => setRelatedChats(res.conversations.filter((c) => c.document_id === id)))
      .catch(() => setRelatedChats([]));
  }, [id]);

  const handleDelete = async () => {
    if (!doc || !confirm(`Delete "${doc.original_filename}"?`)) return;
    try {
      await deleteDocument(doc.id);
      showToast("Document deleted.", "success");
      navigate("/library");
    } catch {
      showToast("Could not delete document.", "error");
    }
  };

  if (loading) {
    return (
      <AppShell title="Document">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </AppShell>
    );
  }

  if (notFound || !doc) {
    return (
      <AppShell title="Document">
        <p className="text-sm text-[var(--color-text-muted)]">Document not found.</p>
        <Link to="/library" className="mt-4 inline-block text-sm" style={{ color: "var(--color-accent)" }}>
          Back to library
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell title="Document">
      <Link
        to="/library"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to library
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-start justify-between">
            <h2 className="font-display text-2xl">{doc.original_filename}</h2>
            <StatusBadge status={doc.status} />
          </div>

          {doc.status === "failed" && doc.error_message && (
            <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-300">
              Processing failed: {doc.error_message}
            </div>
          )}

          {(doc.status === "processing" || doc.status === "uploaded") && (
            <motion.div
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              className="mb-4 rounded-xl border p-4 text-sm"
              style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)", color: "var(--color-accent-strong)" }}
            >
              This document is still being processed — chunking and indexing usually takes a few seconds.
            </motion.div>
          )}

          <h3 className="mb-2 font-mono text-xs uppercase tracking-wide text-[var(--color-text-faint)]">Preview</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-text-muted)]">
            {doc.preview_text ?? "No preview available yet."}
          </p>
        </GlassCard>

        <div className="space-y-6">
          <GlassCard className="p-6" delay={0.05}>
            <h3 className="mb-4 font-display text-lg">Details</h3>
            <dl className="space-y-3 text-sm">
              <Row label="Pages" value={String(doc.page_count)} />
              <Row label="Chunks indexed" value={String(doc.chunk_count)} />
              <Row label="Size" value={`${(doc.size_bytes / 1024).toFixed(0)} KB`} />
              <Row label="Uploaded" value={new Date(doc.created_at).toLocaleString()} />
            </dl>
          </GlassCard>

          <GlassCard className="p-6" delay={0.1}>
            <h3 className="mb-4 font-display text-lg">Actions</h3>
            <div className="space-y-2">
              <Link to={`/chat?document=${doc.id}`} className="block">
                <Button variant="secondary" className="w-full justify-start" disabled={doc.status !== "ready"}>
                  <MessageSquare className="h-4 w-4" /> Ask about this document
                </Button>
              </Link>
              <Link to="/insights" className="block">
                <Button variant="secondary" className="w-full justify-start" disabled={doc.status !== "ready"}>
                  <BarChart3 className="h-4 w-4" /> View model evaluation
                </Button>
              </Link>
              <Button variant="danger" className="w-full justify-start" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" /> Delete document
              </Button>
            </div>
          </GlassCard>

          {relatedChats.length > 0 && (
            <GlassCard className="p-6" delay={0.15}>
              <h3 className="mb-3 font-display text-lg">Related chats</h3>
              <div className="space-y-1.5">
                {relatedChats.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/chat?document=${doc.id}&conversation=${c.id}`)}
                    className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-border)]"
                  >
                    {c.title || "Untitled conversation"}
                  </button>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd className="font-mono text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
