import { useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import {
  LayoutDashboard,
  UploadCloud,
  Library,
  MessageSquare,
  Activity,
  Settings,
  Scale,
  CircleUser,
  X,
  LogOut,
} from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";
import { useAuth } from "../../lib/auth-context";

export const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload", icon: UploadCloud },
  { to: "/library", label: "Library", icon: Library },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/insights", label: "Status", icon: Activity },
];

/**
 * Mobile Drawer Navigation (Side-over sheet on mobile when hamburger is clicked)
 */
export function MobileDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Close drawer when route changes
  useEffect(() => {
    onClose();
  }, [location.pathname]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative z-10 flex h-full w-[280px] max-w-[85vw] flex-col border-r shadow-2xl"
            style={{
              background: "var(--color-bg-elevated)",
              borderColor: "var(--color-border)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between border-b px-5 py-4"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 border border-[var(--color-accent-soft)] glow-accent">
                  <Scale className="h-4 w-4" style={{ color: "var(--color-accent-strong)" }} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-display font-bold text-base tracking-tight">LegalGPT</span>
                    <span className="rounded-full bg-[var(--color-accent-soft)] px-1.5 py-0.2 text-[8px] font-mono font-bold text-[var(--color-accent)]">
                      MERN
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-faint)]">Mobile Workspace</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation links */}
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              <div className="px-3 pb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                Navigation
              </div>
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                      isActive
                        ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] border border-[var(--color-accent-soft)] font-semibold"
                        : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}

              <div className="pt-4 px-3 pb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                Account & Preferences
              </div>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] border border-[var(--color-accent-soft)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                  )
                }
              >
                <Settings className="h-4 w-4 shrink-0" />
                <span>Settings</span>
              </NavLink>

              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)] border border-[var(--color-accent-soft)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                  )
                }
              >
                <CircleUser className="h-4 w-4 shrink-0" />
                <span>Profile</span>
              </NavLink>
            </div>

            {/* Footer / User Profile in Drawer */}
            <div
              className="border-t p-3 space-y-3"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                  <span className="truncate text-xs font-medium text-[var(--color-text-muted)]">
                    {user?.email || "User"}
                  </span>
                </div>
                <ThemeToggle />
              </div>

              <button
                onClick={() => {
                  logout();
                  navigate("/login", { replace: true });
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                style={{ borderColor: "rgba(239, 68, 68, 0.2)" }}
              >
                <LogOut className="h-3.5 w-3.5" /> Log out
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * Modern Mobile Bottom Navigation Bar (Dock-style for 1-thumb fast switching)
 */
export function MobileBottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t backdrop-blur-xl md:hidden px-2 pb-safe"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--glass-bg)",
        boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.2)",
      }}
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              "relative flex flex-col items-center justify-center gap-1 py-1 px-3 text-[10px] font-medium transition-all",
              isActive
                ? "text-[var(--color-accent-strong)] font-semibold"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="mobile-nav-pill"
                  className="absolute -top-1.5 h-1 w-6 rounded-full bg-[var(--color-accent)]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <div
                className={clsx(
                  "flex h-7 w-7 items-center justify-center rounded-lg transition-transform",
                  isActive ? "bg-[var(--color-accent-soft)] scale-110" : ""
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className="leading-none">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
