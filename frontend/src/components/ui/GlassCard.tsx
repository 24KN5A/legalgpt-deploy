import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import clsx from "clsx";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  hoverable?: boolean;
  animate?: boolean;
  delay?: number;
}

export default function GlassCard({
  children,
  className,
  hoverable = false,
  animate = true,
  delay = 0,
  ...rest
}: GlassCardProps) {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 8 } : undefined}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      whileHover={hoverable ? { y: -3 } : undefined}
      className={clsx("glass rounded-2xl", hoverable && "glass-hover", className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
