import type { TrustSignal } from "@/types/knowledge";
import type { PageContext } from "./types";
import { addItem } from "../merge";
import { sentences, textOf } from "./text";

/*
  Sentence-level signals: trust signals, promotions, and differentiators.
  We test the smallest element that contains a match (a banner, a list item),
  so a promo sentence doesn't swallow the nav links printed right after it.
*/

const TRUST: { kind: TrustSignal["kind"]; pattern: RegExp }[] = [
  { kind: "rating", pattern: /\b[1-5]\.\d\s*(\/\s*5|out of 5|stars?)\b|\brated\s+[1-5](\.\d)?\b|\b[1-5]\.\d[- ]star/i },
  { kind: "review_count", pattern: /\b\d[\d,.]*\s*[kKmM]?\+?\s+(5[- ]star\s+)?(reviews?|ratings?|customers|clients|players|users|members|businesses|students|patients|families|servers)\b/i },
  // Case-sensitive "Best of X" so "the best of luck" doesn't count.
  { kind: "award", pattern: /\b([Aa]ward-winning|[Aa]warded|[Ww]inner of|[Ww]on (the|an?) |Best of [A-Z0-9]|[Tt]op[- ]rated|[Vv]oted (best|#1|number one)|#1 (rated|in|choice))/ },
  { kind: "certification", pattern: /\b(certified|certification|licensed|insured|accredited|bonded|BBB|ISO\s?\d{4,5}|HIPAA|PCI|SOC\s?2)\b/ },
  { kind: "guarantee", pattern: /\b(guarantee[ds]?|money[- ]back|\d{2}(\.\d+)?%\s+uptime)\b/i },
];

const PROMO = /\b\d{1,2}%\s*off\b|\bsale\b|\bdiscount|\bpromo(tion)? code|\bcoupon|\bfree trial|\blimited[- ]time|\bspecial offer|\bblack friday|\bcyber monday|\bholiday|\bchristmas|\bnew year|\bhappy hour|\bseasonal|\bsummer special|\bwinter special/i;

const DIFF_HEADING = /why (choose|us|work with|.{0,25}different)|only at|what makes|what sets|benefits|advantages|our promise|the .{0,20} difference|features/i;

const MAX = { trust: 15, promos: 10, diffs: 10 };

const ANY_SIGNAL = new RegExp([...TRUST.map((t) => t.pattern.source), PROMO.source].join("|"), "i");

export function extractSignals(ctx: PageContext): void {
  const { $text: $, kb, url } = ctx;
  // An HTML sitemap is a list of every page title ("Black Friday Server Deals"), not current messaging.
  if (/site-?map/i.test(new URL(url).pathname)) return;

  // Innermost elements whose text mentions a signal.
  const blocks: string[] = [];
  $("body *").each((_, node) => {
    const el = $(node);
    const t = textOf(el);
    if (t.length < 8 || t.length > 400 || !ANY_SIGNAL.test(t)) return;
    if (el.children().toArray().some((c) => ANY_SIGNAL.test(textOf($(c))))) return;
    // Grow to the parent while it's still short, so "25% off with" picks up "APEX25" next to it.
    let block = t;
    for (let p = el.parent(), i = 0; i < 3 && p.length && textOf(p).length <= 140; p = p.parent(), i++) block = textOf(p);
    blocks.push(block);
  });

  for (const sentence of blocks.flatMap((b) => sentences(b, 160))) {
    if (kb.insights.trustSignals.length < MAX.trust) {
      const match = TRUST.find((t) => t.pattern.test(sentence));
      if (match) addItem(kb.insights.trustSignals, { kind: match.kind, text: sentence }, url, (v) => v.text.toLowerCase());
    }
    if (kb.insights.promotions.length < MAX.promos && PROMO.test(sentence) && sentence.split(" ").length >= 4) {
      addItem(kb.insights.promotions, sentence, url, (v) => v.toLowerCase());
    }
  }

  extractDifferentiators(ctx);
}

/** Item headings under a "Why choose us" / "Only at X" / "Benefits" section. */
function extractDifferentiators(ctx: PageContext): void {
  const { $text: $, kb, url } = ctx;
  $("h1, h2, h3").each((_, node) => {
    const heading = $(node);
    const title = textOf(heading);
    if (!DIFF_HEADING.test(title) || title.length > 80) return;

    // Find the section around the heading that holds the list of points.
    let section = heading.parent();
    for (let i = 0; i < 3 && section.find("h3, h4, h5, li").not(heading).length < 2; i++) section = section.parent();

    let items = section.find("h3, h4, h5").not(heading).toArray().map((h) => textOf($(h)));
    if (items.length < 2) items = section.find("li").toArray().map((li) => textOf($(li)));
    for (const item of items.filter((t) => t.length >= 3 && t.length <= 80).slice(0, 8)) {
      if (kb.insights.differentiators.length >= MAX.diffs) return;
      addItem(kb.insights.differentiators, item, url, (v) => v.toLowerCase());
    }
  });
}
