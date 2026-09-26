import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  MessageSquare,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Sparkles,
  Copy,
  Check,
  Download,
  AlertTriangle,
  Scale,
  RefreshCw,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import { StatusBadge } from "../components/ui/Badge";
import { useToast } from "../components/ui/toast-context";
import {
  getDocument,
  deleteDocument,
  listConversations,
  analyzeDocument,
  getDocumentAnalysis,
  draftClause,
} from "../lib/api";
import type {
  LegalDocument,
  Conversation,
  ContractAnalysis,
  KeyClauseItem,
  DraftedClause,
} from "../types";

const CLAUSE_PRESETS = [
  { name: "Non-Disclosure & Confidentiality", value: "Non-Disclosure and Confidentiality Provision", desc: "Mutual or unilateral trade secret protection" },
  { name: "Limitation of Liability & Cap", value: "Limitation of Liability and Consequential Damages Waiver", desc: "Aggregate liability cap to fees paid" },
  { name: "Indemnification & Defense", value: "Mutual Commercial Indemnification", desc: "Third-party IP and breach indemnification" },
  { name: "Termination for Convenience / Cause", value: "Termination Rights and Transition Obligations", desc: "30-day notice and immediate cure triggers" },
  { name: "IP Rights & Work For Hire", value: "Intellectual Property Ownership and Assignment", desc: "Broad assignment of deliverables" },
  { name: "Non-Compete & Non-Solicit", value: "Post-Termination Non-Compete and Non-Solicitation", desc: "12-month restrictive covenants" },
];

