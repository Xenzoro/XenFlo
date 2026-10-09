"use client";

/*
  Detailed mode: one saved record at a time, using the same tabs as /knowledge.
  It runs inside its own KnowledgeProvider, so inline editing and Save (a new version)
  work exactly like on /knowledge. Prev/next and the picker move between records.
*/
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, PencilLine } from "lucide-react";
import type { KnowledgeBase } from "@/types/knowledge";
import type { KnowledgeSummary } from "@/lib/db/types";
import { KnowledgeProvider } from "@/context/KnowledgeContext";
import { getKnowledge, type ApiError } from "@/lib/api/client";
import { hostOf } from "@/lib/utils/download";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Toast } from "@/components/ui/Toast";
import { KnowledgeResults } from "@/components/knowledge/KnowledgeResults";
import { ScrapeErrorCard } from "@/components/knowledge/ScrapeErrorCard";
import { useKnowledgeActions } from "@/components/knowledge/useKnowledgeActions";
import { ListSkeleton } from "./ListSkeleton";

export function DetailedView({
  id,
  items,
  reloadToken,
  onPick,
  onOpenEditor,
  onSaved,
}: {
  id: string;
  items: KnowledgeSummary[];
  /** Changes when the record was changed elsewhere (restore, re-scrape) so we refetch */
  reloadToken: number;
  onPick: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onSaved: () => void;
}) {
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let stale = false;
    setKb(null);
    setError(null);
    getKnowledge(id).then((res) => {
      if (stale) return;
      if (res.error) setError(res.error);
      else setKb(res.data);
    });
    return () => {
      stale = true;
    };
  }, [id, reloadToken]);

  const index = items.findIndex((i) => i.id === id);
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Button size="sm" variant="ghost" disabled={!prev} onClick={() => prev && onPick(prev.id)} icon={<ChevronLeft className="size-4" />} aria-label="Previous record" />
        <select
          value={id}
          onChange={(e) => onPick(e.target.value)}
          aria-label="Choose a knowledge base"
          className="h-9 min-w-0 flex-1 rounded-full border border-border bg-card px-3 text-sm outline-none focus:border-primary sm:max-w-sm"
        >
          {index < 0 && <option value={id}>{kb?.companyName ?? "Loading…"}</option>}
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.companyName} · {hostOf(i.url)}
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" disabled={!next} onClick={() => next && onPick(next.id)} icon={<ChevronRight className="size-4" />} aria-label="Next record" />
        <span className="hidden text-xs text-subtle sm:inline">{index >= 0 ? `${index + 1} of ${items.length}` : "Not in current filters"}</span>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => onOpenEditor(id)} icon={<PencilLine className="size-3.5" />}>
          Open in editor
        </Button>
      </Card>

      {error && <ScrapeErrorCard error={error} />}
      {!kb && !error && <ListSkeleton mode="detailed" />}
      {kb && (
        // key: a fresh provider per record (and per reload) so state never leaks between records
        <KnowledgeProvider key={`${kb.id}-${kb.version}-${reloadToken}`} initial={kb}>
          <DetailedEditor onSaved={onSaved} />
        </KnowledgeProvider>
      )}
    </div>
  );
}

function DetailedEditor({ onSaved }: { onSaved: () => void }) {
  const actions = useKnowledgeActions({ onSaved });
  return (
    <>
      <KnowledgeResults onSave={actions.save} saving={actions.saving} onDigDeeper={actions.dig} digging={actions.digging} />
      <Toast toast={actions.toast} onClose={actions.closeToast} />
    </>
  );
}
