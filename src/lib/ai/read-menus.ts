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
import { menuSystemPrompt } from "./prompts";
import { menuOutputSchema, type MenuOutput } from "./schemas";

type Job = { source: MenuSource; mode: "vision" | "text" };
type Usage = { input: number; output: number; ms: number };

export async function readMenusWithAi(kb: KnowledgeBase): Promise<MenuReadResult> {
  const limit = aiConfig.dailyLimit;
  const plan = pickMenuSources(kb);
  const jobs: Job[] = [...plan.vision.map((v) => ({ source: v.source, mode: "vision" as const })), ...plan.text.map((source) => ({ source, mode: "text" as const }))];
  const base = { offerings: [], sources: [], read: 0, cachedCount: 0, remainingToday: await aiQuotaRemaining(limit).catch(() => null) };
  if (!jobs.length) {
    return { ...base, mode: "live", remaining: plan.skipped, notes: ["No menus left for AI to read. Menus over 20 MB can be added as screenshots."] };
  }

  const model = aiConfig.visionModel;
  const system = menuSystemPrompt();
  // Same prompt + model + menu = same answer. Keyed on the URL (Wix and most CMSs give a new file a new URL),
  // not the size, which is only known after the first download and would make the second run miss the cache.
  const keyFor = (j: Job) => hash({ system, model, url: j.source.url, text: j.mode === "text" ? hash(j.source.text) : null });
  const cached = await Promise.all(jobs.map((j) => getCachedEnrichment<MenuOutput>(keyFor(j)).catch(() => null)));
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
        const fresh = freshItems(kb, source.group, items).filter((it) => !added.some((a) => a.value?.name.toLowerCase() === it.item.name.toLowerCase() && a.value?.group === source.group));
        added.push(...fresh.map((it) => toField(kb, it, source, job)));
        if (source.status !== "read") source.status = "read_ai";
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
  };
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
