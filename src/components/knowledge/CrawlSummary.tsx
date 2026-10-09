"use client";

/*
  After a scrape: one-line summary (pages crawled, time taken) that expands into
  the real crawl log from the response. "Looking for:" lines are highlighted because
  they show the adaptive crawl choosing pages to fill missing fields.
*/
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown } from "lucide-react";
import type { KnowledgeBase } from "@/types/knowledge";
import { Card } from "@/components/ui/Card";
import { CrawlLog } from "./CrawlLog";

export function CrawlSummary({ kb }: { kb: KnowledgeBase }) {
  const [open, setOpen] = useState(false);
  const pages = kb.crawl.pages.length;
  const seconds = Math.round(kb.crawl.durationMs / 1000);

  return (
    <Card className="px-4 py-3 sm:px-5">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 text-left" aria-expanded={open}>
        <CheckCircle2 className="size-5 shrink-0 text-success" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">Crawled {pages} {pages === 1 ? "page" : "pages"}</span>
          <span className="text-muted"> in {seconds}s · {kb.crawl.pendingUrls.length} more available</span>
        </span>
        <span className="hidden text-xs text-muted sm:inline">{open ? "Hide" : "Show"} crawl steps</span>
        <ChevronDown className={`size-4 text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="pt-3">
              <CrawlLog log={kb.crawl.log} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
