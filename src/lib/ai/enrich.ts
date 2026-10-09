/**
 * The one entry point for AI enrichment (CLAUDE.md: "All AI work goes through one function").
 *
 * Live mode (key + passcode + quota left): one text call and one image call, in parallel,
 * using the prompts in /prompts. Every reply is validated with Zod. Anything that goes wrong
 * (no key, wrong setup, cap reached, timeout, bad reply) falls back to labeled preview output.
 *
 * Nothing is written here: the result is a list of suggestions the owner accepts or rejects.
 * Null answers never become suggestions, so unknown stays Missing.
 */
import { createHash } from "node:crypto";
import type { KnowledgeBase } from "@/types/knowledge";
import type { CallUsage, EnrichResult, Suggestion } from "@/types/enrichment";
import { aiQuotaRemaining, getCachedEnrichment, putCachedEnrichment, takeAiQuota } from "@/lib/db/ai";
import { getAt } from "@/lib/utils/path";
import { aiConfig, liveAvailable } from "./config";
import { buildTextInput, pickImages, SCREENSHOT_PATHS, type ImageInput } from "./input";
import { mockSuggestions } from "./mock";
import { callOpenAi } from "./openai";
import { PROMPT_VERSIONS, textSystemPrompt, visionSystemPrompt } from "./prompts";
import { textOutputSchema, visionOutputSchema, type TextOutput, type VisionOutput } from "./schemas";

const MAX_LIST = 10;

/** `preview`: skip live AI (the caller checked the passcode, or the user chose preview). */
export async function enrich(kb: KnowledgeBase, opts: { preview?: boolean } = {}): Promise<EnrichResult> {
  const limit = aiConfig.dailyLimit;
  const notes: string[] = [];

  if (!aiConfig.apiKey) return mock(kb, ["Live AI isn't set up on this server, so this is a preview built from templates."]);
  if (!liveAvailable()) return mock(kb, ["Live AI is turned off on this server (no passcode configured), so this is a preview."]);
  if (opts.preview) return mock(kb, ["Preview mode: these are templates built from your own facts, not AI writing."]);

  const models = { text: aiConfig.textModel, vision: aiConfig.visionModel };
  const textInput = buildTextInput(kb);
  const images = await pickImages(kb);

  // Same prompts + models + input = same answer: reuse it instead of paying again.
  const cacheKey = hash({
    // The prompt text itself, so editing a prompt file never serves an old answer
    prompts: [PROMPT_VERSIONS, textSystemPrompt(), visionSystemPrompt()],
    models,
    textInput,
    // Signed screenshot URLs change every time; key on the image itself, not the link
    images: images.map((i) => ({ ...i.meta, url: i.url.split("?")[0] })),
  });
  const cached = await getCachedEnrichment<Omit<EnrichResult, "remainingToday" | "cached">>(cacheKey);
  if (cached) {
    return { ...cached, suggestions: forThisKb(kb, cached.suggestions), cached: true, remainingToday: await aiQuotaRemaining(limit) };
  }

  if (!(await takeAiQuota(limit))) {
    return mock(kb, [`Today's live AI limit (${limit} runs) is used up, so this is a preview. It resets at midnight UTC.`]);
  }

  // One text call and (if there are usable images) one image call, at the same time.
  const [textRun, visionRun] = await Promise.allSettled([
    timed(() => runText(models.text, textInput)),
    images.length ? timed(() => runVision(models.vision, images)) : Promise.reject(new Error("no raster images")),
  ]);

  const suggestions: Suggestion[] = [];
  const missing = new Set<string>();
  const usage: { text?: CallUsage; vision?: CallUsage } = {};

  if (textRun.status === "fulfilled") {
    suggestions.push(...fromText(textRun.value.data, `ai:${models.text}`));
    textRun.value.data.missing.forEach((m) => missing.add(m));
    usage.text = textRun.value.usage;
  } else {
    notes.push(`The writing step didn't finish (${short(textRun.reason)}), so pitch, style, persona and Content Kit were skipped.`);
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
    return mock(kb, [...notes, "Live AI didn't respond, so this is a preview built from templates."]);
  }

  const result = { mode: "live" as const, models, suggestions, missing: [...missing], notes, usage };
  // Only cache complete answers, so a timeout isn't remembered for this version forever.
  const complete = textRun.status === "fulfilled" && (visionRun.status === "fulfilled" || !images.length);
  if (complete) await putCachedEnrichment(cacheKey, result, { knowledgeBaseId: kb.id, version: kb.version, models: `${models.text},${models.vision}` }).catch(() => {});
  return { ...result, suggestions: forThisKb(kb, suggestions), cached: false, remainingToday: await aiQuotaRemaining(limit) };
}

// ---------- Calls ----------

