/**
 * "Read menus with AI" (Phase 10): its own button and route (/api/menus), separate from
 * Enrich with AI so that one stays fast. One run:
 *   1. picks up to 8 pages/images (menus.ts), plus up to 4 messy-text menus
 *   2. reuses cached answers (cached per menu, so they cost nothing and use no quota)
 *   3. takes one unit of the daily quota if anything needs a live call
 *   4. reads every menu in parallel; nothing new starts after 40 s, and whatever finished is returned
 * A PDF the scraper never got to is downloaded and tried as text first (free); only a picture PDF goes to AI.
 * Items are added directly (no review step) with their badge and evidence; "Wrong? Remove" takes one out for good.
 */
import { createHash } from "node:crypto";
import type { Field, KnowledgeBase, MenuSource, Offering } from "@/types/knowledge";
import type { MenuReadResult } from "@/types/enrichment";
import { aiQuotaRemaining, getCachedEnrichment, putCachedEnrichment, takeAiQuota } from "@/lib/db/ai";
import { field } from "@/lib/utils/knowledge";
import { fetchBinary } from "@/lib/scraper/fetch";
import { locationFor } from "@/lib/scraper/menus/group";
import { MENU_LIMITS as SCRAPE_MENU_LIMITS, toOffering } from "@/lib/scraper/menus";
import { menuTextQuality, parseMenuLines } from "@/lib/scraper/menus/parse";
import { isPdf, readPdfText } from "@/lib/scraper/menus/pdf";
import { aiConfig, MENU_LIMITS } from "./config";
import { freshItems, itemsFromReader, pickMenuSources, type ReadItem } from "./menus";
import { callOpenAi, type Content } from "./openai";
import { LEGACY_MENU_PROMPTS, menuSystemPrompt } from "./prompts";
import { menuOutputSchema, type MenuOutput } from "./schemas";

type Job = { source: MenuSource; mode: "vision" | "text" };
type Usage = { input: number; output: number; ms: number };

/**
 * `cachedOnly`: only menus that already have a cached answer, with no AI call and no quota (free).
 * Used to bring back menus already read after a re-scrape, and for checking changes without live runs.
 */
