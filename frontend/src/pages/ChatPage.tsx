import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Send, FileText, Bot, User, Loader2, MessageSquarePlus, RotateCcw,
  Copy, Check, Zap, ShieldCheck, TrendingUp, Award, AlertTriangle,
  MessageSquare, History, X, AlertCircle
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import MarkdownMessage from "../components/chat/MarkdownMessage";
import { useToast } from "../components/ui/toast-context";
import {
  streamChatMessage,
  listDocuments,
  listConversations,
  getConversation,
  getHealth,
  ApiError,
} from "../lib/api";
import { recordLatency } from "../lib/metrics";
import type { ChatMessage, LegalDocument, Conversation, SourceChunk, HealthStatus } from "../types";

interface DisplayMessage extends Omit<ChatMessage, "id"> {
  id: string;
  streaming?: boolean;
  confidence?: number | null;
  match_quality?: string | null;
  top_similarity?: number | null;
}

const SUGGESTED_PROMPTS = [
  "⚖️ Summarize key obligations & scope",
  "⚠️ What are the termination conditions?",
  "🔍 Check for high-risk or one-sided clauses",
  "🛡️ Review indemnification & arbitration",
  "💼 Who are the parties and their liabilities?",
];

class ChatErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Chat rendering error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-64 flex-col items-center justify-center text-center p-6 rounded-2xl border" style={{ borderColor: "var(--color-border)", background: "var(--glass-bg)" }}>
          <AlertCircle className="h-8 w-8 mb-2" style={{ color: "var(--color-risk-high)" }} />
          <p className="text-sm font-semibold">An error occurred while displaying messages</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-sm">{this.state.error}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const documentIdFromUrl = searchParams.get("document") ?? undefined;
  const conversationIdFromUrl = searchParams.get("conversation") ?? undefined;

  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>(documentIdFromUrl);
  const [conversationId, setConversationId] = useState<string | undefined>(conversationIdFromUrl);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvoId, setLoadingConvoId] = useState<string | null>(null);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<string>("");
  const idCounterRef = useRef(0);
  const loadedInitialRef = useRef<string | null>(null);
  const { showToast } = useToast();

  const nextId = useCallback((prefix: string) => {
    idCounterRef.current += 1;
    return `${prefix}-${idCounterRef.current}`;
  }, []);

  const refreshConversations = useCallback(() => {
    listConversations()
      .then((res) => setConversations(res.conversations || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    listDocuments().then((res) => setDocuments(res.documents.filter((d) => d.status === "ready")));
    refreshConversations();
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, [refreshConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const loadConversation = useCallback(
    async (id: string) => {
      setLoadingConvoId(id);
      try {
        const convo = await getConversation(id);
        loadedInitialRef.current = convo.id;
        setConversationId(convo.id);
        setSelectedDocId(convo.document_id ?? undefined);
        setMessages(
          (convo.messages || []).map((m, idx) => ({
            ...m,
            id: m.id || `loaded-${convo.id}-${idx}`,
            streaming: false,
          }))
        );
        setSearchParams(
          convo.document_id
            ? { conversation: convo.id, document: convo.document_id }
            : { conversation: convo.id },
          { replace: true }
        );
        setMobileHistoryOpen(false);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Could not load conversation.";
        showToast(message, "error");
      } finally {
        setLoadingConvoId(null);
      }
    },
    [showToast, setSearchParams]
  );

  useEffect(() => {
    if (!conversationIdFromUrl || loadedInitialRef.current === conversationIdFromUrl) return;
    loadedInitialRef.current = conversationIdFromUrl;
    loadConversation(conversationIdFromUrl);
  }, [conversationIdFromUrl, loadConversation]);

  const startNewConversation = useCallback(() => {
    loadedInitialRef.current = null;
    setConversationId(undefined);
    setMessages([]);
    setSearchParams(selectedDocId ? { document: selectedDocId } : {}, { replace: true });
    setMobileHistoryOpen(false);
  }, [selectedDocId, setSearchParams]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;
      setSending(true);
      lastUserMessageRef.current = text;

      const userMsg: DisplayMessage = {
        id: nextId("local"),
        role: "user",
        content: text,
        sources: [],
        created_at: new Date().toISOString(),
      };
      const assistantMsgId = nextId("local-assistant");
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantMsgId, role: "assistant", content: "", sources: [], created_at: "", streaming: true },
      ]);

      let sources: SourceChunk[] = [];
      const startedAt = Date.now();

      try {
        await streamChatMessage(
          { message: text, conversation_id: conversationId, document_id: selectedDocId },
          (event) => {
            if (event.type === "sources") {
              sources = event.sources;
              setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, sources } : m)));
            } else if (event.type === "token") {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + event.content } : m))
              );
            } else if (event.type === "confidence") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        confidence: event.confidence,
                        match_quality: event.match_quality,
                        top_similarity: event.top_similarity,
                      }
                    : m
                )
              );
            } else if (event.type === "done") {
              setConversationId(event.conversation_id);
              loadedInitialRef.current = event.conversation_id;
              setSearchParams(
                selectedDocId
                  ? { conversation: event.conversation_id, document: selectedDocId }
                  : { conversation: event.conversation_id },
                { replace: true }
              );
              setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, streaming: false } : m)));
              const elapsed = Date.now() - startedAt;
              setLastLatency(elapsed);
              recordLatency(elapsed);
            }
          }
        );
        refreshConversations();
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
        setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: message, streaming: false } : m)));
        showToast(message, "error");
      } finally {
        setSending(false);
      }
    },
    [sending, conversationId, selectedDocId, showToast, nextId, setSearchParams, refreshConversations]
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage(text);
  }, [input, sendMessage]);

  const handleRegenerate = useCallback(() => {
    if (!lastUserMessageRef.current || sending) return;
    setMessages((prev) => prev.slice(0, -2));
    sendMessage(lastUserMessageRef.current);
  }, [sending, sendMessage]);

  // Sidebar history list content (shared between desktop panel & mobile drawer)
  const historyContent = (
    <>
      <Button variant="secondary" size="sm" className="mb-4 w-full" onClick={startNewConversation}>
        <MessageSquarePlus className="h-4 w-4" /> New chat
      </Button>

      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-faint)]">
        Scope to document
      </div>
      <select
        value={selectedDocId ?? ""}
        onChange={(e) => {
          const val = e.target.value || undefined;
          setSelectedDocId(val);
          setSearchParams(
            conversationId
              ? (val ? { conversation: conversationId, document: val } : { conversation: conversationId })
              : (val ? { document: val } : {}),
            { replace: true }
          );
        }}
        className="mb-5 w-full rounded-lg border px-2 py-2 text-xs focus:outline-none transition-colors"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
      >
        <option value="">All documents</option>
        {documents.map((d) => (
          <option key={d.id} value={d.id}>
            {d.original_filename}
          </option>
        ))}
      </select>

      <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-faint)]">
        <span>History ({conversations.length})</span>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="py-4 text-center text-xs text-[var(--color-text-faint)]">No conversations yet</p>
        )}
        {conversations.map((c) => {
          const isActive = conversationId === c.id;
          const isLoadingThis = loadingConvoId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => loadConversation(c.id)}
              disabled={loadingConvoId !== null}
              className="group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-all hover:bg-[var(--glass-bg-hover)]"
              style={{
                background: isActive ? "var(--color-accent-soft)" : "transparent",
                color: isActive ? "var(--color-accent-strong)" : "var(--color-text-muted)",
                border: isActive ? "1px solid rgba(212,175,106,0.3)" : "1px solid transparent",
              }}
            >
              {isLoadingThis ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--color-accent)]" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
              )}
              <span className="truncate font-medium flex-1">{c.title || "New conversation"}</span>
            </button>
          );
        })}
      </div>

      {health && (
        <div
          className="mt-3 flex items-center gap-1.5 border-t pt-3 font-mono text-[10px] text-[var(--color-text-faint)]"
          style={{ borderColor: "var(--color-border)" }}
        >
          <Bot className="h-3 w-3" /> {health.llm_provider}
          {lastLatency && (
            <span className="ml-auto flex items-center gap-1">
              <Zap className="h-3 w-3" /> {lastLatency}ms
            </span>
          )}
        </div>
      )}
    </>
  );

  return (
    <AppShell title="Chat">
      {/* Mobile history toggle button */}
      <div className="mb-3 flex items-center justify-between md:hidden">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setMobileHistoryOpen(true)}
          className="flex items-center gap-1.5 text-xs"
        >
          <History className="h-3.5 w-3.5" /> History ({conversations.length})
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={startNewConversation}
          className="flex items-center gap-1.5 text-xs"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" /> New chat
        </Button>
      </div>

      {/* Mobile history modal drawer */}
      <AnimatePresence>
        {mobileHistoryOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileHistoryOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative z-10 flex h-full w-72 flex-col p-4 shadow-2xl"
              style={{ background: "var(--color-bg-elevated)", borderRight: "1px solid var(--color-border)" }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-sm font-semibold">Chat History</span>
                <button
                  onClick={() => setMobileHistoryOpen(false)}
                  className="rounded-lg p-1 text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {historyContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex h-[calc(100dvh-13.5rem)] md:h-[calc(100vh-8.5rem)] gap-4 md:gap-6 min-h-[350px]">
        {/* Desktop Sidebar panel */}
        <GlassCard className="hidden w-64 shrink-0 flex-col p-4 md:flex" animate={false}>
          {historyContent}
        </GlassCard>

        {/* Main chat area */}
        <div className="flex flex-1 flex-col min-w-0 h-full">
          <div ref={scrollRef} className="flex-1 space-y-4 sm:space-y-5 overflow-y-auto pr-1">
            <ChatErrorBoundary>
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-[var(--color-text-muted)] py-6 px-2">
                  <div
                    className="mb-4 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl"
                    style={{ background: "var(--color-accent-soft)" }}
                  >
                    <Bot className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: "var(--color-accent-strong)" }} />
                  </div>
                  <p className="font-display text-lg sm:text-xl text-[var(--color-text)]">Ask about your documents</p>
                  <p className="mt-1.5 max-w-sm text-xs sm:text-sm leading-relaxed text-[var(--color-text-muted)]">
                    {selectedDocId
                      ? "Scoped to a single document — answers cite exact clauses with inline sources."
                      : "Searching across all your uploaded documents with similarity threshold 0.70."}
                  </p>
                  <div className="mt-5 sm:mt-6 flex flex-wrap justify-center gap-1.5 sm:gap-2 max-w-lg">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => sendMessage(p)}
                        className="rounded-full border px-3 py-1 sm:px-3.5 sm:py-1.5 text-[11px] sm:text-xs transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
                        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <MessageBubble
                      key={msg.id || `msg-${i}`}
                      message={msg}
                      onRegenerate={
                        !msg.streaming && (msg.role || "").toLowerCase() === "assistant" && i === messages.length - 1
                          ? handleRegenerate
                          : undefined
                      }
                    />
                  ))}
                </AnimatePresence>
              )}
            </ChatErrorBoundary>
          </div>

          {/* Input area */}
          <div className="mt-2 sm:mt-4 flex items-end gap-2 sm:gap-3 shrink-0">
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask anything about clauses, risks, or terms… (Enter to send)"
                rows={1}
                className="w-full max-h-32 sm:max-h-36 resize-none rounded-2xl border px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm focus:outline-none transition-colors leading-relaxed"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              />
              {input.length > 100 && (
                <span
                  className="absolute bottom-2 right-12 font-mono text-[10px] pointer-events-none"
                  style={{ color: input.length > 7500 ? "var(--color-risk-high)" : "var(--color-text-faint)" }}
                >
                  {input.length}/8000
                </span>
              )}
            </div>
            <Button
              onClick={handleSend}
              loading={sending}
              disabled={!input.trim() || input.length > 8000}
              className="btn-tactile shrink-0"
              style={{ borderRadius: "1rem", padding: "0.65rem 0.9rem" }}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

