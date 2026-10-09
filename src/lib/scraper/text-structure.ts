/*
  Turns pasted plain text into HTML the existing extractors understand.

  Websites give the extractors structure (headings, JSON-LD, footers). Pasted text has none,
  so we recover the obvious parts from the text itself and describe them as JSON-LD:
    - sections: a short line without a final period, followed by more lines, is a heading
    - "FAQ" sections: a line ending in "?" is a question, the lines after it its answer
    - review sections: lines like  "Great service!" - Jenna R.
    - service/menu/pricing sections: lines like  Full Groom - $65. Bath, haircut...
    - team sections: lines like  Maria Ortega - Owner and lead groomer
    - a US-style street address anywhere:  4120 Sunset Road, Suite 6, Henderson, NV 89014
    - web addresses become links, so social profiles are picked up like on a real page
  Everything comes from the user's own words; nothing is guessed or invented.
*/

export interface TextSection {
  heading: string | null;
  lines: string[];
}

const HEADING_MAX = 60;
const isHeadingLike = (line: string) => line.length > 0 && line.length <= HEADING_MAX && !/[.!?:]$/.test(line) && !/\$\d/.test(line);

const FAQ_HEADING = /\b(faq|faqs|frequently asked|questions)\b/i;
const REVIEW_HEADING = /testimonial|reviews?|what .{0,30}(say|said)|kind words|happy (customers|clients)|feedback/i;
const SERVICE_HEADING = /\b(services?|menu|pricing|prices|packages?|products?|plans?|rates|treatments|classes)\b/i;
const TEAM_HEADING = /\b(team|staff|our people|meet (the|our)|leadership|founders?|owners?)\b/i;
const STORY_HEADING = /\b(our story|story|history|how we started|about us|who we are)\b/i;

const PRICE = /\$\s?(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)/;
const ADDRESS = /\b\d{1,6}\s+[A-Za-z0-9 .'-]+?,\s*(?:(?:Suite|Ste\.?|Unit|Apt\.?|#)\s*[\w-]+,\s*)?[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/;

/** Split text into sections at blank lines; a heading-like first line names the section. */
export function splitSections(text: string): TextSection[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) =>
      lines.length > 1 && isHeadingLike(lines[0]) ? { heading: lines[0], lines: lines.slice(1) } : { heading: null, lines },
    );
}

function faqItems(lines: string[]) {
  const items: { question: string; answer: string }[] = [];
  for (const line of lines) {
    if (line.endsWith("?")) items.push({ question: line, answer: "" });
    else if (items.length) items[items.length - 1].answer = `${items[items.length - 1].answer} ${line}`.trim();
  }
  return items.filter((i) => i.answer);
}

function reviewItems(lines: string[]) {
  // "quote" - Author   (straight or curly quotes, dash or em dash before the author)
  const re = /^["“](.+?)["”]\s*(?:[-–—]\s*(.+))?$/;
  return lines.flatMap((line) => {
    const m = line.match(re);
    return m ? [{ quote: m[1].trim(), author: m[2]?.trim() || null }] : [];
  });
}

function serviceItems(lines: string[]) {
  // Name - $65. Description   |   Name: $65   |   Name ($65)
  return lines.flatMap((line) => {
    const price = line.match(PRICE);
    if (!price) return [];
    const name = line.slice(0, price.index).replace(/[\s:–—(-]+$/, "").trim();
    // Text after the price, minus a unit like "/mo" and leading punctuation
    const description = line.slice((price.index ?? 0) + price[0].length).replace(/^(\s*\/\s*\w+)?[\s.),;:-]*/, "").trim();
    if (!name || name.length > 80) return [];
    return [{ name, price: Number(price[1].replace(/,/g, "")), description: description || null }];
  });
}

function teamItems(lines: string[]) {
  // "Maria Ortega - Owner"  (2-4 capitalized words, then a dash, comma or colon, then the title)
  const re = /^([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){1,3})\s*[-–—,:]\s*(.{2,80})$/;
  return lines.flatMap((line) => {
    const m = line.match(re);
    return m ? [{ name: m[1], jobTitle: m[2].trim() }] : [];
  });
}

/** Text with web addresses turned into links (escaped first, so user text can't inject HTML). */
function linkify(line: string): string {
  return escape(line).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}">${url}</a>`);
}

/** The founding story, when the text has a section clearly labeled as one. */
export function storyFromSections(sections: TextSection[]): string | null {
  const s = sections.find((x) => x.heading && STORY_HEADING.test(x.heading));
  const text = s?.lines.join(" ").trim();
  return text && text.length >= 40 ? text : null;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Plain text -> HTML:
 * - a short first line becomes the <title>, so the name is "inferred" from it like a homepage title
 * - the first longer standalone paragraph becomes the meta description (the overview)
 * - recognized sections and the address become one JSON-LD block
 */
export function textToHtml(text: string): string {
  const sections = splitSections(text);
  const first = sections[0];
  const firstLine = first ? (first.heading ?? first.lines[0]) : "";
  const title = isHeadingLike(firstLine) ? firstLine : "";
  const description = sections.find((s) => !s.heading && s.lines.length === 1 && s.lines[0].length >= 60)?.lines[0] ?? "";

  const graph: Record<string, unknown>[] = [];
  const address = text.match(ADDRESS)?.[0];
  if (address) graph.push({ "@type": "Organization", address });
  for (const s of sections) {
    if (!s.heading) continue;
    if (FAQ_HEADING.test(s.heading)) {
      const faqs = faqItems(s.lines);
      if (faqs.length) graph.push({ "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) });
    } else if (REVIEW_HEADING.test(s.heading)) {
      for (const r of reviewItems(s.lines)) graph.push({ "@type": "Review", reviewBody: r.quote, ...(r.author ? { author: r.author } : {}) });
    } else if (TEAM_HEADING.test(s.heading)) {
      for (const person of teamItems(s.lines)) graph.push({ "@type": "Person", name: person.name, jobTitle: person.jobTitle });
    } else if (SERVICE_HEADING.test(s.heading)) {
      for (const item of serviceItems(s.lines)) {
        // "Product", not "Service": the JSON-LD extractor treats any *Service type as the business itself
        graph.push({
          "@type": "Product",
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          offers: { "@type": "Offer", price: item.price, priceCurrency: "USD" },
        });
      }
    }
  }

  const body = sections
    .map((s) => `${s.heading ? `<h2>${escape(s.heading)}</h2>` : ""}<p>${s.lines.map(linkify).join("<br>")}</p>`)
    .join("\n");
  // "<" is escaped inside the JSON so user text can't close the script tag
  const jsonLd = graph.length
    ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`
    : "";

  return `<!doctype html><html><head>${title ? `<title>${escape(title)}</title>` : ""}${
    description ? `<meta name="description" content="${escape(description)}">` : ""
  }${jsonLd}</head><body>${body}</body></html>`;
}
