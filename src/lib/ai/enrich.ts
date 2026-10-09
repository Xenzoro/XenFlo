/**
 * The one entry point for AI enrichment (CLAUDE.md: "All AI work goes through one function").
 *
 * Live mode (key + passcode + quota left): one text call (prompts/understand-business.v1.md,
 * reading page evidence) and one image call (logo-vision.v1.md), in parallel. Every reply is
 * validated with Zod, then three code-level guards run on every suggestion:
 *   1. the confidence bar (confidence.ts): facts need "high" + 2 real evidence items
 *   2. the tiers (field-tiers.ts): tier 3 is never suggested, tier 1 is never replaced
 *   3. the owner: user-edited values, dismissed values and Not applicable fields are left alone
 * Preview mode (no key, no passcode, cap reached, both calls failed): keyword and CTA heuristics
 * ("inferred") plus labeled templates ("ai_mock"), through the same guards.
 *
 * Nothing is written here: the owner accepts or rejects every suggestion.
 */
import { createHash } from "node:crypto";
import type { KnowledgeBase } from "@/types/knowledge";
import type { CallUsage, EnrichResult, NotEnough, Suggestion } from "@/types/enrichment";
import { aiQuotaRemaining, getCachedEnrichment, putCachedEnrichment, takeAiQuota } from "@/lib/db/ai";
import { getAt } from "@/lib/utils/path";
import { aiConfig, LIMITS, liveAvailable } from "./config";
import { checkAnswer, type Answer } from "./confidence";
import { buildEvidence, estimateTokens, evidencePayload, type Evidence } from "./evidence";
import { filterByTier, valueKey } from "./field-tiers";
import { heuristicSuggestions } from "./heuristics";
import { pickImages, SCREENSHOT_PATHS, type ImageInput } from "./input";
import { mockSuggestions } from "./mock";
import { callOpenAi } from "./openai";
import { PROMPT_VERSIONS, textSystemPrompt, visionSystemPrompt } from "./prompts";
import { textOutputSchema, visionOutputSchema, type ListAnswer, type ScalarAnswer, type TextOutput, type VisionOutput } from "./schemas";

const MAX_LIST = 10;
export const RESCRAPE_HINT = "Re-scrape for better results.";

// Text-call answers -> knowledge base paths
const SCALARS: [keyof TextOutput, string, string][] = [
  ["industry", "company.industry", "Industry"],
  ["businessModel", "company.businessModel", "Business model"],
  ["companyRole", "company.companyRole", "Company role"],
  ["industryOutlook", "customers.industryOutlook", "Industry outlook"],
  ["pitch", "company.pitch", "Pitch"],
  ["writingStyle", "brand.writingStyle", "Writing style"],
  ["idealPersona", "customers.idealPersona", "Ideal customer"],
];
const LISTS: [keyof TextOutput, string, string][] = [
  ["industryGroupings", "customers.industryGroupings", "Industry groupings"],
  ["serviceLocations", "company.serviceLocations", "Service locations"],
  ["targetBuyers", "customers.targetBuyers", "Target buyers"],
  ["customerNeeds", "customers.customerNeeds", "Customer needs"],
  ["channels", "customers.channels", "Channels"],
  ["funnels", "customers.funnels", "Funnels"],
  ["contentThemes", "insights.contentThemes", "Content themes"],
  ["positioningSignals", "insights.positioningSignals", "Positioning"],
  ["communityValues", "insights.communityValues", "Community and values"],
  ["seasonalMessaging", "insights.seasonalMessaging", "Seasonal messaging"],
  ["contentPillars", "contentKit.contentPillars", "Content pillars"],
  ["socialHooks", "contentKit.socialHooks", "Social hooks"],
  ["hashtags", "contentKit.hashtags", "Hashtags"],
  ["emailSubjects", "contentKit.emailSubjects", "Email subject ideas"],
  ["blogIdeas", "contentKit.blogIdeas", "Blog ideas"],
];

