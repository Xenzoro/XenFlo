"use client";

/*
  Friendly error card for a failed scrape. Blocked sites get the upload fallback
  placeholder (the real upload flow is built in Phase 6).
*/
import { motion } from "framer-motion";
import { AlertTriangle, ShieldAlert, Upload } from "lucide-react";
import type { ApiError } from "@/lib/api/client";
import { BLOCKED_CODES, friendlyError } from "@/lib/api/messages";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** `onRetry` is optional: opening a missing saved record has nothing to retry. */
export function ScrapeErrorCard({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const friendly = friendlyError(error.code);
  const blocked = BLOCKED_CODES.has(error.code);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${blocked ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger"}`}>
            {blocked ? <ShieldAlert className="size-5" /> : <AlertTriangle className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{friendly.title}</h2>
            <p className="mt-1 text-sm text-muted">{friendly.text}</p>
            {error.message && error.message !== friendly.text && <p className="mt-2 text-xs text-subtle">Details: {error.message}</p>}
            {!blocked && onRetry && (
              <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        </div>

        {blocked && (
          <div className="mt-5 rounded-2xl border border-dashed border-primary/40 bg-primary-soft/50 p-5">
            <p className="text-sm font-medium">
              This site limits automated access. You can still build your knowledge base by uploading screenshots or files, or pasting the content yourself.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm" disabled icon={<Upload className="size-4" />}>
                Upload or paste content
              </Button>
              <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted">Coming soon</span>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
