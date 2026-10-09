/**
 * Builds what the model sees, from knowledge base fields only (never raw pages).
 * Text input is capped at ~12k tokens: the most useful facts go first, and the long lists
 * (offerings, testimonials, FAQs...) are trimmed from the end until it fits.
 * Images are capped at 2: screenshots waiting for AI first, then the logo, then the hero.
 */
import type { KnowledgeBase } from "@/types/knowledge";
import { signedUploadUrl } from "@/lib/db/storage";
import { LIMITS } from "./config";

const vals = <T>(list: { value: T | null }[]): T[] => list.flatMap((f) => (f.value === null ? [] : [f.value]));
const short = (s: string | null | undefined, max = 600) => (s ? (s.length > max ? `${s.slice(0, max)}…` : s) : null);
/** Rough token count: ~4 characters per token for English text. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

export function buildTextInput(kb: KnowledgeBase): Record<string, unknown> {
  const c = kb.company;
  const input = {
    // 1. Core facts
    companyName: kb.companyName,
    overview: short(c.overview.value, 1200),
    industry: c.industry.value,
    city: c.mainAddress.value?.city ?? null,
    serviceLocations: vals(c.serviceLocations),
    yearFounded: c.yearFounded.value,
    // 2. About
    foundingStory: short(c.foundingStory.value, 1500),
    // 3. Services and products
    offerings: vals(kb.offerings).map((o) => ({ name: o.name, category: o.category, priceText: o.priceText, description: short(o.description, 200) })),
    differentiators: vals(kb.insights.differentiators),
    // 4. What customers say
    testimonials: vals(kb.insights.testimonials).map((t) => ({ quote: short(t.quote, 400), author: t.author, company: t.company })),
    // 5. Questions customers ask
    faqs: vals(kb.insights.faqs).map((f) => ({ question: f.question, answer: short(f.answer, 400) })),
    // 6. Everything else
    trustSignals: vals(kb.insights.trustSignals),
    promotions: vals(kb.insights.promotions),
    contentThemes: vals(kb.insights.contentThemes),
    ctas: vals(kb.customers.ctas).map((c) => c.text),
    existingTargetBuyers: vals(kb.customers.targetBuyers),
  };

  // Trim the lowest-priority lists first, one item at a time, until we're under budget.
  const trimOrder = ["ctas", "contentThemes", "trustSignals", "faqs", "testimonials", "offerings", "differentiators"] as const;
  const budget = LIMITS.inputTokens - 4_000; // leave room for the system prompt (~4k tokens)
  for (const key of trimOrder) {
    const list = input[key] as unknown[];
    while (list.length > 0 && estimateTokens(JSON.stringify(input)) > budget) list.pop();
  }
  return input;
}

// ---------- Images ----------

/** Screenshot facts may only fill these simple text fields. */
export const SCREENSHOT_PATHS = ["company.overview", "company.foundingStory", "contact.phones", "contact.emails"];
// OpenAI vision reads PNG, JPEG, WebP and GIF, not SVG or ICO.
const RASTER = /\.(png|jpe?g|webp|gif)(\?|$)/i;
const LOGO_ORDER = ["header logo", "logo image", "json-ld logo", "header image", "apple-touch-icon"];

export interface ImageInput {
  url: string;
  detail: "low" | "high";
  meta: { index: number; kind: string; alt: string | null; fileNameClue: string | null; allowedPaths?: string[] };
}

export async function pickImages(kb: KnowledgeBase): Promise<ImageInput[]> {
  const images: ImageInput[] = [];
  const add = (url: string, detail: "low" | "high", kind: string, alt: string | null, allowedPaths?: string[]) => {
    if (images.length >= LIMITS.images) return;
    const file = decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? "");
    images.push({ url, detail, meta: { index: images.length, kind, alt, fileNameClue: file || null, allowedPaths } });
  };

  // Screenshots waiting for AI are text-heavy (menus, about pages), so they get high detail.
  for (const upload of kb.uploads) {
    const fields = upload.needsAiFields.filter((f) => SCREENSHOT_PATHS.includes(f));
    if (upload.kind !== "screenshot" || !upload.path || !upload.needsAiFields.length) continue;
    try {
      add(await signedUploadUrl(upload.path), "high", "screenshot", upload.name, fields);
    } catch {
      // Storage not configured or file gone: skip it
    }
  }

  const logos = vals(kb.brand.logos).filter((l) => RASTER.test(l.url));
  logos.sort((a, b) => rank(a.kind) - rank(b.kind));
  if (logos[0]) add(logos[0].url, "low", logos[0].kind, logos[0].alt);

  const hero = vals(kb.brand.logos).find((l) => l.kind === "og:image" && RASTER.test(l.url));
  if (hero) add(hero.url, "low", "og:image", hero.alt);
  return images;
}

function rank(kind: string): number {
  const i = LOGO_ORDER.indexOf(kind);
  return i === -1 ? 99 : i;
}