function runText(model: string, input: Record<string, unknown>) {
  return callOpenAi<TextOutput>({
    model,
    system: textSystemPrompt(),
    content: [{ type: "input_text", text: `Knowledge base facts (JSON):\n${JSON.stringify(input)}` }],
    schema: textOutputSchema,
    schemaName: "knowledge_enrichment",
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

function fromText(out: TextOutput, source: string): Suggestion[] {
  const s: Suggestion[] = [];
  const add = (path: string, label: string, value: unknown, list = false) => {
    if (value === null || value === undefined || isPlaceholder(value)) return; // unknown stays Missing
    const v = list ? clean(value as string[]) : value;
    if (list ? (v as string[]).length === 0 : typeof v === "string" && !v.trim()) return;
    s.push({ path, label, value: v, list, confidence: "ai_live", source, basedOn: out.basedOn });
  };
  add("company.pitch", "Pitch", out.pitch);
  add("brand.writingStyle", "Writing style", out.writingStyle);
  if (out.voiceGuide && Object.values(out.voiceGuide).some((l) => l.length)) add("contentKit.voiceGuide", "Voice guide", out.voiceGuide);
  add("customers.idealPersona", "Ideal customer", out.idealPersona);
  add("customers.customerNeeds", "Customer needs", out.customerNeeds, true);
  add("customers.targetBuyers", "Target buyers", out.targetBuyers, true);
  add("contentKit.contentPillars", "Content pillars", out.contentPillars, true);
  add("contentKit.socialHooks", "Social hooks", out.socialHooks, true);
  add("contentKit.hashtags", "Hashtags", out.hashtags, true);
  add("contentKit.emailSubjects", "Email subject ideas", out.emailSubjects, true);
  add("contentKit.blogIdeas", "Blog ideas", out.blogIdeas, true);
  return s;
}

const SCREENSHOT_LABELS: Record<string, string> = {
  "company.overview": "Overview (from screenshot)",
  "company.foundingStory": "Founding story (from screenshot)",
  "contact.phones": "Phone numbers (from screenshot)",
  "contact.emails": "Emails (from screenshot)",
};

function fromVision(out: VisionOutput, images: ImageInput[], kb: KnowledgeBase, source: string): Suggestion[] {
  const s: Suggestion[] = [];
  const base = { confidence: "ai_live" as const, source, basedOn: out.basedOn };
  const usable = out.images.filter((i) => !i.isBlankOrPlaceholder);
  // Art style may come from a logo or the hero image, but never from blank or placeholder images.
  if (out.artStyle && !isPlaceholder(out.artStyle) && usable.length) s.push({ ...base, path: "brand.artStyle", label: "Art style", value: out.artStyle, list: false });

  // Names only from logos: a hero banner can show partners' or parent companies' names.
  const company = (kb.company.name.value ?? kb.companyName).toLowerCase();
  const fromLogos = usable.filter((i) => i.isLogo && images[i.index]?.meta.kind !== "og:image").flatMap((i) => i.brandNames);
  const names = clean(fromLogos).filter((n) => n.toLowerCase() !== company);
  if (names.length) s.push({ ...base, path: "company.alternateNames", label: "Brand names read from logos", value: names, list: true });

  // Screenshot facts: only paths that screenshot was uploaded for, and only simple text fields.
  const allowed = new Set(images.flatMap((i) => i.meta.allowedPaths ?? []).filter((p) => SCREENSHOT_PATHS.includes(p)));
  const byPath = new Map<string, string[]>();
  for (const f of out.screenshotFacts) if (allowed.has(f.path) && f.value.trim()) byPath.set(f.path, [...(byPath.get(f.path) ?? []), f.value.trim()]);
  for (const [path, values] of byPath) {
    const list = path.startsWith("contact.");
    s.push({ ...base, path, label: SCREENSHOT_LABELS[path] ?? path, value: list ? clean(values) : values[0], list });
  }
  return s;
}

/**
 * Drop what this knowledge base shouldn't get: anything the owner edited by hand
 * (AI never overwrites the owner) and list items it already has.
 */
function forThisKb(kb: KnowledgeBase, suggestions: Suggestion[]): Suggestion[] {
  return suggestions.flatMap((s) => {
    const current = getAt(kb, s.path) as { value: unknown; confidence: string } | { value: unknown }[] | undefined;
    if (!s.list) {
      const f = current as { confidence: string } | undefined;
      return f?.confidence === "user_edited" ? [] : [s];
    }
    const have = new Set(((current as { value: unknown }[]) ?? []).map((f) => String(f.value).toLowerCase()));
    const fresh = (s.value as string[]).filter((v) => !have.has(v.toLowerCase()));
    return fresh.length ? [{ ...s, value: fresh }] : [];
  });
}

async function mock(kb: KnowledgeBase, notes: string[]): Promise<EnrichResult> {
  return {
    mode: "mock",
    models: { text: null, vision: null },
    cached: false,
    suggestions: forThisKb(kb, mockSuggestions(kb)),
    missing: [],
    notes,
    remainingToday: aiConfig.apiKey ? await aiQuotaRemaining(aiConfig.dailyLimit).catch(() => null) : null,
  };
}

// ---------- Small helpers ----------

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
