"use client";

/*
  Sources (advanced): what we crawled, the crawl log, how the score adds up,
  and "Dig deeper" to crawl more pages (up to the 30-page hard max).
*/
import { Check, Pickaxe, X } from "lucide-react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { SCORE_CHECKS } from "@/lib/scraper/score";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Card";
import { CrawlLog } from "../CrawlLog";
import { fieldName } from "../fieldLabels";

// Matches HARD_MAX_PAGES in src/lib/scraper/index.ts (not imported: that module pulls in server-only code)
const HARD_MAX_PAGES = 30;

export function SourcesTab({ onDigDeeper, digging }: { onDigDeeper: () => void; digging: boolean }) {
  const { kb, jumpTo, busy } = useKnowledge();
  if (!kb) return null;

  const pages = kb.crawl.pages;
  const atMax = pages.length >= HARD_MAX_PAGES;
  const nothingLeft = kb.crawl.pendingUrls.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard
        title="Dig deeper"
        subtitle={`${pages.length} of up to ${HARD_MAX_PAGES} pages crawled · ${kb.crawl.pendingUrls.length} more found`}
        className="lg:col-span-2"
        action={
          <Button onClick={onDigDeeper} loading={digging} disabled={busy || atMax || nothingLeft} icon={<Pickaxe className="size-4" />}>
            {digging ? "Digging…" : "Dig deeper"}
          </Button>
        }
      >
        <p className="text-sm text-muted">
          {atMax
            ? "We've read the maximum number of pages for this site."
            : nothingLeft
              ? "There are no more pages left to read."
              : "Read more pages, starting with the ones most likely to fill your missing fields. Your edits are kept."}
        </p>
      </SectionCard>

      <SectionCard title="Pages crawled" subtitle="Every page we read, in order">
        <ul className="max-h-96 divide-y divide-border-soft overflow-y-auto text-sm">
          {pages.map((p) => (
            <li key={p.url} className="flex items-center gap-2 py-2">
              <Badge tone={p.error || (p.status ?? 0) >= 400 ? "red" : "green"}>{p.status ?? "ERR"}</Badge>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:text-primary" title={p.url}>
                {p.title || new URL(p.url).pathname}
                <span className="block truncate text-xs text-subtle">{new URL(p.url).pathname}</span>
              </a>
              <Badge>{p.category}</Badge>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Completeness" subtitle={`Score ${kb.completeness.score} of 100: each field is worth points`}>
        <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
          {SCORE_CHECKS.map((c) => {
            const filled = !kb.completeness.missing.includes(c.path);
            return (
              <li key={c.path} className="flex items-center gap-2">
                {filled ? <Check className="size-4 text-success" /> : <X className="size-4 text-subtle" />}
                {filled ? (
                  <span className="flex-1">{fieldName(c.path)}</span>
                ) : (
                  <button type="button" onClick={() => jumpTo(c.path)} className="flex-1 text-left text-muted hover:text-primary">
                    {fieldName(c.path)}
                  </button>
                )}
                <span className={`text-xs tabular-nums ${filled ? "text-success" : "text-subtle"}`}>
                  {filled ? "+" : ""}
                  {c.weight}
                </span>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title="Crawl log" subtitle="Step by step, including what the adaptive crawl was looking for" className="lg:col-span-2">
        <CrawlLog log={kb.crawl.log} className="max-h-96" />
      </SectionCard>

      <SectionCard title="Upload consent" subtitle="Records of permission to use uploaded content" className="lg:col-span-2">
        {kb.consent ? (
          <p className="text-sm">
            Confirmed on {new Date(kb.consent.timestamp).toLocaleString()} via {kb.consent.method.replace("_", " ")}.
          </p>
        ) : (
          <p className="text-sm text-muted">No uploads yet, so no consent record.</p>
        )}
      </SectionCard>
    </div>
  );
}
