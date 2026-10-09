import type { KnowledgeBase } from "@/types/knowledge";
import type { PageContext } from "./types";
import { clean, setField } from "../merge";
import { SUFFIX_PATTERN, entityTypeFromSuffix, isPlatformName } from "../entity-suffixes";
import { locationCity } from "./contact";

/*
  Business facts the site states in plain text: legal name, legal entity type, employee count.
  These are tier 3 fields (AI never guesses them), so only what's written counts, and every
  value keeps the quote it came from as evidence. Revenue is never scraped.

  Order (first value wins, JSON-LD runs before this):
  1. Footer copyright line: "© 2024 Dragon Factory LLC"
  2. A legal page (privacy / terms): "operated by Example Co LLC", "Example Co, LLC ("we", "us")"
*/

export interface EntityFact {
  /** As written: "Goettl Air Conditioning, Inc." */
  legalName: string;
  /** From the suffix map: "Corporation" */
  entityType: string;
  /** Short quote shown as evidence */
  quote: string;
}

const LOOKAHEAD = String.raw`(?=[\s.,;|)"”]|$)`;

// "© 2014-2025 Apex Hosting LLC", "Copyright © 2025 Goettl Air Conditioning, Inc.", "© 2026 by Dragon Factory LLC".
// Case-sensitive so a lowercase "copyright, trademark…" sentence on a terms page doesn't count.
const COPYRIGHT = new RegExp(
  String.raw`(?:©|\([cC]\)|[Cc]opyright|COPYRIGHT)(?:\s*©)?\s*(?:(\d{4})\s*[-–]\s*)?(\d{4})?\s*,?\s*(?:by\s+)?([A-Z][\w&'. -]{0,60}?)\s*,?\s*(` +
    SUFFIX_PATTERN +
    ")" +
    LOOKAHEAD,
  "g",
);
// Fallback: copyright line without a legal entity, just to get the year range.
const COPYRIGHT_YEARS = /(?:©|\(c\)|copyright)\s*(\d{4})\s*[-–]\s*(\d{4})/i;

/** The business's own copyright line, ignoring site builders ("© Wix.com Ltd"). */
export function parseCopyright(text: string): (EntityFact & { startYear: number | null }) | null {
  for (const m of text.matchAll(COPYRIGHT)) {
    const [whole, startYear, , name, suffix] = m;
    if (isPlatformName(name)) continue;
    const entityType = entityTypeFromSuffix(suffix);
    if (!entityType) continue;
    // Keep the name exactly as written, including a comma before the suffix
    const legalName = whole.slice(whole.indexOf(name)).trim();
    return { legalName, entityType, quote: clip(whole), startYear: startYear ? Number(startYear) : null };
  }
  return null;
}

// A capitalized name of up to 6 words ("Goettl Home Services", "Sunny Paws & Co Grooming")
const NAME = String.raw`([A-Z][\w&'.-]*(?:\s+(?:[A-Z][\w&'.-]*|&|and|of)){0,5}?)`;
// "operated by Example Co LLC"
const OPERATED_BY = new RegExp(String.raw`\b(?:operated|owned|provided|run)\s+by\s+` + NAME + String.raw`,?\s+(` + SUFFIX_PATTERN + ")" + LOOKAHEAD, "g");
// "Example Co, LLC ("Example", "we" or "us")": a name followed by a quoted short name in parentheses.
// Up to 200 characters in between, for "…, LLC, and our subsidiaries A LLC, B LLC, (“Goettl”, “we”…)".
const DEFINED_AS = new RegExp(NAME + String.raw`,?\s+(` + SUFFIX_PATTERN + ")" + LOOKAHEAD + String.raw`[^()]{0,200}?\(\s*["“']`, "g");
// Legal page headings that can run into the name: "Terms of Service Example Co LLC"
const LEADING_HEADING = /^(?:(?:privacy|policy|terms|of|and|service|conditions|last|updated|effective|date|use|legal|notice)\s+)+/i;

/**
 * The business's legal entity from a privacy / terms page. Legal pages also name third parties
 * ("Facebook, operated by Facebook Inc."), so the name must share a word with the business
 * (`businessWords`: company name and domain words).
 */
export function parseLegalEntity(text: string, businessWords: string[]): EntityFact | null {
  for (const pattern of [OPERATED_BY, DEFINED_AS]) {
    for (const m of text.matchAll(pattern)) {
      const name = m[1].replace(LEADING_HEADING, "").trim();
      const entityType = entityTypeFromSuffix(m[2]);
      if (!name || !entityType || isPlatformName(name) || !sharesWord(name, businessWords)) continue;
      const comma = m[0].slice(m[0].indexOf(m[1]) + m[1].length).match(/^,?/)?.[0] ?? "";
      return { legalName: `${name}${comma} ${m[2]}`, entityType, quote: quoteAround(text, m.index, m[0].length) };
    }
  }
  return null;
}

// Words too common to tie a name to the business ("Home Services", "Group")
const GENERIC = new Set(["services", "service", "home", "group", "company", "holdings", "solutions", "international", "global", "enterprises", "management", "partners", "and", "the"]);

