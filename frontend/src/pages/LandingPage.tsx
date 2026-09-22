import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Scale,
  ShieldCheck,
  MessagesSquare,
  FileSearch,
  UploadCloud,
  Sparkles,
  ChevronDown,
  Server,
  Lock,
  Cpu,
} from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Button from "../components/ui/Button";
import ThemeToggle from "../components/ui/ThemeToggle";
import ParticleField from "../components/ui/ParticleField";
import AnimatedCounter from "../components/ui/AnimatedCounter";
import { RiskBadge } from "../components/ui/Badge";
import { useAuth } from "../lib/auth-context";

const CLAUSE_DEMO = [
  {
    text: "Either party may terminate this Agreement for convenience upon 30 days' written notice.",
    risk: "medium" as const,
    note: "No cure period for the counterparty",
  },
  {
    text: "Vendor's total liability shall not exceed the fees paid in the preceding twelve (12) months.",
    risk: "high" as const,
    note: "Caps liability well below typical damages",
  },
  {
    text: "This Agreement shall be governed by the laws of the State of Delaware.",
    risk: "low" as const,
    note: "Standard governing law clause",
  },
];

const FEATURES = [
  {
    icon: FileSearch,
    title: "Ask your documents anything",
    body: "Upload contracts, NDAs, or filings and get grounded answers with citations back to the exact clause — never a guess.",
  },
  {
    icon: ShieldCheck,
    title: "AI Document Insights",
    body: "Every upload can be broken down into summaries, parties, obligations, dates, and flagged risks in one pass.",
  },
  {
    icon: MessagesSquare,
    title: "A conversation, not a search bar",
    body: "Follow up, compare clauses across documents, and keep context across an entire negotiation.",
  },
];

const STEPS = [
  { icon: UploadCloud, title: "Upload", body: "Drop in a PDF — contract, NDA, filing, anything." },
  { icon: Cpu, title: "Index", body: "The document is chunked and embedded into a local vector store." },
  { icon: Sparkles, title: "Ask & analyze", body: "Chat with it directly or generate structured AI insights." },
];

const STACK = [
  { label: "FastAPI", detail: "Backend & API layer" },
  { label: "ChromaDB", detail: "Vector retrieval" },
  { label: "Ollama", detail: "Local LLM inference" },
  { label: "React + Vite", detail: "Frontend" },
];

