import type { CheerioAPI } from "cheerio";
import type { KnowledgeBase, PageCategory } from "@/types/knowledge";

/** Everything an extractor needs about the page it's reading. */
export interface PageContext {
  $: CheerioAPI;
  url: string;
  category: PageCategory;
  /** The knowledge base being built; extractors write into it */
  kb: KnowledgeBase;
}
