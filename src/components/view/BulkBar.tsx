"use client";

/** Bar that slides in when records are selected: export them together or delete them. */
import { AnimatePresence, motion } from "framer-motion";
import { Download, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function BulkBar({
  count,
  total,
  onSelectAll,
  onExport,
  onDelete,
  onClear,
  exporting,
}: {
  count: number;
  total: number;
  onSelectAll: () => void;
  onExport: () => void;
  onDelete: () => void;
  onClear: () => void;
  exporting: boolean;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          className="sticky top-20 z-20"
        >
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-2.5 shadow-card">
            <span className="text-sm font-semibold text-primary">{count} selected</span>
            {count < total && (
              <button type="button" onClick={onSelectAll} className="text-xs font-medium text-primary hover:underline">
                Select all {total}
              </button>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={onExport} loading={exporting} icon={<Download className="size-3.5" />}>
                Export JSON
              </Button>
              <Button size="sm" variant="secondary" onClick={onDelete} className="text-danger" icon={<Trash2 className="size-3.5" />}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={onClear} icon={<X className="size-3.5" />}>
                Clear
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
