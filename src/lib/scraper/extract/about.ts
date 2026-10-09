import type { PageContext } from "./types";
import { clean, setField } from "../merge";
import { textOf } from "./text";

// "Founded in 2013", "Established 1998", "Since 2005", "serving Las Vegas since 1987"
const FOUNDED = /\b(?:founded|established|est\.|started|opened|began|launched|in business|serving [\w\s]{0,30}?since|since)\s*(?:in\s+)?(?:the year\s+)?((?:18|19|20)\d{2})\b/i;
// Phrases that usually open an origin story. Plain "started"/"journey" are too common
// ("get started", "your journey") to count on their own.
const STORY = /\b(founded|established|our story|was born|humble beginnings|family[- ]owned|mom[- ]and[- ]pop|(began|started|opened) (in|back in) (18|19|20)\d{2}|since (18|19|20)\d{2})\b/i;

/** Founding year and founding story from about pages (and the homepage). */
export function extractAbout(ctx: PageContext): void {
  const { $text: $, url, kb, category, visibleText } = ctx;
  if (!["home", "about", "team"].includes(category)) return;

  const year = visibleText.match(FOUNDED)?.[1];
  const y = year ? Number(year) : NaN;
  // "Scraped" beats the copyright-range guess, which is only "inferred".
  if (y >= 1800 && y <= new Date().getFullYear()) setField(kb.company.yearFounded, y, url);

  // The first substantial paragraph that tells the origin story. Real <p> tags first;
  // page builders that use bare <div>s only count if the div is paragraph-sized.
  const paragraphs = $("p").toArray().map((el) => textOf($(el)));
  const leafDivs = $("div")
    .toArray()
    .filter((el) => !$(el).find("div, p, ul, nav, header, footer").length)
    .map((el) => textOf($(el)));
  const story = [...paragraphs, ...leafDivs].find((t) => t.length >= 80 && t.length <= 1200 && STORY.test(t));
  setField(kb.company.foundingStory, clean(story, 1200), url);
}
