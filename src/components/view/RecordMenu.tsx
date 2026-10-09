"use client";

/** The ⋯ menu on each saved record (card or table row). */
import { Copy, Download, Eye, History, MoreHorizontal, PencilLine, RefreshCw, Trash2 } from "lucide-react";
import type { KnowledgeSummary } from "@/lib/db/types";
import { Menu } from "@/components/ui/Menu";

export interface RecordHandlers {
  onOpen: (s: KnowledgeSummary) => void;
  onDetails: (s: KnowledgeSummary) => void;
  onHistory: (s: KnowledgeSummary) => void;
  onDuplicate: (s: KnowledgeSummary) => void;
  onRescrape: (s: KnowledgeSummary) => void;
  onExport: (s: KnowledgeSummary) => void;
  onDelete: (s: KnowledgeSummary) => void;
}

export function RecordMenu({ record, handlers, busy, hideDetails }: { record: KnowledgeSummary; handlers: RecordHandlers; busy?: boolean; hideDetails?: boolean }) {
  const items = [
    { label: "Open in editor", icon: <PencilLine className="size-4" />, onSelect: () => handlers.onOpen(record) },
    ...(hideDetails ? [] : [{ label: "View details", icon: <Eye className="size-4" />, onSelect: () => handlers.onDetails(record) }]),
    { label: "Version history", icon: <History className="size-4" />, onSelect: () => handlers.onHistory(record) },
    { label: "Duplicate", icon: <Copy className="size-4" />, onSelect: () => handlers.onDuplicate(record), disabled: busy },
    { label: "Re-scrape", icon: <RefreshCw className="size-4" />, onSelect: () => handlers.onRescrape(record), disabled: busy },
    { label: "Export JSON", icon: <Download className="size-4" />, onSelect: () => handlers.onExport(record), disabled: busy },
    { label: "Delete", icon: <Trash2 className="size-4" />, onSelect: () => handlers.onDelete(record), danger: true, separated: true, disabled: busy },
  ];
  // Stop clicks reaching the card/row behind (which opens details). React portals bubble
  // through the component tree, so this also covers clicks on the menu items.
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Menu
        label={`Actions for ${record.companyName}`}
        items={items}
        trigger={({ ref, ...props }) => (
          <button
            ref={ref}
            type="button"
            aria-label={`Actions for ${record.companyName}`}
            {...props}
            className="rounded-full p-1.5 text-subtle transition-colors hover:bg-page hover:text-ink"
          >
            <MoreHorizontal className="size-5" />
          </button>
        )}
      />
    </span>
  );
}
