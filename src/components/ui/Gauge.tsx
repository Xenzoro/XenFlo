"use client";

import { motion } from "framer-motion";

/**
 * Circular score ring (0-100), styled like MoFlo's Brand Power gauge.
 * The arc animates from its previous value whenever `value` changes.
 */
export function Gauge({ value, size = 160, stroke = 14, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  // Color shifts with the score: amber when low, blue when good, green when great
  const color = clamped >= 80 ? "#16a34a" : clamped >= 50 ? "#2563eb" : "#d97706";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* rotate so the arc starts at 12 o'clock */}
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f4" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-bold" style={{ fontSize: size / 4.4 }}>
          {Math.round(clamped)}
        </span>
        {label && <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">{label}</span>}
      </div>
    </div>
  );
}
