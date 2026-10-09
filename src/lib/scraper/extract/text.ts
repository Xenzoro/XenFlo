import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";

/*
  Text helpers shared by the extractors.
  Cheerio's .text() glues neighboring elements together ("4 GB" + "RAM" -> "4 GBRAM"),
  so we build a second copy of each page with spaces between elements and no
  scripts/styles. Extractors that read human text use that copy.
*/

// Block elements end a line; inline elements just need a space so words don't glue together.
const BLOCKS = "p, div, li, td, th, dt, dd, h1, h2, h3, h4, h5, h6, section, article, header, footer, blockquote, figcaption, address, tr";
const INLINE = "span, a, button, label, strong, em, b, small, cite";

/**
 * A copy of the page with only visible content, spaces between inline elements and
 * line breaks after <br> and block elements, so "street<br>city, ST 12345" stays two lines.
 */
export function readableDom(html: string): CheerioAPI {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, template, iframe, link, meta").remove();
  $("br").replaceWith("\n");
  $(BLOCKS).append("\n");
  $(INLINE).append(" ");
  return $;
}

/** The readable copy as trimmed lines, spaces collapsed within each line, blank lines dropped. */
export function textLines($text: CheerioAPI): string[] {
  return $text("body")
    .text()
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Element text with whitespace collapsed. */
export function textOf($el: { text(): string }): string {
  return $el.text().replace(/\s+/g, " ").trim();
}

/** Split text into sentence-ish chunks no longer than maxLength. */
export function sentences(text: string, maxLength = 200): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])|\s{2,}|\s[|•·]\s/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= maxLength);
}

// Phrases that are capitalized like names but aren't people.
const NOT_NAMES = /\b(read more|learn more|contact|about|our|the|services?|team|home|privacy|terms|hosting|server|support|company|products?|pricing|reviews?|testimonials?|faq|blog|news|latest|updates?|guides?|new|icon|login|sign|get|view|all|inc|llc|ltd|corp)\b/i;

/**
 * "Jane Doe", "Mary-Kate O'Neil", "Jayson M." -> true. Headlines and buttons -> false.
 * `allowSingle` accepts one-word names ("Aaron") for places where other clues
 * (a job title in the same card) already suggest a person.
 */