/** `preview`: skip live AI (the caller checked the passcode, or the user chose preview). */
export async function enrich(kb: KnowledgeBase, opts: { preview?: boolean } = {}): Promise<EnrichResult> {
  const limit = aiConfig.dailyLimit;
  const notes: string[] = [];
  const system = textSystemPrompt();
  // Evidence gets whatever the input budget leaves after the system prompt.
  const evidence = buildEvidence(kb, LIMITS.inputTokens - estimateTokens(system) - 300);
  const hint = kb.crawl.pages.length && !evidence.hasPageEvidence ? RESCRAPE_HINT : null;

  if (!aiConfig.apiKey) return preview(kb, evidence, hint, ["Live AI isn't set up on this server, so this is a preview built from your own facts."]);
  if (!liveAvailable()) return preview(kb, evidence, hint, ["Live AI is turned off on this server (no passcode configured), so this is a preview."]);
  if (opts.preview) return preview(kb, evidence, hint, ["Preview mode: keyword matches and templates built from your own facts, not AI writing."]);

  const models = { text: aiConfig.textModel, vision: aiConfig.visionModel };
  const payload = evidencePayload(evidence);
  const images = await pickImages(kb);

  // Same prompts + models + input = same answer: reuse it instead of paying again.
  const cacheKey = hash({
    // The prompt text itself, so editing a prompt file never serves an old answer
    prompts: [PROMPT_VERSIONS, system, visionSystemPrompt()],
    models,
    payload,
    // Signed screenshot URLs change every time; key on the image itself, not the link
    images: images.map((i) => ({ ...i.meta, url: i.url.split("?")[0] })),
  });
  const cached = await getCachedEnrichment<Omit<EnrichResult, "remainingToday" | "cached" | "hint">>(cacheKey);
  if (cached) {
    return { ...cached, suggestions: guard(kb, cached.suggestions), hint, cached: true, remainingToday: await aiQuotaRemaining(limit) };
  }

  if (!(await takeAiQuota(limit))) {
    return preview(kb, evidence, hint, [`Today's live AI limit (${limit} runs) is used up, so this is a preview. It resets at midnight UTC.`]);
  }

  // One text call and (if there are usable images) one image call, at the same time.
  const [textRun, visionRun] = await Promise.allSettled([
    timed(() => runText(models.text, system, payload)),
    images.length ? timed(() => runVision(models.vision, images)) : Promise.reject(new Error("no raster images")),
  ]);

  const suggestions: Suggestion[] = [];
  const notEnough: NotEnough[] = [];
  const missing = new Set<string>();
  const usage: { text?: CallUsage; vision?: CallUsage } = {};

  if (textRun.status === "fulfilled") {
    const r = fromText(textRun.value.data, evidence, payload.toLowerCase(), kb, `ai:${models.text}`);
    suggestions.push(...r.suggestions);
    notEnough.push(...r.notEnough);
    usage.text = textRun.value.usage;
  } else {
    notes.push(`The understanding step didn't finish (${short(textRun.reason)}), so text fields were skipped.`);
  }
  if (visionRun.status === "fulfilled") {
    suggestions.push(...fromVision(visionRun.value.data, images, kb, `ai:${models.vision}`));
    visionRun.value.data.missing.forEach((m) => missing.add(m));
    usage.vision = visionRun.value.usage;
  } else if (images.length) {
    notes.push(`The image step didn't finish (${short(visionRun.reason)}), so art style and logo names were skipped.`);
  } else {
    notes.push("No logo or screenshot in a format AI can read (PNG, JPG, WebP), so art style was skipped.");
  }

  // Both failed: show the preview instead of an empty list.
  if (textRun.status === "rejected" && visionRun.status === "rejected") {
    return preview(kb, evidence, hint, [...notes, "Live AI didn't respond, so this is a preview built from your own facts."]);
  }

  const result = { mode: "live" as const, models, suggestions, notEnough, missing: [...missing], notes, usage };
  // Only cache complete answers, so a timeout isn't remembered for this version forever.
  const complete = textRun.status === "fulfilled" && (visionRun.status === "fulfilled" || !images.length);
  if (complete) await putCachedEnrichment(cacheKey, result, { knowledgeBaseId: kb.id, version: kb.version, models: `${models.text},${models.vision}` }).catch(() => {});
  return { ...result, suggestions: guard(kb, suggestions), hint, cached: false, remainingToday: await aiQuotaRemaining(limit) };
}

// ---------- Calls ----------

function runText(model: string, system: string, payload: string) {
  return callOpenAi<TextOutput>({
    model,
    system,
    content: [{ type: "input_text", text: `Website evidence (JSON):\n${payload}` }],
    schema: textOutputSchema,
    schemaName: "understand_business",
  });
}

function runVision(model: string, images: ImageInput[]) {
  return callOpenAi<VisionOutput>({
    model,
    system: visionSystemPrompt(),
    content: [
      { type: "input_text", text: `Images (JSON, in the same order as the attached images):\n${JSON.stringify(images.map((i) => i.meta))}` },
      ...images.map((i) => ({ type: "input_image" as const, image_url: i.url, detail: i.detail })),
    ],
    schema: visionOutputSchema,
    schemaName: "logo_vision",
  });
}

