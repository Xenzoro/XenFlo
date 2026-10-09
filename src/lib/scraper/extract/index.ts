import * as cheerio from "cheerio";
import type { KnowledgeBase, PageCategory } from "@/types/knowledge";
import type { PageContext } from "./types";
import { extractMeta } from "./meta";
import { extractJsonLd } from "./jsonld";
import { extractSocial } from "./social";
import { extractContact } from "./contact";

export interface PageExtraction {
  title: string | null;
  /** Rough count of visible words, used to detect empty/JS-only pages */
  wordCount: number;
  $: cheerio.CheerioAPI;
}

/** Run every extractor on one page, writing results into the knowledge base. */
export function extractPage(html: string, url: string, category: PageCategory, kb: KnowledgeBase): PageExtraction {
  const $ = cheerio.load(html);
  const ctx: PageContext = { $, url, category, kb };

  // Structured data first: it's the most trustworthy, and "first value wins".
  extractJsonLd(ctx);
  const { title } = extractMeta(ctx);
  extractSocial(ctx);

  // Text-based extractors only look at what a visitor can read.
  const visible = cheerio.load(html);
  visible("script, style, noscript, svg, template, iframe").remove();
  const visibleText = visible("body").text().replace(/\s+/g, " ").trim();
  extractContact(ctx, visibleText);

  return { title, wordCount: visibleText ? visibleText.split(" ").length : 0, $ };
}