export default function DocumentViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<LegalDocument | null>(null);
  const [relatedChats, setRelatedChats] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "audit" | "drafter">("preview");

  // Analysis State
  const [analysis, setAnalysis] = useState<ContractAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [clauseRiskFilter, setClauseRiskFilter] = useState<string>("all");

  // Drafter State
  const [clauseType, setClauseType] = useState(CLAUSE_PRESETS[0].value);
  const [jurisdiction, setJurisdiction] = useState("Delaware Law (US Commercial)");
  const [favorParty, setFavorParty] = useState<"neutral" | "disclosing_party" | "receiving_party" | "service_provider" | "client">("neutral");
  const [strictness, setStrictness] = useState<"standard" | "strict" | "friendly">("standard");
  const [context, setContext] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftedResult, setDraftedResult] = useState<DraftedClause | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);

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

    // Check if document analysis already exists
    getDocumentAnalysis(id)
      .then((res) => setAnalysis(res))
      .catch(() => setAnalysis(null));
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

  const handleRunAudit = async () => {
    if (!doc) return;
    setAnalyzing(true);
    try {
      const res = await analyzeDocument(doc.id);
      setAnalysis(res);
      showToast("AI Risk Audit complete!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to analyze document.", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDraftClause = async () => {
    if (!clauseType) return;
    setDrafting(true);
    try {
      const res = await draftClause({
        clauseType,
        context,
        jurisdiction,
        favorParty,
        strictness,
      });
      setDraftedResult(res);
      showToast("Clause drafted successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to draft clause.", "error");
    } finally {
      setDrafting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDraft(true);
    showToast("Copied to clipboard!", "success");
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  const downloadClauseAsTxt = (clause: DraftedClause) => {
    const element = document.createElement("a");
    const file = new Blob(
      [
        `============================================================\n` +
        `LEGAL CLAUSE: ${clause.clause_title}\n` +
        `Jurisdiction: ${jurisdiction}\n` +
        `============================================================\n\n` +
        `${clause.clause_text}\n\n` +
        `------------------------------------------------------------\n` +
        `EXPLANATION:\n${clause.plain_english_explanation}\n\n` +
        `RISK MITIGATIONS:\n${clause.risk_mitigations.map((m) => `• ${m}`).join("\n")}\n\n` +
        `NEGOTIATION TIPS:\n${clause.negotiation_tips}\n`
      ],
      { type: "text/plain" }
    );
    element.href = URL.createObjectURL(file);
    element.download = `${clause.clause_title.replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  if (loading) {
    return (
      <AppShell title="Document Intelligence">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </AppShell>
    );
  }

  if (notFound || !doc) {
    return (
      <AppShell title="Document Intelligence">
        <p className="text-sm text-[var(--color-text-muted)]">Document not found.</p>
        <Link to="/library" className="mt-4 inline-block text-sm" style={{ color: "var(--color-accent)" }}>
          Back to library
        </Link>
      </AppShell>
    );
  }

  // Filter clauses if risk analysis is loaded
  const keyClausesList: KeyClauseItem[] = (analysis?.key_clauses || []).map((c: any) =>
    typeof c === "string" ? { title: "Clause", text: c, risk_level: "low" as const } : c
  );

  const filteredClauses = keyClausesList.filter((c) => {
    if (clauseRiskFilter === "all") return true;
    return c.risk_level?.toLowerCase() === clauseRiskFilter;
  });

  return (
    <AppShell title="Document Intelligence">
      {/* Back and Tab Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/library"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to library
        </Link>

        {/* Interactive Tabs */}
        <div className="flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/70 p-1 backdrop-blur-md overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab("preview")}
            className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
              activeTab === "preview"
                ? "bg-[var(--color-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Document Text
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
              activeTab === "audit"
                ? "bg-[var(--color-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Risk Audit
            {analysis && (
              <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[10px] font-bold">
                {analysis.overall_risk_score ?? 20}%
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("drafter")}
            className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
              activeTab === "drafter"
                ? "bg-[var(--color-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Clause Drafter
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Content Pane */}
        <div className="space-y-6 lg:col-span-2">
          {/* TAB 1: PREVIEW */}
          {activeTab === "preview" && (
            <GlassCard className="p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="font-display text-2xl tracking-tight">{doc.original_filename}</h2>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Legal Document Ingestion · Ready for RAG and Deep Audit
                  </p>
                </div>
                <StatusBadge status={doc.status} />
              </div>

              {doc.status === "failed" && doc.error_message && (
                <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
                  Processing failed: {doc.error_message}
                </div>
              )}

              {(doc.status === "processing" || doc.status === "uploaded") && (
                <motion.div
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                  className="mb-4 rounded-xl border p-4 text-sm"
                  style={{
                    borderColor: "var(--color-accent)",
                    background: "var(--color-accent-soft)",
                    color: "var(--color-accent-strong)",
                  }}
                >
                  This document is being processed and indexed into high-dimensional vectors...
                </motion.div>
              )}

              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
                  Extracted Legal Text Preview
                </h3>
                <span className="text-xs text-[var(--color-text-faint)]">
                  {doc.chunk_count} chunks indexed
                </span>
              </div>
              <div className="max-h-[600px] overflow-y-auto rounded-xl border border-[var(--color-border)]/60 bg-black/30 p-4 font-mono text-xs leading-relaxed text-[var(--color-text-muted)]">
                <p className="whitespace-pre-line">
                  {doc.preview_text ?? "No preview available yet."}
                </p>
              </div>
            </GlassCard>
          )}

          {/* TAB 2: AI RISK AUDIT */}
          {activeTab === "audit" && (
            <div className="space-y-6">
              {!analysis ? (
                <GlassCard className="p-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                    <Scale className="h-8 w-8" />
                  </div>
                  <h3 className="font-display text-xl">LegalGPT Contract Risk Audit</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-muted)]">
                    Perform an in-depth audit of indemnification, termination clauses, compliance checks, and counterparty liability exposure.
                  </p>
                  <div className="mt-6 flex justify-center">
                    <Button
                      variant="primary"
                      onClick={handleRunAudit}
                      disabled={analyzing || doc.status !== "ready"}
                      className="px-6 py-2.5 font-semibold"
                    >
                      {analyzing ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Auditing Document with Neural Core...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Run Comprehensive AI Risk Audit
                        </span>
                      )}
                    </Button>
                  </div>
                </GlassCard>
              ) : (
                <>
                  {/* Executive Summary & Risk Gauge */}
                  <GlassCard className="p-6">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-accent)]">
                            <Sparkles className="h-3 w-3" /> Audit Intelligence
                          </span>
                          <span className="text-xs text-[var(--color-text-faint)]">
                            Analyzed with LegalGPT Neural Core
                          </span>
                        </div>
                        <h3 className="font-display text-lg">Executive Legal Summary</h3>
                        <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
                          {analysis.executive_summary || analysis.summary || "No summary available."}
                        </p>
                      </div>

                      {/* 3D Circular Risk Gauge */}
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--color-border)] bg-black/40 p-4 text-center min-w-[160px]">
                        <div className="relative flex h-20 w-20 items-center justify-center">
                          <svg className="h-20 w-20 -rotate-90 transform" viewBox="0 0 36 36">
                            <path
                              className="text-[var(--color-border)]"
                              strokeWidth="3.5"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path
                              className={
                                (analysis.overall_risk_score ?? 25) > 60
                                  ? "text-rose-500"
                                  : (analysis.overall_risk_score ?? 25) > 30
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                              }
                              strokeDasharray={`${analysis.overall_risk_score ?? 25}, 100`}
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                          </svg>
                          <span className="absolute font-mono text-xl font-bold">
                            {analysis.overall_risk_score ?? 25}%
                          </span>
                        </div>
                        <span className="mt-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                          {analysis.overall_risk_level?.toUpperCase() || "LOW RISK"}
                        </span>
                      </div>
                    </div>
                  </GlassCard>

                  {/* Key Clauses Breakdown with Interactive Risk Filters */}
                  <GlassCard className="p-6">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="font-display text-lg">Clause Analysis & Protections</h3>
                      <div className="flex items-center gap-1.5">
                        {["all", "critical", "high", "medium", "low"].map((risk) => (
                          <button
                            key={risk}
                            onClick={() => setClauseRiskFilter(risk)}
                            className={`rounded-lg px-2.5 py-1 text-xs uppercase font-mono transition-all ${
                              clauseRiskFilter === risk
                                ? "bg-[var(--color-accent)] text-black font-bold"
                                : "border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-card)]"
                            }`}
                          >
                            {risk}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {filteredClauses.map((clause, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-[var(--color-border)] bg-black/20 p-4 transition-all hover:border-[var(--color-border-hover)]"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <h4 className="font-semibold text-[var(--color-text)] text-sm">
                              {clause.title}
                            </h4>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] uppercase font-mono font-bold ${
                                clause.risk_level === "critical" || clause.risk_level === "high"
                                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                  : clause.risk_level === "medium"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              }`}
                            >
                              {clause.risk_level} risk
                            </span>
                          </div>

                          <p className="mt-2 rounded bg-black/40 p-2.5 font-mono text-xs text-[var(--color-text-muted)] leading-relaxed">
                            "{clause.text}"
                          </p>

                          {clause.risk_reason && (
                            <p className="mt-2 text-xs text-[var(--color-text)]">
                              <span className="font-semibold text-amber-300">Observation:</span> {clause.risk_reason}
                            </p>
                          )}

                          {clause.recommendation && (
                            <p className="mt-1 text-xs text-[var(--color-accent)]">
                              <span className="font-semibold">Recommendation:</span> {clause.recommendation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </GlassCard>

                  {/* Compliance Items & Action Items */}
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    {analysis.compliance_items && analysis.compliance_items.length > 0 && (
                      <GlassCard className="p-6">
                        <h3 className="mb-3 font-display text-base">Compliance Verification</h3>
                        <div className="space-y-2.5">
                          {analysis.compliance_items.map((item, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              {item.status === "pass" ? (
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                              ) : (
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                              )}
                              <div>
                                <span className="font-semibold text-[var(--color-text)]">{item.check}</span>
                                {item.note && <p className="text-[var(--color-text-muted)]">{item.note}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </GlassCard>
                    )}

                    {analysis.action_items && analysis.action_items.length > 0 && (
                      <GlassCard className="p-6">
                        <h3 className="mb-3 font-display text-base">Recommended Counsel Actions</h3>
                        <div className="space-y-2.5">
                          {analysis.action_items.map((action, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span
                                className={`mt-0.5 shrink-0 rounded px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase ${
                                  action.priority === "high"
                                    ? "bg-rose-500/20 text-rose-300"
                                    : "bg-blue-500/20 text-blue-300"
                                }`}
                              >
                                {action.priority}
                              </span>
                              <p className="text-[var(--color-text-muted)]">{action.action}</p>
                            </div>
                          ))}
                        </div>
                      </GlassCard>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: AI CLAUSE DRAFTER */}
          {activeTab === "drafter" && (
            <div className="space-y-6">
              <GlassCard className="p-6">
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-accent)]">
                      <Sparkles className="h-3 w-3" /> Legal Drafting Engine
                    </span>
                    <span className="text-xs text-[var(--color-text-faint)]">
                      Powered by LegalGPT Neural Core
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-xl">Draft Enforceable Legal Clauses</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Generate jurisdiction-compliant clauses tailored to your legal stance and risk posture.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Preset Pills */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                      Select Clause Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {CLAUSE_PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => setClauseType(preset.value)}
                          className={`rounded-xl border px-3 py-1.5 text-xs transition-all ${
                            clauseType === preset.value
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent-strong)] font-semibold shadow-sm"
                              : "border-[var(--color-border)] bg-black/20 text-[var(--color-text-muted)] hover:border-[var(--color-border-hover)]"
                          }`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Jurisdiction & Stance Grid */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-muted)]">
                        Governing Jurisdiction
                      </label>
                      <select
                        value={jurisdiction}
                        onChange={(e) => setJurisdiction(e.target.value)}
                        className="w-full rounded-xl border border-[var(--color-border)] bg-black/40 px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      >
                        <option value="Delaware Law (US Commercial)">Delaware Law (US Commercial)</option>
                        <option value="California Law (Tech & Employment)">California Law (Tech & Employment)</option>
                        <option value="New York Law (Commercial Financial)">New York Law (Commercial Financial)</option>
                        <option value="England & Wales (Common Law)">England & Wales (Common Law)</option>
                        <option value="International / UNCITRAL">International / UNCITRAL</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-muted)]">
                        Party Stance / Favorability
                      </label>
                      <select
                        value={favorParty}
                        onChange={(e) => setFavorParty(e.target.value as any)}
                        className="w-full rounded-xl border border-[var(--color-border)] bg-black/40 px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      >
                        <option value="neutral">Balanced / Mutual Neutral</option>
                        <option value="disclosing_party">Disclosing Party Favored</option>
                        <option value="receiving_party">Receiving Party Favored</option>
                        <option value="service_provider">Service Provider Favored</option>
                        <option value="client">Client / Buyer Favored</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-muted)]">
                        Protection Level
                      </label>
                      <select
                        value={strictness}
                        onChange={(e) => setStrictness(e.target.value as any)}
                        className="w-full rounded-xl border border-[var(--color-border)] bg-black/40 px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      >
                        <option value="standard">Standard Commercial</option>
                        <option value="strict">Strict & Comprehensive</option>
                        <option value="friendly">Lightweight / Friendly</option>
                      </select>
                    </div>
                  </div>

                  {/* Context Input */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-muted)]">
                      Specific Requirements or Custom Terms (Optional)
                    </label>
                    <textarea
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      placeholder="e.g. Include 12-month carveout for prior confidential information, liability capped at $500k, 30 days cure period..."
                      rows={2}
                      className="w-full rounded-xl border border-[var(--color-border)] bg-black/40 p-3 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      onClick={handleDraftClause}
                      disabled={drafting}
                      className="px-5 py-2 font-semibold"
                    >
                      {drafting ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Drafting with Neural Core...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Generate Legal Clause
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              </GlassCard>

              {/* Drafted Result Card */}
              {draftedResult && (
                <GlassCard className="p-6 border-[var(--color-accent)]/30">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase font-bold text-emerald-300">
                        Generated Enforceable Provision
                      </span>
                      <h4 className="mt-1 font-display text-lg">{draftedResult.clause_title}</h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => copyToClipboard(draftedResult.clause_text)}
                        className="px-3 py-1.5 text-xs"
                      >
                        {copiedDraft ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedDraft ? "Copied" : "Copy"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => downloadClauseAsTxt(draftedResult)}
                        className="px-3 py-1.5 text-xs"
                      >
                        <Download className="h-3.5 w-3.5" /> Export TXT
                      </Button>
                    </div>
                  </div>

                  {/* Clause Text Box */}
                  <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-black/40 p-4 font-mono text-xs leading-relaxed text-[var(--color-text)] select-all">
                    <p className="whitespace-pre-line">{draftedResult.clause_text}</p>
                  </div>

                  {/* Plain English Explanation */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                    <div className="rounded-xl border border-[var(--color-border)] bg-black/20 p-3.5">
                      <span className="font-semibold text-[var(--color-accent)]">Plain-English Summary:</span>
                      <p className="mt-1 text-[var(--color-text-muted)] leading-relaxed">
                        {draftedResult.plain_english_explanation}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--color-border)] bg-black/20 p-3.5">
                      <span className="font-semibold text-amber-300">Negotiation Strategy:</span>
                      <p className="mt-1 text-[var(--color-text-muted)] leading-relaxed">
                        {draftedResult.negotiation_tips}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Info Pane */}
        <div className="space-y-6">
          <GlassCard className="p-6" delay={0.05}>
            <h3 className="mb-4 font-display text-lg">Document Metadata</h3>
            <dl className="space-y-3 text-sm">
              <Row label="Pages" value={String(doc.page_count)} />
              <Row label="Chunks indexed" value={String(doc.chunk_count)} />
              <Row label="File Size" value={`${(doc.size_bytes / 1024).toFixed(0)} KB`} />
              <Row label="Uploaded" value={new Date(doc.created_at).toLocaleDateString()} />
              <Row label="Neural Engine" value="v2.0 Active" />
            </dl>
          </GlassCard>

          <GlassCard className="p-6" delay={0.1}>
            <h3 className="mb-4 font-display text-lg">Quick Actions</h3>
            <div className="space-y-2">
              <Link to={`/chat?document=${doc.id}`} className="block">
                <Button variant="primary" className="w-full justify-start font-semibold" disabled={doc.status !== "ready"}>
                  <MessageSquare className="h-4 w-4" /> Chat with Document
                </Button>
              </Link>
              <Button
                variant="secondary"
                className="w-full justify-start"
                disabled={doc.status !== "ready"}
                onClick={() => {
                  setActiveTab("audit");
                  if (!analysis) handleRunAudit();
                }}
              >
                <ShieldAlert className="h-4 w-4" /> Run Contract Audit
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                disabled={doc.status !== "ready"}
                onClick={() => setActiveTab("drafter")}
              >
                <Sparkles className="h-4 w-4" /> AI Clause Drafter
              </Button>
              <Link to="/insights" className="block">
                <Button variant="secondary" className="w-full justify-start" disabled={doc.status !== "ready"}>
                  <BarChart3 className="h-4 w-4" /> Model & RAG Insights
                </Button>
              </Link>
              <Button variant="danger" className="w-full justify-start" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" /> Delete Document
              </Button>
            </div>
          </GlassCard>

          {relatedChats.length > 0 && (
            <GlassCard className="p-6" delay={0.15}>
              <h3 className="mb-3 font-display text-lg">Active Consultations</h3>
              <div className="space-y-1.5">
                {relatedChats.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/chat?document=${doc.id}&conversation=${c.id}`)}
                    className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)]/60 hover:text-[var(--color-text)]"
                  >
                    💬 {c.title || "Untitled consultation"}
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
