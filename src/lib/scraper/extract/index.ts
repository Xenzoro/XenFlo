import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { KnowledgeBase, PageCategory } from "@/types/knowledge";
import type { PageContext } from "./types";
import { readableDom } from "./text";
import { extractMeta } from "./meta";
import { extractJsonLd } from "./jsonld";
import { extractSocial } from "./social";
import { extractContact } from "./contact";
import { extractAbout } from "./about";
import { extractTestimonials } from "./testimonials";
import { extractPeople } from "./people";
import { extractOfferings } from "./offerings";
import { extractCtas } from "./ctas";
import { extractSignals } from "./signals";
import { extractPress } from "./press";
import { extractBranding } from "./branding";
import { extractTech } from "./tech";

export interface PageExtraction {
  title: string | null;
  /** Rough count of visible words, used to detect empty/JS-only pages */
  wordCount: number;
  $: CheerioAPI;
}

/**
 * Run every extractor on one page, writing results into the knowledge base.
 * `css` is passed for the homepage only (fonts and colors are site-wide).
 */
export function extractPage(
  html: string,
  url: string,
  category: PageCategory,
  kb: KnowledgeBase,
  css?: string,
): PageExtraction {
  const $ = cheerio.load(html);
  const $text = readableDom(html);
  const visibleText = $text("body").text().replace(/\s+/g, " ").trim();
  const ctx: PageContext = { $, $text, visibleText, url, category, kb, css };

  // Structured data first: it's the most trustworthy, and "first value wins".
  extractJsonLd(ctx);
  const { title } = extractMeta(ctx);
  extractSocial(ctx);
  extractContact(ctx);
  extractAbout(ctx);
  // Testimonials before people, so quote authors are tagged customer_partner first.
  extractTestimonials(ctx);
  extractPeople(ctx);
  extractOfferings(ctx);
  extractCtas(ctx);
  extractSignals(ctx);
  extractPress(ctx);
  extractBranding(ctx);
  extractTech(ctx);

  return { title, wordCount: visibleText ? visibleText.split(" ").length : 0, $ };
}
