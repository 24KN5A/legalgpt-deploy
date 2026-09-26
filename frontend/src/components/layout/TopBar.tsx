import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CircleUser,
  FileText,
  LogOut,
  Menu,
  Search,
  Settings,
  X,
} from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";
import { getHealth, listDocuments } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import type { HealthStatus, LegalDocument } from "../../types";

export default function TopBar({
  title,
  onOpenMobileMenu,
}: {
  title: string;
  onOpenMobileMenu?: () => void;
}) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LegalDocument[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
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
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (
        mobileSearchRef.current &&
        !mobileSearchRef.current.contains(e.target as Node)
      ) {
        setMobileSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header
      className="relative flex h-16 shrink-0 items-center justify-between border-b px-4 sm:px-6 md:px-8"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
    >
      {/* Left: Mobile hamburger + Title */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        {onOpenMobileMenu && (
          <button
            onClick={onOpenMobileMenu}
            className="flex h-9 w-9 items-center justify-center rounded-xl border text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] md:hidden transition-colors shrink-0"
            style={{ borderColor: "var(--color-border)" }}
            aria-label="Open mobile menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <h1 className="font-display text-lg sm:text-xl font-bold truncate">
          {title}
        </h1>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Desktop Search */}
        <div ref={searchRef} className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <input
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents..."
            className="w-44 lg:w-56 rounded-xl border py-2 pl-9 pr-3 text-xs sm:text-sm focus:outline-none transition-all"
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
                className="glass absolute right-0 top-11 z-30 w-72 overflow-hidden rounded-xl p-1.5 shadow-xl"
              >
                {results.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-[var(--color-text-faint)]">
                    No documents match.
                  </p>
                ) : (
                  results.slice(0, 6).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        navigate(`/library/${d.id}`);
                        setSearchOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--color-surface-hover)] transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                      <span className="truncate">{d.original_filename}</span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Search Icon Toggle */}
        <button
          onClick={() => setMobileSearchOpen((o) => !o)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border text-[var(--color-text-muted)] hover:text-[var(--color-text)] sm:hidden transition-colors shrink-0"
          style={{ borderColor: "var(--color-border)" }}
          aria-label="Toggle search"
        >
          <Search className="h-4 w-4" />
        </button>

        {/* System Health Badge (desktop) */}
        {health && (
          <span
            className="hidden items-center gap-2 rounded-full border px-3.5 py-1 font-mono text-xs text-[var(--color-text-muted)] lg:flex shadow-xs"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span
              className={`h-2 w-2 rounded-full animate-pulse ${
                health.vector_store_ready
                  ? "bg-emerald-400 ring-2 ring-emerald-500/20"
                  : "bg-red-400"
              }`}
            />
            <span className="font-semibold text-[var(--color-accent)]">
              LegalGPT Core
            </span>{" "}
            · <span className="opacity-80">Cloud Active</span>
          </span>
        )}

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors shrink-0"
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
                className="glass absolute right-0 top-11 z-30 w-64 rounded-xl p-4 text-center shadow-xl"
              >
                <p className="text-xs text-[var(--color-text-faint)]">
                  You're all caught up — no new notifications.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* User Account Menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors shrink-0"
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
                className="glass absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-xl p-1.5 shadow-xl"
              >
                {user && (
                  <div
                    className="border-b px-3 py-2 pb-2.5 mb-1"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <p className="truncate text-sm font-semibold">{user.full_name}</p>
                    <p className="truncate text-[11px] text-[var(--color-text-faint)]">
                      {user.email}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate("/profile");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs sm:text-sm hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <CircleUser className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />{" "}
                  Profile
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate("/settings");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs sm:text-sm hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <Settings className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />{" "}
                  Settings
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                    navigate("/login", { replace: true });
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs sm:text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" /> Log out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile Search Overlay Bar */}
      <AnimatePresence>
        {mobileSearchOpen && (
          <motion.div
            ref={mobileSearchRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute inset-x-0 top-full z-30 border-b p-3 shadow-xl sm:hidden"
            style={{
              background: "var(--color-bg-elevated)",
              borderColor: "var(--color-border)",
            }}
          >
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--color-text-faint)]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search legal documents..."
                className="w-full rounded-xl border py-2 pl-9 pr-9 text-xs focus:outline-none"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              />
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="absolute right-2 p-1 text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {query.trim() && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border p-1 space-y-1" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                {results.length === 0 ? (
                  <p className="p-3 text-center text-xs text-[var(--color-text-faint)]">
                    No documents match.
                  </p>
                ) : (
                  results.slice(0, 5).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        navigate(`/library/${d.id}`);
                        setMobileSearchOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--color-surface-hover)]"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                      <span className="truncate">{d.original_filename}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
