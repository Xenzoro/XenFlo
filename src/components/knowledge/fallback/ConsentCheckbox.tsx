"use client";

/**
 * The permission checkbox required before any upload, paste or owner-approved scrape,
 * with the friendly accuracy note underneath. Wording is fixed by the spec (CLAUDE.md).
 */
import { useId } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export const CONSENT_TEXT = "I own this business or have permission from the owner to use this website's content.";
export const ACCURACY_NOTE = "Please make sure uploaded info is accurate. Your knowledge base is only as good as what goes into it.";

export function ConsentCheckbox({ checked, onChange, className }: { checked: boolean; onChange: (checked: boolean) => void; className?: string }) {
  const id = useId();
  return (
    <div className={cn("rounded-2xl border p-4 transition-colors", checked ? "border-primary bg-primary-soft/60" : "border-border bg-card", className)}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={`${id}-note`}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
        />
        <span className="text-sm font-medium">{CONSENT_TEXT}</span>
      </label>
      <p id={`${id}-note`} className="ml-7 mt-2 flex items-start gap-1.5 text-xs text-muted">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />
        {ACCURACY_NOTE}
      </p>
    </div>
  );
}
