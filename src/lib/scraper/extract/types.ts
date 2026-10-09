import type { CheerioAPI } from "cheerio";
import type { KnowledgeBase, PageCategory } from "@/types/knowledge";

/** Everything an extractor needs about the page it's reading. */
export interface PageContext {
  /** The raw page (scripts, meta tags and JSON-LD intact) */
  $: CheerioAPI;
  /** Visible content only, with spaces between elements (see text.ts) */
  $text: CheerioAPI;
  /** All visible text, whitespace collapsed */
  visibleText: string;
  url: string;
  category: PageCategory;
  /** The knowledge base being built; extractors write into it */
  kb: KnowledgeBase;
  /** Homepage only: inline + external CSS text, for fonts and colors */
  css?: string;
}
