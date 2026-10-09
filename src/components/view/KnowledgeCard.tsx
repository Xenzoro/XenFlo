"use client";

/** One saved knowledge base as a card: logo, name, industry, health gauge, updated date. Click opens details. */
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { KnowledgeSummary } from "@/lib/db/types";
import { hostOf } from "@/lib/utils/download";
import { timeAgo } from "@/lib/utils/time";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Gauge } from "@/components/ui/Gauge";
import { Pill } from "@/components/ui/Pill";
import { RecordLogo } from "./RecordLogo";
import { RecordMenu, type RecordHandlers } from "./RecordMenu";

export function KnowledgeCard({
  record,
  index,
  selected,
  onSelect,
  busy,
  handlers,
}: {
  record: KnowledgeSummary;
  index: number;
  selected: boolean;
  onSelect: (on: boolean) => void;
  busy: boolean;
  handlers: RecordHandlers;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(index, 12) * 0.04 } }} exit={{ opacity: 0, scale: 0.97 }}>
      <Card
        selected={selected}
        onClick={() => handlers.onDetails(record)}
        className="relative flex h-full cursor-pointer flex-col p-5 transition-shadow hover:shadow-md"
        data-record={record.id}
      >
        <div className="flex items-center justify-between">
          <Checkbox label={`Select ${record.companyName}`} checked={selected} onChange={onSelect} />
          <RecordMenu record={record} handlers={handlers} busy={busy} />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <RecordLogo url={record.logoUrl} name={record.companyName} className="size-12" />
          <div className="min-w-0">
            <h3 className="truncate font-bold">{record.companyName || hostOf(record.url)}</h3>
            <p className="truncate text-xs text-muted">{hostOf(record.url)}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-2">
            {record.industry ? <Pill className="max-w-full truncate">{record.industry}</Pill> : <span className="text-xs text-subtle">No industry yet</span>}
            <p className="text-xs text-muted">
              Updated {timeAgo(record.updatedAt)} <Badge className="ml-1">v{record.version}</Badge>
            </p>
          </div>
          <Gauge value={record.completeness} size={68} stroke={7} />
        </div>

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-2xl bg-card/80 text-sm font-medium text-primary backdrop-blur-[1px]">
            <Loader2 className="size-4 animate-spin" /> Working…
          </div>
        )}
      </Card>
    </motion.div>
  );
}
