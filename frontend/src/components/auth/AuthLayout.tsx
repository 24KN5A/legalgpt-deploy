import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Scale } from "lucide-react";
import GlassCard from "../ui/GlassCard";
import ThemeToggle from "../ui/ThemeToggle";

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "var(--bg-glow-1), var(--bg-glow-2)" }}
      />

      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <Scale className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
          <span className="font-display text-lg tracking-tight">LegalGPT</span>
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <GlassCard className="p-8" animate={false}>
            <h1 className="font-display text-2xl">{title}</h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{subtitle}</p>

            <div className="mt-7">{children}</div>
          </GlassCard>

          <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">{footer}</p>
        </motion.div>
      </div>
    </div>
  );
}