const FAQS = [
  {
    q: "Is this a substitute for a lawyer?",
    a: "No. LegalGPT provides informational analysis grounded in your documents, but it isn't a law firm and doesn't give legal advice. Always consult a licensed attorney for binding decisions.",
  },
  {
    q: "Where do my documents go?",
    a: "Documents are processed and indexed by your own backend instance — chunked, embedded, and stored in a local ChromaDB vector store alongside SQLite metadata.",
  },
  {
    q: "Which AI models does it use?",
    a: "LegalGPT is provider-agnostic — it can run fully locally with Ollama, or use OpenAI/Anthropic if you configure an API key.",
  },
];

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-60px" },
    transition: { duration: 0.5, delay, ease: "easeOut" as const },
  };
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const { user } = useAuth();

  return (
    <div className="min-h-screen overflow-x-hidden">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
          <span className="font-display text-lg tracking-tight">LegalGPT</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <Link to="/dashboard">
              <Button variant="secondary" size="sm">
                Open app
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
              <Link to="/signup">
                <Button variant="secondary" size="sm">
                  Sign up
                </Button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-16 px-6 pb-24 pt-12 lg:grid-cols-2 lg:pt-20">
        <ParticleField />
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span
            className="mb-6 inline-block rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-widest"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
          >
            Retrieval-grounded legal AI
          </span>
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight lg:text-6xl">
            Read the fine print
            <br />
            <span style={{ color: "var(--color-accent)" }}>before it reads you.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-[var(--color-text-muted)]">
            LegalGPT retrieves the exact clauses that answer your question and flags the ones
            working against you — with citations, not guesses.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link to="/upload">
              <Button size="lg">
                Analyze a document <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" size="lg">
                View dashboard
              </Button>
            </Link>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}>
          <GlassCard className="relative p-6" animate={false}>
            <div className="mb-4 flex items-center justify-between font-mono text-xs text-[var(--color-text-faint)]">
              <span>vendor_agreement_final_v3.pdf</span>
              <span>p. 4 of 11</span>
            </div>
            <div className="space-y-4">
              {CLAUSE_DEMO.map((clause, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.15, duration: 0.4 }}
                  className="rounded-xl border p-4 transition-colors"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                >
                  <p className="text-sm leading-relaxed">"{clause.text}"</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-[var(--color-text-muted)]">{clause.note}</span>
                    <RiskBadge level={clause.risk} />
                  </div>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <motion.div {...fadeUp()} className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {[
            { value: 100, suffix: "%", label: "Local-first by default" },
            { value: 3, suffix: "", label: "Interchangeable LLM providers" },
            { value: 0, prefix: "$", label: "To run fully offline" },
            { value: 25, suffix: "MB", label: "Max document size" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-3xl" style={{ color: "var(--color-accent)" }}>
                <AnimatedCounter value={s.value} prefix={s.prefix} suffix={s.suffix} />
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <motion.h2 {...fadeUp()} className="mb-10 text-center font-display text-3xl">
          Built for reading contracts, not just storing them
        </motion.h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <motion.div key={title} {...fadeUp(i * 0.1)}>
              <GlassCard className="h-full p-6" hoverable animate={false}>
                <Icon className="mb-4 h-6 w-6" style={{ color: "var(--color-accent)" }} />
                <h3 className="font-display text-lg">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{body}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <motion.h2 {...fadeUp()} className="mb-10 text-center font-display text-3xl">
          How LegalGPT works
        </motion.h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <motion.div key={title} {...fadeUp(i * 0.12)} className="relative text-center">
              <div
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: "var(--color-accent-soft)" }}
              >
                <Icon className="h-6 w-6" style={{ color: "var(--color-accent)" }} />
              </div>
              <h3 className="font-display text-lg">{title}</h3>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{body}</p>
              {i < STEPS.length - 1 && (
                <div
                  className="absolute right-[-12%] top-7 hidden h-px w-1/4 md:block"
                  style={{ background: "var(--color-border)" }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Stack */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <motion.div {...fadeUp()}>
          <GlassCard className="p-8" animate={false}>
            <div className="mb-6 flex items-center gap-2">
              <Server className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
              <h3 className="font-display text-lg">Under the hood</h3>
            </div>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {STACK.map((s) => (
                <div key={s.label}>
                  <div className="font-mono text-sm" style={{ color: "var(--color-accent-strong)" }}>
                    {s.label}
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{s.detail}</p>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <motion.h2 {...fadeUp()} className="mb-10 text-center font-display text-3xl">
          Frequently asked
        </motion.h2>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <motion.div key={faq.q} {...fadeUp(i * 0.08)}>
              <GlassCard className="overflow-hidden p-0" animate={false}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left"
                >
                  <span className="font-medium">{faq.q}</span>
                  <motion.span animate={{ rotate: openFaq === i ? 180 : 0 }}>
                    <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
                  </motion.span>
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: openFaq === i ? "auto" : 0, opacity: openFaq === i ? 1 : 0 }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-4 text-sm text-[var(--color-text-muted)]">{faq.a}</p>
                </motion.div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <motion.div {...fadeUp()}>
          <GlassCard className="flex flex-col items-center gap-6 px-8 py-16 text-center" animate={false}>
            <Lock className="h-6 w-6" style={{ color: "var(--color-accent)" }} />
            <h2 className="font-display text-3xl">Upload your first document in under a minute.</h2>
            <Link to="/upload">
              <Button size="lg">
                Get started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="max-w-md text-xs text-[var(--color-text-faint)]">
              LegalGPT provides informational analysis only and is not a substitute for advice
              from a licensed attorney.
            </p>
          </GlassCard>
        </motion.div>
      </section>

      <footer
        className="border-t px-6 py-8 text-center text-xs text-[var(--color-text-faint)]"
        style={{ borderColor: "var(--color-border)" }}
      >
        © {new Date().getFullYear()} LegalGPT. Not a law firm. Not legal advice.
      </footer>
    </div>
  );
}
