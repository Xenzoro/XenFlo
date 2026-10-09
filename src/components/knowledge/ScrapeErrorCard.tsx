"use client";

/*
  Friendly error card for a failed scrape (or a saved record that can't be opened).
  Blocked sites get BlockedPanel instead (see KnowledgeWorkspace).
*/
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import type { ApiError } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/messages";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** `onRetry` is optional: opening a missing saved record has nothing to retry. */
export function ScrapeErrorCard({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const friendly = friendlyError(error.code);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{friendly.title}</h2>
            <p className="mt-1 text-sm text-muted">{friendly.text}</p>
            {error.message && error.message !== friendly.text && <p className="mt-2 text-xs text-subtle">Details: {error.message}</p>}
            {onRetry && (
              <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        </div>

      </Card>
    </motion.div>
  );
}
