/*
  Legal entity suffixes in one place: "Dragon Factory LLC" -> "LLC", "Goettl Air Conditioning, Inc." -> "Corporation".
  Used by the copyright and legal page parsers (extract/business-facts.ts).
  No suffix means no entity type: we never guess "Sole proprietor".
*/

/** Suffix as written (lowercase, no dots) -> the entity type we store. */
const SUFFIX_TYPES: Record<string, string> = {
  llc: "LLC",
  inc: "Corporation",
  incorporated: "Corporation",
  corp: "Corporation",
  corporation: "Corporation",
  lp: "Partnership",
  llp: "Partnership",
  pllc: "Professional LLC",
  pc: "Professional corporation",
  ltd: "Limited company",
  limited: "Limited company",
};

/**
 * Regex source matching one suffix as written. Case-sensitive on purpose ("Inc" or "INC", not "inc"),
 * so ordinary words don't count. Longer forms first so "PLLC" isn't read as "LLC".
 */
export const SUFFIX_PATTERN = String.raw`(?:PLLC|L\.L\.C\.|LLC|LLP|L\.P\.|LP|Incorporated|INC\.?|Inc\.?|Corporation|CORP\.?|Corp\.?|P\.C\.|PC|LTD\.?|Ltd\.?|Limited)`;

/** "L.L.C." -> "LLC", "Inc." -> "Corporation"; null for anything that isn't a known suffix. */
export function entityTypeFromSuffix(suffix: string): string | null {
  return SUFFIX_TYPES[suffix.toLowerCase().replace(/\./g, "")] ?? null;
}

// Website builders and theme authors whose names show up in footers ("© 2024 Wix.com Ltd", "Kadence WP").
const PLATFORM = /^(?:wix(?:\.com)?|wordpress(?:\.com|\.org)?|squarespace|shopify|godaddy|weebly|webflow|elementor|kadence(?: wp| themes)?|astra|divi|elegant themes|duda|hubspot|automattic)$/i;

/** True when the name is the site builder or theme, not the business. */
export function isPlatformName(name: string): boolean {
  return PLATFORM.test(name.trim().replace(/[.,]+$/, ""));
}
