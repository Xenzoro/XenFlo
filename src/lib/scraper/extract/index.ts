import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { KnowledgeBase, PageCategory } from "@/types/knowledge";
import type { PageContext } from "./types";
import { imageClue, isDescriptive, readableDom, textLines, textOf } from "./text";
import { extractMeta, meta } from "./meta";
import { extractJsonLd } from "./jsonld";
import { extractAddresses } from "./address";
import { extractSocial } from "./social";
import { extractContact } from "./contact";
import { extractAbout } from "./about";
import { extractTestimonials } from "./testimonials";
import { extractPeople } from "./people";
import { extractOfferings } from "./offerings";
import { extractMenuSources } from "./menu-sources";
import { extractCtas } from "./ctas";
import { extractSignals } from "./signals";
import { extractPress } from "./press";
import { extractBranding } from "./branding";
import { extractTech } from "./tech";

/** What the page says about itself, kept on the crawl record as evidence for AI enrichment. */
export interface PageEvidence {
  metaDescription: string | null;
  headings: string[];
  imageAlts: string[];
}

export interface PageExtraction {
  title: string | null;
  evidence: PageEvidence;
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
  const ctx: PageContext = { $, $text, visibleText, lines: textLines($text), url, category, kb, css };

  // Structured data first: it's the most trustworthy, and "first value wins".
  extractJsonLd(ctx);
  extractAddresses(ctx); // after JSON-LD, so a structured address wins
  const { title } = extractMeta(ctx);
  extractSocial(ctx);
  extractContact(ctx);
  extractAbout(ctx);
  // Testimonials before people, so quote authors are tagged customer_partner first.
  extractTestimonials(ctx);
  extractPeople(ctx);
  extractOfferings(ctx);
  extractMenuSources(ctx);
  extractCtas(ctx);
  extractSignals(ctx);
  extractPress(ctx);
  extractBranding(ctx);
  extractTech(ctx);

  return { title, evidence: pageEvidence(ctx), wordCount: visibleText ? visibleText.split(" ").length : 0, $ };
}

const MAX_HEADINGS = 12;
const MAX_ALTS = 10;

function pageEvidence(ctx: PageContext): PageEvidence {
  const { $, $text } = ctx;
  const headings = [...new Set($text("h1, h2, h3").map((_, el) => textOf($text(el)).slice(0, 120)).get().filter((t) => t.length >= 3))].slice(0, MAX_HEADINGS);
  // Alt text, or the cleaned file name when there's none ("Sumo Henderson_Logo.png" -> "Sumo Henderson")
  const alts = $("img")
    .map((_, el) => imageClue($(el).attr("src") ?? $(el).attr("data-src"), $(el).attr("alt")))
    .get()
    .filter((t): t is string => !!t && !isDescriptive(t));
  return { metaDescription: meta(ctx, "description") ?? meta(ctx, "og:description"), headings, imageAlts: [...new Set(alts)].slice(0, MAX_ALTS) };
}