function qualityColor(quality?: string | null): string {
  if (!quality) return "var(--color-text-faint)";
  if (quality === "High") return "var(--color-emerald)";
  if (quality === "Medium") return "var(--color-amber)";
  return "var(--color-risk-high)";
}

function QualityIcon({ quality }: { quality?: string | null }) {
  if (quality === "High") return <ShieldCheck className="h-3.5 w-3.5" />;
  if (quality === "Medium") return <TrendingUp className="h-3.5 w-3.5" />;
  if (quality === "Low") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Award className="h-3.5 w-3.5" />;
}

function MessageBubble({
  message,
  onRegenerate,
}: {
  message: DisplayMessage;
  onRegenerate?: () => void;
}) {
  const isUser = (message.role || "").toLowerCase() === "user";
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const hasConfidence =
    !message.streaming &&
    !isUser &&
    Boolean(message.match_quality) &&
    message.match_quality !== "No match";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-1"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-strong)" }}
        >
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className={`max-w-2xl min-w-0 ${isUser ? "order-1" : ""}`}>
        {/* Message bubble */}
        <GlassCard
          animate={false}
          className="px-4 py-3"
          style={
            isUser
              ? { background: "var(--color-accent-soft)", borderColor: "rgba(212,175,106,0.3)" }
              : undefined
          }
        >
          {isUser ? (
            <p className="whitespace-pre-line text-sm leading-relaxed">{message.content}</p>
          ) : (
            <>
              <MarkdownMessage content={message.content || ""} />
              {message.streaming && !message.content && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-text-muted)]" />
              )}
            </>
          )}
        </GlassCard>

        {/* Confidence / Quality Panel */}
        {hasConfidence && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-2 rounded-xl border px-4 py-3"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--glass-bg)",
            }}
          >
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {/* Confidence % */}
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-faint)]">
                  Confidence
                </span>
                <span
                  className="font-mono text-sm font-semibold"
                  style={{ color: qualityColor(message.match_quality) }}
                >
                  {message.confidence != null
                    ? `${Math.round(Number(message.confidence) * 100)}%`
                    : "—"}
                </span>
              </div>

              {/* Match Quality */}
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-faint)]">
                  Match Quality
                </span>
                <span
                  className="flex items-center gap-1 font-mono text-xs font-medium"
                  style={{ color: qualityColor(message.match_quality) }}
                >
                  <QualityIcon quality={message.match_quality} />
                  {message.match_quality}
                </span>
              </div>

              {/* Semantic Similarity */}
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-faint)]">
                  Semantic Similarity
                </span>
                <span className="font-mono text-xs font-medium text-[var(--color-text-muted)]">
                  {message.top_similarity != null
                    ? Number(message.top_similarity).toFixed(2)
                    : "—"}
                </span>
              </div>

              {/* Retrieved documents toggle */}
              {message.sources && message.sources.length > 0 && (
                <button
                  onClick={() => setShowSources((s) => !s)}
                  className="ml-auto font-mono text-[10px] uppercase tracking-widest transition-colors hover:text-[var(--color-text)]"
                  style={{ color: "var(--color-text-faint)" }}
                >
                  {showSources ? "Hide" : "Show"} {message.sources.length} source
                  {message.sources.length !== 1 ? "s" : ""}
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Source Chips (richer display) */}
        {message.sources && message.sources.length > 0 && showSources && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-1.5"
          >
            {message.sources.map((s, i) => {
              const score = s.score != null ? Number(s.score) : 0;
              const chipColor =
                score >= 0.85
                  ? "var(--color-emerald)"
                  : score >= 0.70
                  ? "var(--color-amber)"
                  : "var(--color-risk-high)";
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border px-3 py-2"
                  style={{ borderColor: "var(--color-border)", background: "var(--glass-bg)" }}
                >
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-faint)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                        {s.document_name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px]" style={{ color: chipColor }}>
                        chunk {s.chunk_index} · {(score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--color-text-faint)] leading-relaxed">
                      {s.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* Actions bar */}
        {!isUser && !message.streaming && message.content && (
          <div className="mt-1.5 flex items-center gap-4">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs transition-colors hover:text-[var(--color-text)]"
              style={{ color: "var(--color-text-faint)" }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 text-xs transition-colors hover:text-[var(--color-text)]"
                style={{ color: "var(--color-text-faint)" }}
              >
                <RotateCcw className="h-3 w-3" /> Regenerate
              </button>
            )}
            {/* Sources toggle shortcut when no confidence panel */}
            {!hasConfidence && message.sources && message.sources.length > 0 && (
              <button
                onClick={() => setShowSources((s) => !s)}
                className="flex items-center gap-1 text-xs transition-colors hover:text-[var(--color-text)]"
                style={{ color: "var(--color-text-faint)" }}
              >
                <FileText className="h-3 w-3" />
                {showSources ? "Hide" : "Show"} {message.sources.length} source
                {message.sources.length !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-1"
          style={{ background: "var(--color-border)" }}
        >
          <User className="h-4 w-4 text-[var(--color-text-muted)]" />
        </div>
      )}
    </motion.div>
  );
}
