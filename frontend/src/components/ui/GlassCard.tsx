import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import clsx from "clsx";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  hoverable?: boolean;
  animate?: boolean;
  delay?: number;
  glow?: "accent" | "royal" | "emerald" | "none";
}

export default function GlassCard({
  children,
  className,
  hoverable = false,
  animate = true,
  delay = 0,
  glow = "none",
  ...rest
}: GlassCardProps) {
  const glowClass =
    glow === "accent"
      ? "glow-accent"
      : glow === "royal"
      ? "glow-royal"
      : glow === "emerald"
      ? "glow-emerald"
      : "";

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 12 } : undefined}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={
        hoverable
          ? {
              y: -3,
              transition: { duration: 0.2, ease: "easeOut" },
            }
          : undefined
      }
      className={clsx(
        "glass-card relative overflow-hidden",
        glowClass,
        className
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
