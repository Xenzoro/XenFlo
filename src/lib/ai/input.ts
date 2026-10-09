/**
 * Images for the vision call: screenshots waiting for AI first, then the logo, then the hero (2 in all),
 * plus up to 12 more logos at low detail (a restaurant group's logo grid, for brand names). (The text call's input is built in evidence.ts.)
 */
import type { KnowledgeBase } from "@/types/knowledge";
import { signedUploadUrl } from "@/lib/db/storage";
import { LIMITS } from "./config";

const vals = <T>(list: { value: T | null }[]): T[] => list.flatMap((f) => (f.value === null ? [] : [f.value]));

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

  // The rest of the logos, e.g. a restaurant group's grid of brand logos: low detail is enough to read a name.
  // Their names come back as "Brand names read from logos" and feed the brand list (menus/brands.ts).
  const used = new Set(images.map((i) => i.url));
  for (const l of logos.filter((x) => x.kind === "logo image" && !used.has(x.url)).slice(0, LIMITS.logoGrid)) {
    const file = decodeURIComponent(l.url.split(/[?#]/)[0].split("/").pop() ?? "");
    images.push({ url: l.url, detail: "low", meta: { index: images.length, kind: "logo image", alt: l.alt, fileNameClue: file || null } });
  }
  return images;
}

function rank(kind: string): number {
  const i = LOGO_ORDER.indexOf(kind);
  return i === -1 ? 99 : i;
}
