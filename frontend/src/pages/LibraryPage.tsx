import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Search, Trash2, UploadCloud, LayoutGrid, List, ArrowUpDown } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import Skeleton from "../components/ui/Skeleton";
import { StatusBadge } from "../components/ui/Badge";
import { useToast } from "../components/ui/toast-context";
import { listDocuments, deleteDocument } from "../lib/api";
import type { LegalDocument, DocumentStatus } from "../types";

type SortKey = "newest" | "oldest" | "name" | "size";
type ViewMode = "grid" | "list";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LibraryPage() {
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem("legalgpt-library-view") as ViewMode) || "grid");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const load = () => {
    listDocuments()
      .then((res) => setDocuments(res.documents))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    localStorage.setItem("legalgpt-library-view", viewMode);
  }, [viewMode]);

  const filtered = useMemo(() => {
    let result = documents.filter((d) => d.original_filename.toLowerCase().includes(query.toLowerCase()));
    if (statusFilter !== "all") result = result.filter((d) => d.status === statusFilter);

    return [...result].sort((a, b) => {
      switch (sortKey) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name":
          return a.original_filename.localeCompare(b.original_filename);
        case "size":
          return b.size_bytes - a.size_bytes;
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [documents, query, statusFilter, sortKey]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      showToast("Document deleted.", "success");
    } catch {
      showToast("Could not delete document.", "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppShell title="Document Library">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents..."
            className="w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm focus:outline-none"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | "all")}
            className="rounded-xl border px-3 py-2 text-xs focus:outline-none"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <option value="all">All statuses</option>
            <option value="ready">Ready</option>
            <option value="processing">Processing</option>
            <option value="uploaded">Uploaded</option>
            <option value="failed">Failed</option>
          </select>

          <button
            onClick={() =>
              setSortKey((k) => (k === "newest" ? "oldest" : k === "oldest" ? "name" : k === "name" ? "size" : "newest"))
            }
            className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs capitalize"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            <ArrowUpDown className="h-3.5 w-3.5" /> {sortKey}
          </button>

          <div className="flex overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-border)" }}>
            <button
              onClick={() => setViewMode("grid")}
              className="px-2.5 py-2"
              style={{ background: viewMode === "grid" ? "var(--color-accent-soft)" : undefined }}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" style={{ color: viewMode === "grid" ? "var(--color-accent-strong)" : "var(--color-text-muted)" }} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="px-2.5 py-2"
              style={{ background: viewMode === "list" ? "var(--color-accent-soft)" : undefined }}
              aria-label="List view"
            >
              <List className="h-4 w-4" style={{ color: viewMode === "list" ? "var(--color-accent-strong)" : "var(--color-text-muted)" }} />
            </button>
          </div>

          <Link to="/upload">
            <Button size="sm">
              <UploadCloud className="h-4 w-4" /> Upload
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={documents.length === 0 ? "No documents yet" : "No matches"}
          description={documents.length === 0 ? "Upload your first document to build your library." : "Try a different search or filter."}
          action={
            documents.length === 0 && (
              <Link to="/upload">
                <Button size="sm">Upload a document</Button>
              </Link>
            )
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filtered.map((doc, i) => (
              <motion.div key={doc.id} layout exit={{ opacity: 0, scale: 0.95 }}>
                <GlassCard className="p-5" hoverable delay={i * 0.03}>
                  <div className="mb-3 flex items-start justify-between">
                    <FileText className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
                    <StatusBadge status={doc.status} />
                  </div>
                  <Link to={`/library/${doc.id}`}>
                    <h3 className="truncate font-medium hover:underline" style={{ textDecorationColor: "var(--color-accent)" }}>
                      {doc.original_filename}
                    </h3>
                  </Link>
                  <p className="mt-1 font-mono text-xs text-[var(--color-text-faint)]">
                    {doc.page_count} pages · {formatBytes(doc.size_bytes)}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <Link to={`/library/${doc.id}`} className="text-xs hover:underline" style={{ color: "var(--color-accent)" }}>
                      Open
                    </Link>
                    <button
                      onClick={() => handleDelete(doc.id, doc.original_filename)}
                      disabled={deletingId === doc.id}
                      className="rounded-lg p-1.5 text-[var(--color-text-faint)] hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                      aria-label={`Delete ${doc.original_filename}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {filtered.map((doc, i) => (
              <motion.div key={doc.id} layout exit={{ opacity: 0, height: 0 }}>
                <GlassCard className="flex items-center gap-4 p-4" delay={i * 0.02}>
                  <FileText className="h-5 w-5 shrink-0" style={{ color: "var(--color-accent)" }} />
                  <Link to={`/library/${doc.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {doc.original_filename}
                  </Link>
                  <span className="hidden font-mono text-xs text-[var(--color-text-faint)] sm:block">
                    {doc.page_count}p · {formatBytes(doc.size_bytes)}
                  </span>
                  <StatusBadge status={doc.status} />
                  <button
                    onClick={() => handleDelete(doc.id, doc.original_filename)}
                    disabled={deletingId === doc.id}
                    className="rounded-lg p-1.5 text-[var(--color-text-faint)] hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                    aria-label={`Delete ${doc.original_filename}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </AppShell>
  );
}