export async function readMenusWithAi(kb: KnowledgeBase, opts: { cachedOnly?: boolean; only?: string[]; fresh?: boolean } = {}): Promise<MenuReadResult> {
  const limit = aiConfig.dailyLimit;
  // `only`: read just these menus again (e.g. after a prompt fix), even if they were read before.
  // `fresh`: ignore answers from earlier prompt versions for them.
  const target = opts.only?.length ? withOnly(kb, opts.only) : kb;
  // Cached-only looks at every menu waiting for AI (no cap: nothing is paid for)
  const plan = opts.cachedOnly ? pickMenuSources(target, Infinity, Infinity) : pickMenuSources(target);
  let jobs: Job[] = [...plan.vision.map((v) => ({ source: v.source, mode: "vision" as const })), ...plan.text.map((source) => ({ source, mode: "text" as const }))];
  const base = { offerings: [], sources: [], read: 0, cachedCount: 0, remainingToday: await aiQuotaRemaining(limit).catch(() => null) };
  if (!jobs.length) {
    return { ...base, mode: "live", remaining: plan.skipped, notes: ["No menus left for AI to read. Menus over 20 MB can be added as screenshots."] };
  }

  const model = aiConfig.visionModel;
  const system = menuSystemPrompt();
  // Same prompt + model + menu = same answer. Keyed on the URL (Wix and most CMSs give a new file a new URL),
  // not the size, which is only known after the first download and would make the second run miss the cache.
  const keyWith = (sys: string, j: Job) => hash({ system: sys, model, url: j.source.url, text: j.mode === "text" ? hash(j.source.text) : null });
  const keyFor = (j: Job) => keyWith(system, j);
  // Current prompt first, then answers from earlier prompt versions (still free) unless `fresh`
  const legacy = opts.fresh ? [] : LEGACY_MENU_PROMPTS.map((v) => menuSystemPrompt(v));
  const lookup = async (j: Job) => {
    for (const sys of [system, ...legacy]) {
      const hit = await getCachedEnrichment<MenuOutput>(keyWith(sys, j)).catch(() => null);
      if (hit) return hit;
    }
    return null;
  };
  let cached = await Promise.all(jobs.map(lookup));
  if (opts.cachedOnly) {
    jobs = jobs.filter((_, i) => cached[i]);
    cached = cached.filter(Boolean);
  }
  const quota = cached.every(Boolean) || (await takeAiQuota(limit));

  const notes: string[] = [];
  const started = Date.now();
  const usage: Usage[] = [];
  const added: Field<Offering>[] = [];
  const touched: MenuSource[] = [];
  let read = 0;
  let cachedCount = 0;
  let late = 0;
  let failed = 0;

  await Promise.all(
    jobs.map(async (job, i) => {
      const source = structuredClone(job.source);
      let out = cached[i];
      if (out) cachedCount++;
      else if (!quota) return;
      else if (Date.now() - started > MENU_LIMITS.deadlineMs) {
        late++;
        return;
      }
      try {
        let items: ReadItem[];
        if (out) {
          items = itemsFromReader(out, job.mode === "text" ? source.text : null);
        } else {
          const r = await readOne(job, source, model, system);
          if (r.free) {
            // A text PDF the scraper hadn't reached: read by the heuristics, no AI needed
            items = r.free;
          } else {
            out = r.out!;
            usage.push(r.usage!);
            await putCachedEnrichment(keyFor(job), out, { knowledgeBaseId: kb.id, version: kb.version, models: model }).catch(() => {});
            items = itemsFromReader(out, job.mode === "text" ? source.text : null);
          }
        }
        // Duplicates aren't dropped here: organizeMenus (in the browser) keeps the better copy and cites both
        const fresh = freshItems(kb, source.group, items);
        added.push(...fresh.map((it) => toField(kb, it, source, job)));
        if (source.status !== "read") source.status = "read_ai";
        source.readAs = job.mode === "text" || source.status === "read" ? "text" : "picture";
        source.items += fresh.length;
        source.note = out && !out.isMenu ? "AI says this isn't a menu." : (out?.unreadable ?? null);
        touched.push(source);
        read++;
      } catch (err) {
        failed++;
        source.note = `AI couldn't read it (${err instanceof Error && err.name === "AbortError" ? "timed out" : "error"}). Try again later.`;
        touched.push(source);
      }
    }),
  );

  const remaining = plan.skipped + jobs.length - read;
  if (!quota) notes.push(`Today's live AI limit (${limit} runs) is used up${cachedCount ? `; ${cachedCount} menu${s(cachedCount)} came from earlier runs` : ""}. It resets at midnight UTC.`);
  if (read) notes.push(`Read ${read} menu${s(read)}${cachedCount ? ` (${cachedCount} from earlier runs, free)` : ""} and added ${added.length} item${s(added.length)}.`);
  if (late) notes.push(`${late} menu${s(late)} didn't start in time.`);
  if (failed) notes.push(`${failed} menu${s(failed)} couldn't be read this time.`);
  if (remaining > 0) notes.push(`${remaining} more menu${s(remaining)} found. Run again to read the next batch; menus already read are free.`);

  const total = usage.reduce((a, u) => ({ input: a.input + u.input, output: a.output + u.output, ms: Math.max(a.ms, u.ms) }), { input: 0, output: 0, ms: 0 });
  return {
    mode: quota ? "live" : "unavailable",
    offerings: added,
    sources: touched,
    read,
    remaining,
    cachedCount,
    notes,
    remainingToday: await aiQuotaRemaining(limit).catch(() => null),
    usage: usage.length ? { ...total, calls: usage.length } : undefined,
    // A re-read replaces that menu's earlier items; only menus that were actually read again count
    replaces: opts.only?.length ? touched.filter((t) => t.status === "read_ai" || t.status === "read").map((t) => t.url) : undefined,
  };
}

