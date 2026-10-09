import type { CheerioAPI } from "cheerio";
import type { PageContext } from "./types";
import { addItem } from "../merge";
import { looksLikeAuthor, looksLikeName, splitAuthor, textOf } from "./text";

type El = ReturnType<CheerioAPI>;

const QUOTE_START = /^["“”„«']/;
const SECTION_HEADING = /testimonial|what .{0,30}(say|said)|reviews?|kind words|happy (customers|clients)|love us|feedback/i;
const CONTAINER = '[class*="testimonial" i], [class*="review" i], [id*="testimonial" i], [id*="review" i]';

/**
 * Customer quotes. We look for quote-shaped text (blockquotes, testimonial/review
 * containers, or short blocks that start with a quote mark) and then for the
 * author nearby. Authors become People tagged customer_partner, never team.
 */
export function extractTestimonials(ctx: PageContext): void {
  const { $text: $, url, kb, category } = ctx;
  const seen = new Set<unknown>();

  $("blockquote, q, h2, h3, h4, h5, p, div, span").each((_, node) => {
    const el = $(node);
    if (seen.has(node)) return;
    const raw = textOf(el);
    if (raw.length < 25 || raw.length > 700) return;

    const isQuoteTag = el.is("blockquote, q");
    const startsWithQuote = QUOTE_START.test(raw);
    if (!isQuoteTag && !startsWithQuote) return;
    // Use the innermost element: skip if a child holds the same quote.
    if (!isQuoteTag && el.children().toArray().some((c) => QUOTE_START.test(textOf($(c))) && textOf($(c)).length > raw.length * 0.8)) return;
    el.find("*").each((__, c) => {
      seen.add(c);
    });

    // An inline "— Name" at the end of the quote.
    let quote = raw;
    let attribution: string | null = null;
    const inline = raw.match(/^(.*["”])\s*[-–—~]\s*([A-Z][^"”]{2,80})$/);
    if (inline) {
      quote = inline[1];
      attribution = inline[2];
    }
    attribution ??= findAuthor($, el);

    const inContext = category === "testimonials" || el.closest(CONTAINER).length > 0 || underTestimonialHeading($, el);
    if (!attribution && !inContext) return;

    quote = quote.replace(/^["“”„«'\s]+|["“”»'\s]+$/g, "").trim();
    if (quote.length < 20) return;

    const parts = attribution ? splitAuthor(attribution) : null;
    addItem(
      kb.insights.testimonials,
      {
        quote,
        author: parts?.author ?? null,
        authorTitle: parts?.authorTitle ?? null,
        company: parts?.company ?? null,
        rating: ratingFrom(raw),
      },
      url,
      (v) => v.quote.toLowerCase().slice(0, 80),
    );

    // Testimonial authors are customers/partners. Kept out of the team on purpose.
    // Usernames ("Xmkzink") stay on the quote but aren't added as People.
    if (parts?.author && looksLikeName(parts.author)) {
      addItem(
        kb.people,
        {
          name: parts.author,
          title: parts.authorTitle,
          role: parts.company ? `Customer at ${parts.company}` : "Customer",
          bio: null,
          imageUrl: null,
          type: "customer_partner",
        },
        url,
        (v) => v.name.toLowerCase(),
      );
    }
  });
}

/** Look for the author in cite/figcaption/author elements, then in the next few siblings. */
function findAuthor($: CheerioAPI, el: El): string | null {
  const card = el.parent();
  const named = el.add(card).find('cite, figcaption, [class*="author" i], [class*="name" i]').first();
  const namedText = textOf(named);
  if (namedText && namedText.length <= 80 && looksLikeAuthor(splitAuthor(namedText).author)) return namedText;

  for (const start of [el, card]) {
    let sib = start.next();
    for (let i = 0; i < 3 && sib.length; i++, sib = sib.next()) {
      const t = textOf(sib);
      if (t && t.length <= 80 && looksLikeAuthor(splitAuthor(t).author)) return t;
    }
  }
  return null;
}

/** True if one of the nearby ancestor sections starts with a "Testimonials"-style heading. */
function underTestimonialHeading($: CheerioAPI, el: El): boolean {
  const ancestors = el.parents().slice(0, 6).toArray();
  return ancestors.some((a) => SECTION_HEADING.test(textOf($(a).find("h1, h2, h3").first())));
}

function ratingFrom(text: string): number | null {
  const m = text.match(/\b([1-5](?:\.\d)?)\s*(?:\/\s*5|out of 5|stars?)\b/i);
  return m ? Number(m[1]) : null;
}
