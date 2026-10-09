"use client";

/*
  Shown while /api/scrape runs. The API answers once at the end (no streaming), so while
  we wait we walk through the scraper's real stages on a typical timeline, with an
  elapsed-time counter. The actual log from the response is shown afterwards in CrawlSummary.
*/
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Card, SectionLabel } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";

// The scraper's stages (see src/lib/scraper/index.ts) and roughly when each starts, in seconds.
const STAGES = [
  { at: 0, label: "Checking robots.txt" },
  { at: 1.5, label: "Fetching homepage" },
  { at: 3.5, label: "Discovering pages (links and sitemap)" },
  { at: 6, label: "Crawling priority pages" },
  { at: 14, label: "Looking for missing info on other pages" },
  { at: 24, label: "Extracting and scoring" },
];

export function ScrapeProgress({ url, title = "Building your knowledge base" }: { url: string; title?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const t = window.setInterval(() => setElapsed((Date.now() - start) / 1000), 250);
    return () => window.clearInterval(t);
  }, []);

  // Current stage = the last one whose start time has passed
  const current = STAGES.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <Card className="overflow-hidden p-5 sm:p-6" aria-live="polite">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <SectionLabel>Scraping</SectionLabel>
            <h2 className="mt-1 text-lg font-bold">{title}</h2>
            <p className="truncate text-xs text-muted">{url}</p>
          </div>
          <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold tabular-nums text-primary">{Math.floor(elapsed)}s</span>
        </div>

        {/* Indeterminate shimmer bar */}
        <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-primary-soft">
          <motion.div
            className="absolute inset-y-0 w-1/3 rounded-full bg-primary"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <ol className="mt-5 space-y-2.5">
          {STAGES.map((s, i) => (
            <motion.li
              key={s.label}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: i <= current ? 1 : 0.4, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3 text-sm"
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  i < current ? "bg-success text-white" : i === current ? "bg-primary-soft text-primary" : "bg-page text-subtle",
                )}
              >
                {i < current ? <Check className="size-3" /> : i === current ? <Loader2 className="size-3 animate-spin" /> : null}
              </span>
              <span className={cn(i === current && "font-medium")}>{s.label}</span>
            </motion.li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-subtle">
          {elapsed > 45 ? "Still working: bigger sites take a little longer." : "This usually takes 20 to 40 seconds. We crawl politely, one or two pages at a time."}
        </p>
      </Card>
    </motion.div>
  );
}