async function timed<T>(run: () => Promise<{ data: T; usage: { input: number; output: number } }>) {
  const started = Date.now();
  const { data, usage } = await run();
  return { data, usage: { ...usage, ms: Date.now() - started } };
}

// ---------- Turning answers into suggestions ----------

function fromText(out: TextOutput, e: Evidence, inputLower: string, kb: KnowledgeBase, source: string) {
  const suggestions: Suggestion[] = [];
  const notEnough: NotEnough[] = [];
  const consider = (path: string, label: string, answer: Answer, value: unknown, list: boolean) => {
    const values = list ? clean(value as string[]) : typeof value === "string" ? [value] : [];
    const empty = list ? values.length === 0 : value === null || value === undefined || isPlaceholder(value);
    if (empty) {
      // Asked but unanswered: tell the owner why the field stays empty
      if (answer.reason) notEnough.push({ path, label, confidence: answer.confidence, reason: answer.reason });
      return;
    }
    const verdict = checkAnswer(path, answer, values, e, inputLower);
    if (!verdict.ok) {
      notEnough.push({ path, label, confidence: answer.confidence, reason: verdict.reason });
      return;
    }
    suggestions.push({ path, label, value: list ? values : value, list, confidence: "ai_live", source, basedOn: verdict.evidence });
  };

  for (const [key, path, label] of SCALARS) {
    const a = out[key] as ScalarAnswer;
    consider(path, label, a, a.value?.trim() || null, false);
  }
  for (const [key, path, label] of LISTS) {
    const a = out[key] as ListAnswer;
    consider(path, label, a, a.values, true);
  }
  const vg = out.voiceGuide;
  const vgValue = vg.value && Object.values(vg.value).some((l) => l.length) ? vg.value : null;
  consider("contentKit.voiceGuide", "Voice guide", vg, vgValue, false);

  // Per-offering categories: one suggestion each, never applied automatically.
  if (e.offeringCategoryTask !== "none") {
    for (const c of out.offeringCategories) {
      const o = e.offerings.find((x) => x.name.toLowerCase() === c.offering.trim().toLowerCase());
      const current = o ? kb.offerings[o.index]?.value : null;
      if (!o || !current || !c.category.trim() || sameCategory(current.category, c.category)) continue;
      const path = `offerings.${o.index}.category`;
      const verdict = checkAnswer(path, { confidence: c.confidence, evidence: c.evidence, reason: null }, [c.category], e, inputLower);
      if (!verdict.ok) continue; // too many to list one by one; the rest stay as scraped
      suggestions.push({
        path,
        label: `Category: ${o.name}`,
        value: c.category.trim(),
        list: false,
        confidence: "ai_live",
        source,
        basedOn: verdict.evidence,
        offering: { index: o.index, name: o.name },
        dismissKey: valueKey(`${o.name}=>${c.category.trim()}`),
      });
    }
  }
  return { suggestions, notEnough };
}

const SCREENSHOT_LABELS: Record<string, string> = {
  "company.overview": "Overview (from screenshot)",
  "company.foundingStory": "Founding story (from screenshot)",
  "contact.phones": "Phone numbers (from screenshot)",
  "contact.emails": "Emails (from screenshot)",
};

