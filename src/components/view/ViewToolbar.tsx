"use client";

/*
  Search, filters (industry, health, date), sort and the Card / Table / Detailed switch.
  Filters are pill-shaped dropdowns; the active ones turn blue. Search updates the URL
  300ms after you stop typing.
*/
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, Calendar, Check, ChevronDown, Factory, Gauge as GaugeIcon, LayoutGrid, Rows3, Search, SquareStack, X } from "lucide-react";
import type { ListSort } from "@/lib/db/types";
import { DATE_RANGES, SCORE_BANDS, SORT_LABELS, hasFilters, type DateRange, type ScoreBand, type ViewMode, type ViewState } from "@/lib/view/filters";
import { Card } from "@/components/ui/Card";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { cn } from "@/lib/utils/cn";

const MODES: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
  { key: "card", label: "Cards", icon: <LayoutGrid className="size-4" /> },
  { key: "table", label: "Table", icon: <Rows3 className="size-4" /> },
  { key: "detailed", label: "Detailed", icon: <SquareStack className="size-4" /> },
];

export function ViewToolbar({
  view,
  setView,
  industries,
}: {
  view: ViewState;
  setView: (patch: Partial<ViewState>) => void;
  industries: string[];
}) {
  // Local text so typing feels instant; the URL (and the fetch) follow after a pause
  const [text, setText] = useState(view.q);
  useEffect(() => setText(view.q), [view.q]);
  useEffect(() => {
    if (text === view.q) return;
    const t = window.setTimeout(() => setView({ q: text }), 300);
    return () => window.clearTimeout(t);
  }, [text, view.q, setView]);

  const check = (on: boolean) => (on ? <Check className="size-4" /> : null);

  const industryItems: MenuItem[] = [
    { label: "All industries", onSelect: () => setView({ industry: "" }), checked: !view.industry, icon: check(!view.industry) },
    ...industries.map((i) => ({ label: i, onSelect: () => setView({ industry: i }), checked: view.industry.toLowerCase() === i.toLowerCase(), icon: check(view.industry.toLowerCase() === i.toLowerCase()) })),
  ];
  const scoreItems: MenuItem[] = (Object.keys(SCORE_BANDS) as ScoreBand[]).map((k) => ({
    label: SCORE_BANDS[k].label,
    onSelect: () => setView({ score: k }),
    checked: view.score === k,
    icon: check(view.score === k),
  }));
  const dateItems: MenuItem[] = (Object.keys(DATE_RANGES) as DateRange[]).map((k) => ({
    label: DATE_RANGES[k].label,
    onSelect: () => setView({ date: k }),
    checked: view.date === k,
    icon: check(view.date === k),
  }));
  const sortItems: MenuItem[] = (Object.keys(SORT_LABELS) as ListSort[]).map((k) => ({
    label: SORT_LABELS[k],
    onSelect: () => setView({ sort: k }),
    checked: view.sort === k,
    icon: check(view.sort === k),
  }));

  return (
    <Card className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search by name or website"
            aria-label="Search saved knowledge bases"
            className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm outline-none placeholder:text-subtle focus:border-primary focus:shadow-glow"
          />
        </div>
        {/* View mode pills; the blue background slides between them */}
        <div role="tablist" aria-label="View mode" className="inline-flex shrink-0 self-start rounded-full border border-border bg-page p-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={view.mode === m.key}
              onClick={() => setView({ mode: m.key })}
              className={cn("relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors", view.mode === m.key ? "text-white" : "text-muted hover:text-ink")}
            >
              {view.mode === m.key && <motion.span layoutId="view-mode" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <span className="relative">{m.icon}</span>
              <span className="relative">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterMenu label="Industry" icon={<Factory className="size-3.5" />} value={view.industry || "All industries"} active={!!view.industry} items={industryItems} />
        <FilterMenu label="Health" icon={<GaugeIcon className="size-3.5" />} value={SCORE_BANDS[view.score].label} active={view.score !== "all"} items={scoreItems} />
        <FilterMenu label="Updated" icon={<Calendar className="size-3.5" />} value={DATE_RANGES[view.date].label} active={view.date !== "any"} items={dateItems} />
        <FilterMenu label="Sort" icon={<ArrowUpDown className="size-3.5" />} value={SORT_LABELS[view.sort]} active={false} items={sortItems} />
        {hasFilters(view) && (
          <button
            type="button"
            onClick={() => {
              setText("");
              setView({ q: "", industry: "", score: "all", date: "any" });
            }}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:bg-page hover:text-ink"
          >
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </div>
    </Card>
  );
}

/** A pill that opens a dropdown of choices. */
function FilterMenu({ label, icon, value, active, items }: { label: string; icon: React.ReactNode; value: string; active: boolean; items: MenuItem[] }) {
  return (
    <Menu
      label={label}
      align="left"
      items={items}
      trigger={({ ref, ...props }) => (
        <button
          ref={ref}
          type="button"
          {...props}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            active ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-ink hover:bg-page",
          )}
        >
          {icon}
          <span className="text-muted">{label}:</span>
          <span className="truncate">{value}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
      )}
    />
  );
}