/** Put the chosen menus back in line to be read (as if never read), and nothing else. */
function withOnly(kb: KnowledgeBase, urls: string[]): KnowledgeBase {
  const chosen = new Set(urls);
  const menuSources = (kb.crawl.menuSources ?? []).flatMap((s) => {
    if (!chosen.has(s.url)) return [];
    if (s.status !== "read_ai" && s.status !== "duplicate") return [s];
    // Read again from the picture (or its kept text, for a text copy)
    return [{ ...s, status: s.readAs === "text" && s.text ? ("messy" as const) : ("no_text" as const) }];
  });
  return { ...kb, crawl: { ...kb.crawl, menuSources } };
}

/** One live read. PDFs are downloaded with the scraper's checks and caps; a text PDF is read without AI. */
async function readOne(job: Job, source: MenuSource, model: string, system: string): Promise<{ out?: MenuOutput; usage?: Usage; free?: ReadItem[] }> {
  const about = { brand: source.group, kind: job.mode === "text" ? "text" : source.kind, label: source.label };
  const content: Content[] = [{ type: "input_text", text: `Menu (JSON):\n${JSON.stringify(about)}` }];

  if (job.mode === "text") {
    content.push({ type: "input_text", text: `Menu text:\n${source.text ?? ""}` });
  } else if (source.kind === "image") {
    content.push({ type: "input_image", image_url: source.url, detail: "high" });
  } else {
    const file = await fetchBinary(source.url, { maxBytes: SCRAPE_MENU_LIMITS.maxPdfBytes, timeoutMs: 10_000 });
    if (!isPdf(file.bytes)) throw new Error("not a PDF");
    source.bytes = file.bytes.byteLength;
    source.fileName ??= file.fileName;
    if (source.status === "found") {
      const pdf = await readPdfText(file.bytes, SCRAPE_MENU_LIMITS.maxPdfPages);
      source.pages = pdf.pages;
      const text = pdf.text.join("\n");
      const items = parseMenuLines(text.split("\n"));
      if (menuTextQuality(text, items) === "read") {
        source.status = "read";
        return { free: items.map((item) => ({ item, confidence: "scraped" as const })) };
      }
    }
    content.push({ type: "input_file", filename: "menu.pdf", file_data: `data:application/pdf;base64,${Buffer.from(file.bytes).toString("base64")}` });
  }

  const started = Date.now();
  const r = await callOpenAi<MenuOutput>({
    model,
    system,
    content,
    schema: menuOutputSchema,
    schemaName: "menu_reader",
    maxOutputTokens: MENU_LIMITS.outputTokens,
    timeoutMs: MENU_LIMITS.callTimeoutMs,
  });
  return { out: r.data, usage: { ...r.usage, ms: Date.now() - started } };
}

/** A read item -> an offering field with its source, badge and evidence. */
function toField(kb: KnowledgeBase, { item, confidence }: ReadItem, source: MenuSource, job: Job): Field<Offering> {
  const kind = job.mode === "text" ? "menu PDF text" : source.kind === "pdf" ? "menu PDF" : "menu image";
  const evidence = [`${kind}: ${source.url}`, `found on ${new URL(source.foundOn).pathname}`];
  const value: Offering = {
    ...toOffering(item, source, source.kind === "image" ? "image" : "pdf"),
    location: source.group ? locationFor(kb, source.foundOn) : null,
    // The section heading was read by AI too: the category stays a tier 2 suggestion with its own badge
    ...(confidence === "ai_live" && item.category ? { categoryConfidence: "ai_live" as const, categoryEvidence: evidence } : {}),
  };
  return { ...field(value, source.url, confidence), ...(confidence === "ai_live" ? { evidence } : {}) };
}

const s = (n: number) => (n === 1 ? "" : "s");

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}
