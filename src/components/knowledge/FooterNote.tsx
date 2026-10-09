import { Sparkles } from "lucide-react";

/** The note at the bottom of the Knowledge page. */
export function FooterNote() {
  return (
    <p className="mt-10 flex items-start justify-center gap-2 text-center text-xs text-muted">
      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
      Everything here powers Flo. The more complete your knowledge, the more your content sounds like you.
    </p>
  );
}
