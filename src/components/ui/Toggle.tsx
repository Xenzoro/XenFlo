"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

/** Pill-shaped on/off switch with a label (used for "Advanced view"). */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-ink"
    >
      <span className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", checked ? "bg-primary" : "bg-border")}>
        {/* The knob slides with a spring; `layout` animates its position change */}
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn("size-4 rounded-full bg-white shadow", checked && "ml-auto")}
        />
      </span>
      {label}
    </button>
  );
}
