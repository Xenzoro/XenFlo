"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Optional small marker after the label (e.g. "Advanced" tabs) */
  hint?: string;
}

/**
 * Pill tabs. The blue background slides between tabs (shared layoutId).
 * Scrolls sideways on narrow screens instead of wrapping.
 */
export function Tabs<K extends string>({
  items,
  active,
  onChange,
  layoutId = "tab-pill",
  label,
}: {
  items: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  /** Give each Tabs on screen its own id, or the sliding pill jumps between them */
  layoutId?: string;
  label?: string;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" aria-label={label} onKeyDown={(e) => moveTab(e, items, active, onChange)} className="inline-flex gap-1 rounded-full border border-border bg-card p-1 shadow-card">
        {items.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={active === tab.key}
            tabIndex={active === tab.key ? 0 : -1}
            data-tab={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              "relative whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              active === tab.key ? "text-white" : "text-muted hover:text-ink",
            )}
          >
            {active === tab.key && (
              <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 34 }} />
            )}
            <span className="relative">{tab.label}</span>
            {tab.hint && <span className="relative ml-1 text-[10px] opacity-70">{tab.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** ←/→ (and Home/End) switch tabs, the standard keyboard pattern for tablists. */
export function moveTab<K extends string>(e: React.KeyboardEvent<HTMLElement>, items: { key: K }[], active: K, onChange: (key: K) => void) {
  const i = items.findIndex((t) => t.key === active);
  const to =
    e.key === "ArrowRight" ? (i + 1) % items.length : e.key === "ArrowLeft" ? (i - 1 + items.length) % items.length : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
  if (to < 0) return;
  e.preventDefault();
  onChange(items[to].key);
  // Move focus to the newly selected tab after it re-renders
  const list = e.currentTarget;
  requestAnimationFrame(() => list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
}