function fromVision(out: VisionOutput, images: ImageInput[], kb: KnowledgeBase, source: string): Suggestion[] {
  const s: Suggestion[] = [];
  const base = { confidence: "ai_live" as const, source };
  const usable = out.images.filter((i) => !i.isBlankOrPlaceholder);
  const imageNote = (i: { index: number }) => `${images[i.index]?.meta.kind ?? "image"}: ${images[i.index]?.meta.fileNameClue ?? ""}`.trim();
  // Art style may come from a logo or the hero image, but never from blank or placeholder images.
  if (out.artStyle && !isPlaceholder(out.artStyle) && usable.length) {
    s.push({ ...base, path: "brand.artStyle", label: "Art style", value: out.artStyle, list: false, basedOn: usable.map(imageNote) });
  }

  // Names only from logos: a hero banner can show partners' or parent companies' names.
  // Brand names are read facts (tier 1), so the evidence quotes the text read in the logo.
  const company = (kb.company.name.value ?? kb.companyName).toLowerCase();
  const logos = usable.filter((i) => i.isLogo && images[i.index]?.meta.kind !== "og:image");
  const names = clean(logos.flatMap((i) => i.brandNames)).filter((n) => n.toLowerCase() !== company);
  if (names.length) {
    s.push({ ...base, path: "company.alternateNames", label: "Brand names read from logos", value: names, list: true, basedOn: names.map((n) => `logo text: “${n}”`) });
  }

  // Screenshot facts: only paths that screenshot was uploaded for, and only simple text fields.
  const allowed = new Set(images.flatMap((i) => i.meta.allowedPaths ?? []).filter((p) => SCREENSHOT_PATHS.includes(p)));
  const byPath = new Map<string, string[]>();
  for (const f of out.screenshotFacts) if (allowed.has(f.path) && f.value.trim()) byPath.set(f.path, [...(byPath.get(f.path) ?? []), f.value.trim()]);
  for (const [path, values] of byPath) {
    const list = path.startsWith("contact.");
    const value = list ? clean(values) : values[0];
    s.push({ ...base, path, label: SCREENSHOT_LABELS[path] ?? path, value, list, basedOn: (list ? (value as string[]) : [value as string]).map((v) => `screenshot: “${v}”`) });
  }
  return s;
}

/**
 * Everything a suggestion must pass before the owner sees it:
 * - never replace what the owner edited by hand; skip list items already there
 * - field tiers, dismissals and Not applicable (field-tiers.ts)
 */
export function guard(kb: KnowledgeBase, suggestions: Suggestion[]): Suggestion[] {
  const own = suggestions.flatMap((s) => {
    if (s.offering) {
      const f = kb.offerings[s.offering.index];
      const dismissed = (kb.dismissed ?? []).some((d) => d.path === "offerings.*.category" && d.key === s.dismissKey);
      return !f?.value || f.confidence === "user_edited" || dismissed ? [] : [s];
    }
    const current = getAt(kb, s.path) as { value: unknown; confidence: string } | { value: unknown }[] | undefined;
    if (!s.list) {
      const f = current as { confidence: string } | undefined;
      return f?.confidence === "user_edited" ? [] : [s];
    }
    const have = new Set(((current as { value: unknown }[]) ?? []).map((f) => String(f.value).toLowerCase()));
    const fresh = (s.value as string[]).filter((v) => !have.has(v.toLowerCase()));
    return fresh.length ? [{ ...s, value: fresh }] : [];
  });
  return filterByTier(own, kb);
}

async function preview(kb: KnowledgeBase, evidence: Evidence, hint: string | null, notes: string[]): Promise<EnrichResult> {
  // Heuristics first, so a keyword-matched industry wins over nothing; templates fill the creative fields.
  const heuristics = heuristicSuggestions(kb, evidence);
  const taken = new Set(heuristics.map((s) => s.path));
  return {
    mode: "mock",
    models: { text: null, vision: null },
    cached: false,
    suggestions: guard(kb, [...heuristics, ...mockSuggestions(kb).filter((s) => !taken.has(s.path))]),
    notEnough: [],
    missing: [],
    notes,
    hint,
    remainingToday: aiConfig.apiKey ? await aiQuotaRemaining(aiConfig.dailyLimit).catch(() => null) : null,
  };
}

// ---------- Small helpers ----------

/** "Minecraft Server Hosting" vs "Minecraft server hosting plan": the same category, not worth a suggestion. */
function sameCategory(current: string | null, suggested: string): boolean {
  if (!current) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\b(plans?|services?|packages?)\b/g, "").replace(/\s+/g, " ").trim();
  const [a, b] = [norm(current), norm(suggested)];
  return a === b || a.includes(b) || b.includes(a);
}

/** Models sometimes write "null" or "N/A" as text instead of a real null. */
function isPlaceholder(value: unknown): boolean {
  return typeof value === "string" && /^\s*(null|none|n\/?a|unknown|not available|-)?\s*$/i.test(value);
}

/** Trim, drop empties, placeholders and duplicates, cap the length. */
function clean(list: string[]): string[] {
  const seen = new Set<string>();
  return list
    .map((v) => v.trim())
    .filter((v) => v && !isPlaceholder(v) && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()))
    .slice(0, MAX_LIST);
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Error message for the notes, without leaking anything sensitive (no keys are in these). */
function short(reason: unknown): string {
  const msg = reason instanceof Error ? (reason.name === "AbortError" ? "timed out" : reason.message) : String(reason);
  return msg.slice(0, 120);
}