/** Words that identify this business: its name and the domain ("goettl", "apexminecrafthosting"). */
export function businessWords(kb: KnowledgeBase): string[] {
  const host = new URL(kb.url).hostname.replace(/^www\./, "").split(".")[0];
  const fromName = `${kb.company.name.value ?? ""} ${kb.companyName ?? ""}`.toLowerCase().split(/[^a-z0-9]+/);
  return [...new Set([host.toLowerCase(), ...fromName])].filter((w) => w.length >= 4 && !GENERIC.has(w));
}

/** Does a distinctive word of `name` appear among the business words (or inside the domain)? */
function sharesWord(name: string, words: string[]): boolean {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w))
    .some((w) => words.some((b) => b === w || b.includes(w)));
}

// "team of 200+ technicians", "over 50 employees", "168 HVAC & Plumbing Technicians"
const HEADCOUNT =
  /\b(?:(?:team|staff|crew|family) of\s+)?(?:(over|more than|nearly|almost|about|approximately|around)\s+)?(\d{1,3}(?:,\d{3})+|\d{1,5})(\+)?\s+((?:[\w&-]+\s+){0,3}?)(employees|technicians|techs|team members|staff members|staff|associates|professionals|specialists|engineers)\b/gi;
// Words allowed between the number and the noun when lowercase ("50 certified technicians")
const ADJECTIVES = /^(?:&|and|certified|licensed|trained|skilled|experienced|dedicated|expert|full-time|part-time|professional|friendly|highly|local|in-house|talented)$/i;
// Nouns that mean the whole company; anything else (technicians) keeps its noun
const WHOLE_COMPANY = new Set(["employees", "staff", "team members"]);
const QUALIFIER: Record<string, string> = { over: "Over", "more than": "Over", nearly: "Nearly", almost: "Nearly", about: "About", approximately: "About", around: "About" };

/**
 * A headcount the site states, kept as stated: never rounded, never turned into a fake exact number.
 * The noun and scope stay with it ("168 technicians (Las Vegas)", "200+ technicians"); only a whole-company
 * count of employees / staff / team members, not tied to one location, is stored as a bare number ("Over 50").
 * `scope` is the city when the page is one location's page.
 */
export function parseEmployeeCount(text: string, scope: string | null = null): { value: string; quote: string } | null {
  for (const m of text.matchAll(HEADCOUNT)) {
    const [whole, qualifier, digits, plus, middle, nounRaw] = m;
    const n = Number(digits.replace(/,/g, ""));
    if (n < 2 || (!digits.includes(",") && n >= 1800 && n <= 2100)) continue; // "1 technician", a year
    if (/\bthe\s+$/i.test(text.slice(Math.max(0, m.index - 4), m.index))) continue; // "the 3 technicians" (a review)
    // Words in between must read like a description ("HVAC & Plumbing", "certified"), not a sentence ("years serving our")
    if (!middle.trim().split(/\s+/).filter(Boolean).every((w) => /^[A-Z]/.test(w) || ADJECTIVES.test(w))) continue;

    const noun = nounRaw.toLowerCase().replace(/^techs$/, "technicians").replace(/^staff members$/, "staff");
    const count = qualifier ? `${QUALIFIER[qualifier.toLowerCase()]} ${digits}` : `${digits}${plus ?? ""}`;
    const bare = WHOLE_COMPANY.has(noun) && !scope;
    const value = bare ? count : `${count} ${noun}${scope ? ` (${scope})` : ""}`;
    return { value, quote: quoteAround(text, m.index, whole.length) };
  }
  return null;
}

/** Copyright line, legal page entity and stated headcount for one page. */
export function extractBusinessFacts(ctx: PageContext): void {
  const { $, url, kb, category, visibleText } = ctx;

  // Copyright notices live in the footer; fall back to the whole page.
  const footer = clean($("footer").text()) ?? "";
  const copyright = parseCopyright(footer) ?? parseCopyright(visibleText);
  if (copyright) {
    setField(kb.company.legalEntityType, copyright.entityType, url, "scraped", [copyright.quote]);
    setField(kb.company.legalName, copyright.legalName, url, "scraped", [copyright.quote]);
    // A range like "2014-2025" suggests the business existed in 2014; a hint, not a fact.
    if (copyright.startYear) setField(kb.company.yearFounded, copyright.startYear, url, "inferred");
  } else {
    const years = (footer || visibleText).match(COPYRIGHT_YEARS);
    if (years) setField(kb.company.yearFounded, Number(years[1]), url, "inferred");
  }

  if (category === "legal") {
    const entity = parseLegalEntity(visibleText, businessWords(kb));
    if (entity) {
      setField(kb.company.legalEntityType, entity.entityType, url, "scraped", [entity.quote]);
      setField(kb.company.legalName, entity.legalName, url, "scraped", [entity.quote]);
    }
  }

  const city = locationCity(url);
  const headcount = parseEmployeeCount(visibleText, city ? titleCase(city) : null);
  if (headcount) setField(kb.company.employeeCount, headcount.value, url, "scraped", [headcount.quote]);
}

/** Up to 160 characters around a match, cut at word boundaries. */
function quoteAround(text: string, index: number, length: number): string {
  const pad = Math.max(0, Math.floor((160 - length) / 2));
  const start = Math.max(0, index - pad);
  const slice = text.slice(start, index + length + pad);
  return clip((start > 0 ? slice.replace(/^\S*\s/, "") : slice).replace(/\s\S*$/, (tail) => (index + length + pad >= text.length ? tail : "")));
}

function clip(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
