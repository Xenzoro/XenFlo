import type { CheerioAPI } from "cheerio";
import type { PageContext } from "./types";
import { addItem, clean } from "../merge";
import { cleanUrl } from "../url";
import { looksLikeName, textOf } from "./text";

type El = ReturnType<CheerioAPI>;

const ROLE = /\b(founder|co-?founder|owner|ceo|cto|coo|cfo|cmo|president|vice president|vp|director|manager|head of|lead|chief|officer|partner|principal|chef|engineer|developer|designer|technician|specialist|coordinator|consultant|assistant|associate|advisor|administrator|supervisor|agent|therapist|dentist|doctor|dr\.|attorney|lawyer|stylist|trainer|instructor|realtor|broker|accountant|hygienist|nurse|receptionist|marketing|sales|operations|support)\b/i;

/**
 * Team members on about/team pages: a name-looking heading next to a job title.
 * Testimonial authors were already added as customer_partner; a name that's
 * already in People is never re-tagged as team.
 */
export function extractPeople(ctx: PageContext): void {
  const { $text: $, url, kb, category } = ctx;
  if (category !== "team" && category !== "about") return;

  $('h2, h3, h4, h5, h6, strong, b, [class*="name" i]').each((_, node) => {
    const el = $(node);
    const name = textOf(el);
    // One-word names ("Aaron") are fine on team pages if a job title confirms it below.
    if (!looksLikeName(name, { allowSingle: category === "team" })) return;
    // A heading with several other headings next to it is a section title ("Developers"), not a person.
    if (el.parent().find("h2, h3, h4, h5, h6").length > 1) return;
    // Skip anything inside a testimonial.
    if (el.closest('blockquote, [class*="testimonial" i], [class*="review" i]').length) return;

    const title = findTitle($, el);
    if (!looksLikeName(name) && !title) return;
    const card = cardFor($, el);
    const hasPhoto = card.find("img").length > 0;
    // Need a job title, or (on a dedicated team page) a photo, to believe it's a person.
    if (!title && !(category === "team" && hasPhoto)) return;

    const src = card.find("img").first().attr("src");
    const bio = card
      .find("p")
      .toArray()
      .map((p) => textOf($(p)))
      .find((t) => t.length >= 40 && !t.includes(name));

    addItem(
      kb.people,
      {
        name,
        title,
        role: null,
        bio: clean(bio, 600),
        imageUrl: src ? cleanUrl(src, url) : null,
        type: "team",
      },
      url,
      (v) => v.name.toLowerCase(),
    );
  });
}

/** Job title: a short sibling or card element that contains a role word. Closest first. */
function findTitle($: CheerioAPI, el: El): string | null {
  const name = textOf(el);
  const near = (sel: El) => sel.toArray().map((n) => $(n));
  const candidates = [
    ...near(el.nextAll().slice(0, 3)),
    el.prev(),
    ...near(el.parent().nextAll().slice(0, 2)),
    ...near(cardFor($, el).find('[class*="title" i], [class*="position" i], [class*="role" i], [class*="job" i], p, span, em')),
  ];
  for (const c of candidates) {
    const t = textOf(c);
    // Short, no colon (rules out headlines like "Server Owner's Guide: ...").
    if (t && t !== name && t.length <= 45 && !t.includes(":") && ROLE.test(t)) return t;
  }
  return null;
}

/** The smallest ancestor that looks like one person's "card". */
function cardFor($: CheerioAPI, el: El): El {
  let card = el.parent();
  for (let i = 0; i < 3; i++) {
    const parent = card.parent();
    // Stop before reaching a container that holds other people (more than one heading).
    if (!parent.length || textOf(parent).length > 700 || parent.find("h2, h3, h4, h5, h6").length > 1) break;
    card = parent;
  }
  return card;
}
