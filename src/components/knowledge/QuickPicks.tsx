"use client";

/*
  One-tap answers for business facts (legal entity, employees, revenue): a row of small pills.
  The current answer is blue. Tapping a pill stores it as the owner's value (User edited);
  "Not sure" / "Prefer not to say" mark the field Not applicable instead (tap again to undo).
  Options and the tap logic live in lib/utils/quick-picks.ts.
*/
import { motion } from "framer-motion";
import { useField, useKnowledge } from "@/context/KnowledgeContext";
import { QUICK_PICKS, pickAction, type QuickPickPath } from "@/lib/utils/quick-picks";
import { cn } from "@/lib/utils/cn";

export function QuickPicks({ path, className }: { path: QuickPickPath; className?: string }) {
  const f = useField<string>(path);
  const { kb, setField, setNotApplicable, busy } = useKnowledge();
  const notApplicable = (kb?.notApplicable ?? []).includes(path);

  function pick(option: string) {
    const action = pickAction(option);
    if ("notApplicable" in action) return setNotApplicable(path, !notApplicable);
    if (f?.value !== option) setField(path, action.set);
    if (notApplicable) setNotApplicable(path, false);
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="group" aria-label="Quick picks">
      {QUICK_PICKS[path].map((option, i) => {
        const active = "notApplicable" in pickAction(option) ? notApplicable : f?.value === option;
        return (
          <motion.button
            key={option}
            type="button"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}
            onClick={() => pick(option)}
            disabled={busy}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              active ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-muted hover:border-primary/40 hover:text-ink",
            )}
          >
            {option}
          </motion.button>
        );
      })}
    </div>
  );
}