export function looksLikeName(text: string, { allowSingle = false } = {}): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 40 || /\d|[@:!?]/.test(t) || NOT_NAMES.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < (allowSingle ? 1 : 2) || words.length > 4) return false;
  // Each word: Capitalized ("Jane"), an initial ("M."), or a lowercase particle ("van", "de").
  const ok = words.every((w) => /^[A-Z][a-zA-Z'’-]+\.?$|^[A-Z]\.$|^(van|de|der|da|di|la|le|von|del)$/.test(w));
  return ok;
}

/** A testimonial author: a real-looking name, or a short username like "Xmkzink". */
export function looksLikeAuthor(text: string): boolean {
  const t = text.trim();
  return looksLikeName(t) || (/^[A-Za-z][\w.-]{2,24}$/.test(t) && !NOT_NAMES.test(t));
}

/**
 * Split an attribution like "— Jane Doe, Owner at Acme Bakery" into parts.
 * Returns the cleaned author plus optional title and company.
 */
export function splitAuthor(raw: string): { author: string; authorTitle: string | null; company: string | null } {
  const t = raw.replace(/^[\s\-–—~]+/, "").replace(/\s+/g, " ").trim();
  const [name, ...rest] = t.split(/\s*[,|]\s*|\s+[-–—]\s+/);
  const tail = rest.join(", ").trim();
  if (!tail) return { author: name, authorTitle: null, company: null };
  // "Owner at Acme" / "CEO of Acme" / "CEO, Acme"
  const atMatch = tail.match(/^(.*?)\s+(?:at|of|@)\s+(.+)$/i);
  if (atMatch) return { author: name, authorTitle: atMatch[1], company: atMatch[2] };
  const parts = tail.split(/\s*,\s*/);
  if (parts.length >= 2) return { author: name, authorTitle: parts[0], company: parts.slice(1).join(", ") };
  // One extra part: decide whether it's a job title or a company name.
  const isTitle = /owner|founder|ceo|cto|manager|director|president|chef|customer|client|member|player|parent|student/i.test(tail);
  return { author: name, authorTitle: isTitle ? tail : null, company: isTitle ? null : tail };
}

// File-name words that describe the image, not what's in it.
const FILE_NOISE = /\b(logo|logos|img|image|images|photo|pic|final|copy|new|web|site|header|footer|icon|favicon|small|large|thumb|thumbnail|retina|white|black|dark|light|color|colour|transparent|trans|full|main|scaled|cropped|edited|v\d+|\d+x\d+|@\dx)\b/gi;

/**
 * A human-readable clue from an image's alt text or file name, without AI.
 * "Sumo Henderson_Logo.png" -> "Sumo Henderson". Hash-like names (Wix "e381d2_4aa3...~mv2.jpg",
 * UUIDs, camera files like IMG_1234) return null.
 */
export function imageClue(src: string | undefined, alt: string | undefined): string | null {
  const fromAlt = cleanClue(alt ?? "");
  if (fromAlt) return fromAlt;
  if (!src || src.startsWith("data:")) return null;
  let file: string;
  try {
    file = decodeURIComponent(new URL(src, "https://x.invalid").pathname.split("/").pop() ?? "");
  } catch {
    return null;
  }
  file = file.replace(/\.[a-z0-9]{2,5}$/i, ""); // extension
  if (/~mv2|^[a-f0-9_-]{16,}$|[a-f0-9]{12,}|^(img|dsc|pxl|screenshot)[_-]?\d/i.test(file)) return null;
  return cleanClue(file);
}

function cleanClue(text: string): string | null {
  const out = text
    .replace(/\.(png|jpe?g|gif|webp|svg|avif)$/i, "")
    .replace(/(?<=[a-z])logo\b/gi, " ") // "dragonfactorylogo" -> "dragonfactory"
    // Separators first: "_" counts as a word character, so "Loco_Logo" would hide "Logo" from \b.
    .replace(/[_+]+|(?<=\S)[-.](?=\S)/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2") // "NekoLoco" -> "Neko Loco"
    .replace(FILE_NOISE, " ")
    // Leftover numbering from exported files: "3.5x2 logos Page 01", "Neko Loco -01".
    .replace(/\bpage\s*\d+\b/gi, " ")
    .replace(/(^|\s)[-–#]?\d{1,3}\.?(?=\s|$)/g, " ")
    .replace(/^[\s\-–.,]+|[\s\-–.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Too short, all digits, or a generic word left over: not a useful clue.
  if (out.length < 3 || out.length > 60 || /^\d+$/.test(out) || /^(image|untitled|default|placeholder|banner|hero|background|bg)$/i.test(out)) {
    return null;
  }
  return titleCaseIfLower(out);
}

/**
 * True for alt text that describes a photo rather than naming something:
 * "Person holding a wrench in front of the goettl logo". Such text is never a brand name.
 */
export function isDescriptive(text: string): boolean {
  const t = text.trim();
  const words = t.split(/\s+/).filter((w) => /\w/.test(w));
  return (
    words.length > 6 ||
    /^(a|an|the|person|people|man|woman|men|women|team|photo|image|picture|close[- ]?up|view)\b/i.test(t) ||
    /\b(holding|standing|sitting|wearing|smiling|working|posing|shaking hands|in front of|next to)\b/i.test(t)
  );
}

/** "chojang" -> "Chojang"; leaves "McDonald's" or "SUSHI" alone. */
export function titleCaseIfLower(text: string): string {
  return text === text.toLowerCase() ? text.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : text;
}
