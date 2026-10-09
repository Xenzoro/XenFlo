"use client";

/*
  After the crawl, if important fields are still missing (Health under 70), offer the
  two ways forward from CLAUDE.md: "Dig deeper" or "Add info yourself", plus a jump
  to the most valuable empty field.
*/
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Lightbulb, Pickaxe, PlusCircle, X } from "lucide-react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { SCORE_CHECKS } from "@/lib/scraper/score";
import { Button } from "@/components/ui/Button";
import { fieldName } from "../fieldLabels";

export const LOW_SCORE = 70;

export function LowScoreBanner({ onDigDeeper, digging, onAddInfo }: { onDigDeeper: () => void; digging: boolean; onAddInfo: () => void }) {
  const { kb, jumpTo, busy } = useKnowledge();
  const [dismissed, setDismissed] = useState(false);
  if (!kb) return null;

  const show = !dismissed && kb.completeness.score < LOW_SCORE;
  const top = SCORE_CHECKS.filter((c) => kb.completeness.missing.includes(c.path)).sort((a, b) => b.weight - a.weight)[0];
  const canDig = kb.crawl.pendingUrls.length > 0 && kb.crawl.pages.length < 30;

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <div role="status" className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 sm:flex-row sm:items-center">
            <Lightbulb className="hidden size-5 shrink-0 text-warning sm:block" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Some important details are still missing</p>
              <p className="text-xs text-muted">The more Flo knows, the more your content sounds like you. Pick one:</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canDig && (
                <Button size="sm" variant="secondary" onClick={onDigDeeper} loading={digging} disabled={busy} icon={<Pickaxe className="size-3.5" />}>
                  Dig deeper
                </Button>
              )}
              <Button size="sm" onClick={onAddInfo} disabled={busy} icon={<PlusCircle className="size-3.5" />}>
                Add info yourself
              </Button>
              {top && (
                <Button size="sm" variant="ghost" onClick={() => jumpTo(top.path)} icon={<ArrowRight className="size-3.5" />}>
                  Fill in {fieldName(top.path).toLowerCase()}
                </Button>
              )}
              <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="rounded-full p-1.5 text-subtle hover:bg-card hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
