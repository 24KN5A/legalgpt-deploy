import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
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
  ChevronsLeft,
  ChevronsRight,
  CircleUser,
} from "lucide-react";
import { getHealth } from "../../lib/api";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload", icon: UploadCloud },
  { to: "/library", label: "Document Library", icon: Library },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/insights", label: "System Status", icon: Activity },
];

const STORAGE_KEY = "legalgpt-sidebar-collapsed";

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    let mounted = true;
    getHealth()
      .then(() => mounted && setOnline(true))
      .catch(() => mounted && setOnline(false));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 256 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="relative hidden md:flex h-full shrink-0 flex-col border-r"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
    >
      <div className={clsx("flex items-center gap-3 px-5 py-6", collapsed && "justify-center px-0")}>
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 border border-[var(--color-accent-soft)] glow-accent">
          <Scale className="h-5 w-5 shrink-0" style={{ color: "var(--color-accent-strong)" }} />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-display text-lg font-bold tracking-tight">LegalGPT</span>
                <span className="rounded-full bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[9px] font-mono font-semibold text-[var(--color-accent)] border border-[var(--color-accent-soft)]">
                  MERN
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                collapsed && "justify-center px-0",
                isActive ? "text-[var(--color-accent-strong)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-xl"
                    style={{ background: "var(--color-accent-soft)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="relative z-10 h-4 w-4 shrink-0" />
                {!collapsed && <span className="relative z-10 truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-1 px-3 pb-3">
        <NavLink
          to="/settings"
          title={collapsed ? "Settings" : undefined}
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              collapsed && "justify-center px-0",
              isActive ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && "Settings"}
        </NavLink>
        <NavLink
          to="/profile"
          title={collapsed ? "Profile" : undefined}
          className={({ isActive }) =>
            clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              collapsed && "justify-center px-0",
              isActive ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            )
          }
        >
          <CircleUser className="h-4 w-4 shrink-0" />
          {!collapsed && "Profile"}
        </NavLink>
      </div>

      <div
        className={clsx(
          "flex items-center gap-2 border-t px-3 py-4",
          collapsed ? "flex-col" : "justify-between"
        )}
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-text-faint)]">
          <span
            className={clsx(
              "h-1.5 w-1.5 rounded-full",
              online === null ? "bg-[var(--color-text-faint)]" : online ? "bg-[var(--color-emerald)]" : "bg-red-400"
            )}
          />
          {!collapsed && (online === null ? "checking..." : online ? "API online" : "API offline")}
        </span>
      </div>

      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-8 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        {collapsed ? (
          <ChevronsRight className="h-3.5 w-3.5" style={{ color: "var(--color-text-muted)" }} />
        ) : (
          <ChevronsLeft className="h-3.5 w-3.5" style={{ color: "var(--color-text-muted)" }} />
        )}
      </button>
    </motion.aside>
  );
}
