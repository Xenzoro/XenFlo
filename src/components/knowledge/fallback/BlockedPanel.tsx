"use client";

/*
  Shown when a site limits automated access. One consent checkbox unlocks:
  - "Continue scraping" (robots.txt blocks only): the owner's permission lifts it
  - uploading or pasting the content instead
  - "Add info manually": start an empty knowledge base and fill it in
  A server that refuses us (BLOCKED_ACCESS) can't be helped by consent, so it only offers the last two.
*/
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, PencilLine, ShieldAlert } from "lucide-react";
import type { ApiError } from "@/lib/api/client";
import { CONSENTABLE_CODES, friendlyError } from "@/lib/api/messages";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { UploadPanel, type UploadResult } from "./UploadPanel";

export function BlockedPanel({
  error,
  url,
  onContinue,
  onResult,
  onManual,
}: {
  error: ApiError;
  url: string;
  /** Re-run the scrape with the owner's consent (the page then shows progress) */
  onContinue: () => void;
  onResult: (result: UploadResult) => void;
  onManual: () => void;
}) {
  const [consented, setConsented] = useState(false);
  const canContinue = CONSENTABLE_CODES.has(error.code);
  const friendly = friendlyError(error.code);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="space-y-5 p-5 sm:p-6" aria-labelledby="blocked-title">
        <div className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-warning-soft text-warning">
            <ShieldAlert className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="blocked-title" className="font-semibold">
              This site limits automated access.
            </h2>
            <p className="mt-1 text-sm text-muted">
              You can still build your knowledge base by uploading screenshots or files, or pasting the content yourself.
            </p>
            <p className="mt-2 text-xs text-subtle">Why: {error.message || friendly.text}</p>
          </div>
        </div>

        <ConsentCheckbox checked={consented} onChange={setConsented} />

        {canContinue && (
          <div className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Are you the owner, or do you have the owner&apos;s permission?</p>
              <p className="mt-0.5 text-xs text-muted">We&apos;ll record your permission and read the site politely, one page at a time.</p>
            </div>
            <Button onClick={onContinue} disabled={!consented} icon={<ArrowRight className="size-4" />}>
              Continue scraping
            </Button>
          </div>
        )}

        <div>
          <p className="mb-3 text-sm font-semibold">{canContinue ? "Or add the content yourself" : "Add the content yourself"}</p>
          <UploadPanel consented={consented} url={url} onResult={onResult} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-4">
          <p className="text-xs text-muted">Not the owner? You can still type in what you know.</p>
          <Button variant="secondary" size="sm" onClick={onManual} icon={<PencilLine className="size-3.5" />}>
            Add info manually
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
