import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../lib/theme-context";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      className="relative flex h-8 w-14 items-center rounded-full border px-1"
      style={{
        borderColor: "var(--color-border)",
        background: isDark ? "var(--color-surface)" : "var(--color-accent-soft)",
      }}
    >
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{
          background: "var(--color-accent)",
          marginLeft: isDark ? 0 : "auto",
        }}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5" style={{ color: "var(--color-accent-contrast)" }} />
        ) : (
          <Sun className="h-3.5 w-3.5" style={{ color: "var(--color-accent-contrast)" }} />
        )}
      </motion.div>
    </button>
  );
}
