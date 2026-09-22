import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CircleUser, FileText, LogOut, Search } from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";
import { getHealth, listDocuments } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import type { HealthStatus, LegalDocument } from "../../types";

export default function TopBar({ title }: { title: string }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LegalDocument[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    let mounted = true;
    getHealth()
      .then((h) => mounted && setHealth(h))
      .catch(() => mounted && setHealth(null));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (query.trim().length === 0) {
        setResults([]);
        return;
      }
      listDocuments().then((res) =>
        setResults(
          res.documents.filter((d) =>
            d.original_filename.toLowerCase().includes(query.toLowerCase())
          )
        )
      );
    }, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header
      className="flex h-16 shrink-0 items-center justify-between border-b px-8"
      style={{ borderColor: "var(--color-border)" }}
    >
      <h1 className="font-display text-xl">{title}</h1>

      <div className="flex items-center gap-3">
        <div ref={searchRef} className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <input
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents..."
            className="w-56 rounded-xl border py-2 pl-9 pr-3 text-sm focus:outline-none"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
            }}
          />
          <AnimatePresence>
            {searchOpen && query.trim() && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="glass absolute right-0 top-11 z-20 w-72 overflow-hidden rounded-xl p-1.5"
              >
                {results.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-[var(--color-text-faint)]">No documents match.</p>
                ) : (
                  results.slice(0, 6).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        navigate(`/library/${d.id}`);
                        setSearchOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--color-border)]"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-faint)]" />
                      <span className="truncate">{d.original_filename}</span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {health && (
          <span className="hidden items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs text-[var(--color-text-muted)] lg:flex" style={{ borderColor: "var(--color-border)" }}>
            <span
              className={`h-1.5 w-1.5 rounded-full ${health.vector_store_ready ? "bg-[var(--color-emerald)]" : "bg-red-400"}`}
            />
            {health.llm_provider} · {health.embedding_provider}
          </span>
        )}

        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-full border text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            style={{ borderColor: "var(--color-border)" }}
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="glass absolute right-0 top-11 z-20 w-64 rounded-xl p-4 text-center"
              >
                <p className="text-xs text-[var(--color-text-faint)]">You're all caught up — no notifications yet.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ThemeToggle />

        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-full border text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            style={{ borderColor: "var(--color-border)" }}
            aria-label="Account menu"
          >
            <CircleUser className="h-5 w-5" />
          </button>
          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="glass absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl p-1.5"
              >
                {user && (
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium">{user.full_name}</p>
                    <p className="truncate text-xs text-[var(--color-text-faint)]">{user.email}</p>
                  </div>
                )}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate("/profile");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-border)]"
                >
                  <CircleUser className="h-3.5 w-3.5 shrink-0" /> Profile
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                    navigate("/login", { replace: true });
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-risk-critical)] hover:bg-[var(--color-border)]"
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" /> Log out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
