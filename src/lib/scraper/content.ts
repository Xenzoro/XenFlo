/*
  Upload fallback: build knowledge from content the user pasted or uploaded instead of
  a crawl. The text or HTML goes through exactly the same extractors as a scraped page
  (extractPage), so the results look and score the same. Nothing is fetched.

  Every field this run writes is re-labeled with source "upload:<name>", so the Sources
  tab and the confidence badges show it came from the user's content, not the website.
*/
import type { KnowledgeBase, UploadRecord } from "@/types/knowledge";
import { forEachField } from "@/lib/utils/fields";
import { ScrapeError } from "./errors";
import { extractPage } from "./extract";
import { setField } from "./merge";
import { scoreCompleteness } from "./score";
import { splitSections, storyFromSections, textToHtml } from "./text-structure";

export const MAX_CONTENT_CHARS = 200_000;
// Used only so relative links in pasted HTML resolve; never requested
const FALLBACK_BASE = "https://uploaded.content/";

export interface ContentInput {
  kind: "text" | "html";
  content: string;
  /** File name, or "pasted-text" */
  name: string;
}

/** Add pasted or uploaded content to a knowledge base. Existing values win ("first value wins"). */
export function extractContent(kb: KnowledgeBase, input: ContentInput): KnowledgeBase {
  if (input.content.length > MAX_CONTENT_CHARS) throw new ScrapeError("TOO_LARGE", "That's more text than we can read at once (200,000 characters max).");
  const out = structuredClone(kb);
  const id = crypto.randomUUID();
  let base = FALLBACK_BASE;
  try {
    base = new URL("/", out.url).toString();
  } catch {
    // no site URL (content-only knowledge base)
  }
  // A unique pseudo page URL, so we can find exactly the fields this run wrote
  const pageUrl = new URL(`/__upload/${id}`, base).toString();
  const html = input.kind === "html" ? input.content : textToHtml(input.content);
  // A section the user labeled "Our story" beats the extractor's guess (first value wins, so set it first)
  if (input.kind === "text") setField(out.company.foundingStory, storyFromSections(splitSections(input.content)), pageUrl);

  const result = extractPage(html, pageUrl, "home", out);
  if (result.wordCount < 3) throw new ScrapeError("NO_CONTENT", "We couldn't find any readable text in that content.");

  const source = `upload:${input.name}`;
  forEachField(out, (f) => {
    if (f.source === pageUrl) f.source = source;
  });

  const now = new Date().toISOString();
  const upload: UploadRecord = { id, kind: input.kind, name: input.name, size: input.content.length, path: null, uploadedAt: now, needsAiFields: [] };
  out.uploads = [...(out.uploads ?? []), upload];
  out.crawl.log.push({ at: now, level: "info", message: `Read ${input.kind === "html" ? "HTML" : "text"} from ${input.name} (${result.wordCount} words)` });
  out.companyName = out.company.name.value ?? out.companyName;
  out.completeness = scoreCompleteness(out);
  out.updatedAt = now;
  return out;
}
