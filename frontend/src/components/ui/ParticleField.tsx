import { useState } from "react";
import { motion } from "framer-motion";

interface Particle {
  id: number;
  size: number;
  left: number;
  top: number;
  duration: number;
  delay: number;
  color: string;
}

const COLORS = ["var(--color-accent)", "var(--color-royal)", "var(--color-emerald)", "var(--color-purple)"];

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    size: 2 + Math.random() * 4,
    left: Math.random() * 100,
    top: Math.random() * 100,
    duration: 8 + Math.random() * 10,
    delay: Math.random() * 5,
    color: COLORS[i % COLORS.length],
  }));
}

export default function ParticleField({ count = 18 }: { count?: number }) {
  const [particles] = useState<Particle[]>(() => generateParticles(count));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            top: `${p.top}%`,
            background: p.color,
            opacity: 0.35,
          }}
          animate={{
            y: [0, -24, 0],
            opacity: [0.15, 0.45, 0.15],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
