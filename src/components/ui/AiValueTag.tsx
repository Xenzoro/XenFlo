"use client";

/**
 * The badge next to a value plus, for AI and inferred values, a "Wrong? Remove" button.
 * Removing clears the value (or the list item) with no confirm, and remembers it so the
 * next enrichment run doesn't suggest it again (see dismissValue in KnowledgeContext).
 */
import type { Confidence } from "@/types/knowledge";
import { ConfidenceBadge, isAi } from "./Badge";

export function AiValueTag({
  confidence,
  source,
  evidence,
  onRemove,
  disabled,
}: {
  confidence: Confidence;
  source?: string | null;
  evidence?: string[];
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <ConfidenceBadge confidence={confidence} source={source} evidence={evidence} />
      {isAi(confidence) && onRemove && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation(); // don't open the editor underneath
            onRemove();
          }}
          className="text-[10px] font-medium text-subtle hover:text-danger hover:underline disabled:hidden"
        >
          Wrong? Remove
        </button>
      )}
    </span>
  );
}
