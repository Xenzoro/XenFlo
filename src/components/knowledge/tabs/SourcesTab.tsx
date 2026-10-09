"use client";

/*
  Sources (advanced): what we crawled, the crawl log, how the score adds up,
  and "Dig deeper" to crawl more pages: up to 15 per click, up to the server's cap (MAX_CRAWL_PAGES, default 200).
*/
import { Check, Pickaxe, X } from "lucide-react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { SCORE_CHECKS } from "@/lib/scraper/score";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/utils/time";
import { CrawlLog } from "../CrawlLog";
import { UploadsList } from "../fallback/UploadsList";
import { fieldName } from "../fieldLabels";
import { MENU_STATUS_LABEL, waitingForAi } from "@/lib/utils/offerings";

const CONSENT_METHOD = {
  checkbox_upload: "ticked the permission box before uploading files",
  checkbox_paste: "ticked the permission box before pasting content",
  checkbox_scrape: "ticked the permission box to continue a scrape that robots.txt restricts",
} as const;

// The server stamps its cap on the record (kb.crawl.maxPages); records from before that use the default
const DEFAULT_MAX_PAGES = 200;

export function SourcesTab({ onDigDeeper, digging }: { onDigDeeper: () => void; digging: boolean }) {
  const { kb, jumpTo, setNotApplicable, busy } = useKnowledge();
  if (!kb) return null;

  const pages = kb.crawl.pages;
  const maxPages = kb.crawl.maxPages ?? DEFAULT_MAX_PAGES;
  const atMax = pages.length >= maxPages;
  const nothingLeft = kb.crawl.pendingUrls.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard
        title="Dig deeper"
        subtitle={`${pages.length} of up to ${maxPages} pages crawled · ${kb.crawl.pendingUrls.length} more found`}
        className="lg:col-span-2"
        action={
          <Button onClick={onDigDeeper} loading={digging} disabled={busy || atMax || nothingLeft} icon={<Pickaxe className="size-4" />}>
            {digging ? "Digging…" : `Dig deeper (${pages.length} of ${maxPages} pages)`}
          </Button>
        }
      >
        <p className="text-sm text-muted">
          {atMax
            ? `We've read the maximum of ${maxPages} pages for this site.`
            : nothingLeft
              ? "No more useful pages found."
              : "Reads up to 15 more pages per click, starting with the ones most likely to fill your missing fields. After 30 pages, only menus, locations, services, pricing, about and contact pages. Your edits are kept."}
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

      {(kb.crawl.menuSources ?? []).length > 0 && (
        <SectionCard title="Menus and price lists" subtitle="PDFs and images the crawl found, and what came of each" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-subtle">
                <tr>
                  <th className="py-1.5 pr-3 font-semibold">Menu</th>
                  <th className="py-1.5 pr-3 font-semibold">Kind</th>
                  <th className="py-1.5 pr-3 font-semibold">Found on</th>
                  <th className="py-1.5 pr-3 font-semibold">Status</th>
                  <th className="py-1.5 text-right font-semibold">Items</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {(kb.crawl.menuSources ?? []).map((m) => (
                  <tr key={m.url}>
                    <td className="max-w-[16rem] truncate py-2 pr-3">
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary" title={m.note ?? m.url}>
                        {m.group ?? m.label ?? "Menu"}
                      </a>
                    </td>
                    <td className="py-2 pr-3 text-muted">
                      {m.kind === "pdf" ? "PDF" : "Image"}
                      {m.pages ? ` · ${m.pages} p` : ""}
                      {m.bytes ? ` · ${(m.bytes / 1_048_576).toFixed(1)} MB` : ""}
                    </td>
                    <td className="py-2 pr-3 text-muted">{new URL(m.foundOn).pathname}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={m.status === "read" || m.status === "read_ai" ? "green" : waitingForAi(m) ? "purple" : "amber"}>{MENU_STATUS_LABEL[m.status]}</Badge>
                    </td>
                    <td className="py-2 text-right tabular-nums">{m.items}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Completeness" subtitle={`Score ${kb.completeness.score} of 100: each field is worth points`}>
        <ul className="max-h-96 space-y-1 overflow-y-auto text-sm">
          {SCORE_CHECKS.map((c) => {
            const filled = !kb.completeness.missing.includes(c.path);
            const na = (kb.notApplicable ?? []).includes(c.path);
            return (
              <li key={c.path} className="flex items-center gap-2">
                {filled ? <Check className="size-4 text-success" /> : <X className="size-4 text-subtle" />}
                {na ? (
                  <span className="flex flex-1 items-center gap-2">
                    {fieldName(c.path)}
                    <span className="rounded-full bg-page px-2 py-0.5 text-[10px] font-semibold text-muted">N/A</span>
                    <button type="button" onClick={() => setNotApplicable(c.path, false)} disabled={busy} className="text-xs text-primary hover:underline">
                      Undo
                    </button>
                  </span>
                ) : filled ? (
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

      <SectionCard title="Uploads" subtitle="Content you pasted or uploaded instead of scraping">
        <UploadsList uploads={kb.uploads ?? []} />
      </SectionCard>

      <SectionCard title="Permission" subtitle="Record of the owner's permission to use this content">
        {kb.consent ? (
          <p className="text-sm">
            <span className="font-medium">Confirmed</span> on {formatDateTime(kb.consent.timestamp)}: {CONSENT_METHOD[kb.consent.method]}. Saved with the knowledge base.
          </p>
        ) : (
          <p className="text-sm text-muted">No permission record needed yet (nothing uploaded, and robots.txt allowed the scrape).</p>
        )}
      </SectionCard>
    </div>
  );
}
