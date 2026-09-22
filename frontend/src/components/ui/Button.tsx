import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled || loading ? undefined : { scale: 1.02 }}
      whileTap={disabled || loading ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors duration-200",
        "focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-6 py-3.5 text-base",
        variant === "primary" &&
          "bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:bg-[var(--color-accent-strong)] shadow-[0_0_0_1px_rgba(212,175,106,0.25),0_8px_24px_-8px_rgba(212,175,106,0.4)]",
        variant === "secondary" &&
          "glass glass-hover text-[var(--color-text)]",
        variant === "ghost" &&
          "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]",
        variant === "danger" &&
          "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20",
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  );
}
