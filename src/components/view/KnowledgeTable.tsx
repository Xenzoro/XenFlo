"use client";

/*
  Saved knowledge bases as a table with sortable columns. Scrolls sideways inside its
  card on narrow screens instead of stretching the page.
*/
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from "lucide-react";
import type { KnowledgeSummary, ListSort } from "@/lib/db/types";
import { hostOf } from "@/lib/utils/download";
import { formatDate, timeAgo } from "@/lib/utils/time";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { cn } from "@/lib/utils/cn";
import { RecordLogo } from "./RecordLogo";
import { RecordMenu, type RecordHandlers } from "./RecordMenu";

type Column = "name" | "industry" | "completeness" | "version" | "updated";

// Which way a column sorts first when you click it
const FIRST_DIRECTION: Record<Column, "asc" | "desc"> = { name: "asc", industry: "asc", completeness: "desc", version: "desc", updated: "desc" };

function healthColor(score: number) {
  return score >= 80 ? "bg-success" : score >= 50 ? "bg-primary" : "bg-warning";
}

export function KnowledgeTable({
  items,
  selected,
  onSelect,
  onSelectAll,
  sort,
  onSort,
  busyIds,
  handlers,
}: {
  items: KnowledgeSummary[];
  selected: Set<string>;
  onSelect: (id: string, on: boolean) => void;
  onSelectAll: (on: boolean) => void;
  sort: ListSort;
  onSort: (sort: ListSort) => void;
  busyIds: Set<string>;
  handlers: RecordHandlers;
}) {
  const [sortCol, sortDir] = sort.split("_") as [Column, "asc" | "desc"];

  function Header({ col, label, className }: { col: Column; label: string; className?: string }) {
    const active = sortCol === col;
    const next = active ? (sortDir === "asc" ? "desc" : "asc") : FIRST_DIRECTION[col];
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={cn("px-3 py-3 font-medium", className)} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => onSort(`${col}_${next}` as ListSort)} className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-primary")}>
          {label}
          <Icon className="size-3.5" />
        </button>
      </th>
    );
  }

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = items.some((i) => selected.has(i.id));

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border bg-page/60 text-[11px] uppercase tracking-wider text-subtle">
            <tr>
              <th className="w-10 py-3 pl-4">
                <Checkbox label="Select all" checked={allSelected} indeterminate={someSelected} onChange={onSelectAll} />
              </th>
              <Header col="name" label="Company" />
              <Header col="industry" label="Industry" />
              <Header col="completeness" label="Health" />
              <Header col="version" label="Version" />
              <Header col="updated" label="Updated" />
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {items.map((r) => {
              const busy = busyIds.has(r.id);
              return (
                <tr
                  key={r.id}
                  data-record={r.id}
                  onClick={() => handlers.onDetails(r)}
                  className={cn("cursor-pointer transition-colors hover:bg-page/70", selected.has(r.id) && "bg-primary-soft/50")}
                >
                  <td className="py-3 pl-4">
                    <Checkbox label={`Select ${r.companyName}`} checked={selected.has(r.id)} onChange={(on) => onSelect(r.id, on)} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <RecordLogo url={r.logoUrl} name={r.companyName} className="size-9 rounded-lg" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-semibold">
                          {r.companyName || hostOf(r.url)}
                          {busy && <Loader2 className="size-3.5 animate-spin text-primary" />}
                        </p>
                        <p className="truncate text-xs text-muted">{hostOf(r.url)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted">{r.industry ?? <span className="text-subtle">—</span>}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-border-soft">
                        <span className={cn("block h-full rounded-full", healthColor(r.completeness))} style={{ width: `${r.completeness}%` }} />
                      </span>
                      <span className="tabular-nums font-medium">{r.completeness}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-muted">v{r.version}</td>
                  <td className="px-3 py-3 text-muted" title={formatDate(r.updatedAt)}>
                    {timeAgo(r.updatedAt)}
                  </td>
                  <td className="pr-3" onClick={(e) => e.stopPropagation()}>
                    <RecordMenu record={r} handlers={handlers} busy={busy} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
