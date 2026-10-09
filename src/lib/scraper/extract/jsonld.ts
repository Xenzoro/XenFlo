import type { Address } from "@/types/knowledge";
import type { PageContext } from "./types";
import { addItem, clean, setField } from "../merge";
import { cleanUrl } from "../url";
import { socialPlatform } from "./social";

/*
  JSON-LD (<script type="application/ld+json">) is structured data sites add for
  Google. When present it's the most reliable source we have, so it runs first.
*/

type Node = Record<string, unknown>;

const ORG_TYPE = /Organization|Business|Corporation|Store|Restaurant|Agency|Service|Company|Clinic|Office|Practice/i;

/** Parse every ld+json block and flatten arrays and @graph into a list of nodes. */
export function parseJsonLd(ctx: PageContext): Node[] {
  const nodes: Node[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const node = value as Node;
    if (Array.isArray(node["@graph"])) visit(node["@graph"]);
    if (node["@type"]) nodes.push(node);
  };
  ctx.$('script[type="application/ld+json"]').each((_, el) => {
    const raw = ctx.$(el).text();
    try {
      visit(JSON.parse(raw));
    } catch {
      // Some sites ship invalid JSON-LD (trailing commas, etc.); skip it.
    }
  });
  return nodes;
}

function types(node: Node): string[] {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

/** JSON-LD values can be a string, an object with name/url/@id, or an array of either. */
function text(value: unknown): string | null {
  if (typeof value === "string") return clean(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (value && typeof value === "object") {
    const v = value as Node;
    return text(v.name ?? v.text ?? v.url ?? v["@id"]);
  }
  return null;
}

function list(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function toAddress(value: unknown): Address | null {
  if (typeof value === "string") {
    const formatted = clean(value);
    return formatted ? { street: null, city: null, region: null, postalCode: null, country: null, formatted } : null;
  }
  if (!value || typeof value !== "object") return null;
  const a = value as Node;
  const parts = {
    street: text(a.streetAddress),
    city: text(a.addressLocality),
    region: text(a.addressRegion),
    postalCode: text(a.postalCode),
    country: text(a.addressCountry),
  };
  const formatted = [parts.street, parts.city, [parts.region, parts.postalCode].filter(Boolean).join(" "), parts.country]
    .filter(Boolean)
    .join(", ");
  return formatted ? { ...parts, formatted } : null;
}

export function extractJsonLd(ctx: PageContext): void {
  const { kb, url } = ctx;

  for (const node of parseJsonLd(ctx)) {
    const nodeTypes = types(node);
    const is = (t: string) => nodeTypes.includes(t);

    if (nodeTypes.some((t) => ORG_TYPE.test(t))) {
      setField(kb.company.name, text(node.name), url);
      setField(kb.company.legalName, text(node.legalName), url);
      setField(kb.company.overview, text(node.description), url);
      for (const alt of list(node.alternateName)) addItem(kb.company.alternateNames, text(alt), url, (v) => v.toLowerCase());

      const founded = text(node.foundingDate)?.match(/\d{4}/)?.[0];
      if (founded) setField(kb.company.yearFounded, Number(founded), url);

      const employees = node.numberOfEmployees as Node | undefined;
      setField(kb.company.employeeCount, text(employees?.value ?? employees), url);

      // Most specific schema type (e.g. "Dentist") is a decent industry hint.
      const specific = nodeTypes.find((t) => t !== "Organization" && t !== "LocalBusiness");
      if (specific) setField(kb.company.industry, specific.replace(/([a-z])([A-Z])/g, "$1 $2"), url, "inferred");

      const addresses = list(node.address).map(toAddress).filter((a): a is Address => !!a);
      if (addresses[0]) setField(kb.company.mainAddress, addresses[0], url);
      for (const extra of addresses.slice(1)) addItem(kb.company.otherLocations, extra, url, (v) => v.formatted.toLowerCase());

      for (const phone of list(node.telephone)) addItem(kb.contact.phones, text(phone), url, phoneKey);
      for (const email of list(node.email)) addItem(kb.contact.emails, text(email)?.replace(/^mailto:/i, ""), url, (v) => v.toLowerCase());

      for (const area of list(node.areaServed)) addItem(kb.company.serviceLocations, text(area), url, (v) => v.toLowerCase());

      const logo = text(node.logo);
      const logoUrl = logo ? cleanUrl(logo, url) : null;
      if (logoUrl) addItem(kb.brand.logos, { url: logoUrl, kind: "json-ld logo", alt: null }, url, (v) => v.url);

      for (const same of list(node.sameAs)) {
        const link = text(same);
        if (!link) continue;
        const platform = socialPlatform(link);
        if (platform) addItem(kb.brand.socialLinks, { platform, url: link }, url, (v) => v.url.toLowerCase());
      }

      const rating = node.aggregateRating as Node | undefined;
      if (rating) addRating(ctx, rating);
    }

    if (is("Product") || is("Service") || is("Offer")) {
      const offer = list(node.offers)[0] as Node | undefined;
      const price = offer ? Number(text(offer.price ?? offer.lowPrice)) : NaN;
      const name = text(node.name);
      if (name && !nodeTypes.some((t) => ORG_TYPE.test(t) && t !== "Service")) {
        addItem(
          kb.offerings,
          {
            name,
            category: text(node.category),
            description: text(node.description),
            features: [],
            pricingType: offer?.lowPrice ? "starting_at" : Number.isFinite(price) ? "fixed" : "unknown",
            priceText: Number.isFinite(price) ? `${text(offer?.priceCurrency) ?? ""} ${price}`.trim() : null,
            priceAmount: Number.isFinite(price) ? price : null,
            currency: text(offer?.priceCurrency),
          },
          url,
          (v) => v.name.toLowerCase(),
        );
      }
      if (node.aggregateRating) addRating(ctx, node.aggregateRating as Node);
    }

    if (is("FAQPage")) {
      for (const q of list(node.mainEntity) as Node[]) {
        const question = text(q?.name);
        const answer = text((q?.acceptedAnswer as Node | undefined)?.text);
        if (question && answer) addItem(kb.insights.faqs, { question, answer }, url, (v) => v.question.toLowerCase());
      }
    }

    // Reviews can be standalone or nested under a business/product.
    for (const review of [...(is("Review") ? [node] : []), ...(list(node.review) as Node[])]) {
      const quote = text(review?.reviewBody ?? review?.description);
      if (!quote) continue;
      const author = text(review.author);
      const rating = Number(text((review.reviewRating as Node | undefined)?.ratingValue));
      addItem(
        kb.insights.testimonials,
        { quote, author, authorTitle: null, company: null, rating: Number.isFinite(rating) ? rating : null },
        url,
        (v) => v.quote.toLowerCase().slice(0, 80),
      );
    }

    if (is("Person")) {
      const name = text(node.name);
      if (name) {
        addItem(
          kb.people,
          {
            name,
            title: text(node.jobTitle),
            role: null,
            bio: text(node.description),
            imageUrl: text(node.image),
            type: "team",
          },
          url,
          (v) => v.name.toLowerCase(),
        );
      }
    }
  }
}

function addRating(ctx: PageContext, rating: Node) {
  const value = text(rating.ratingValue);
  const count = text(rating.reviewCount ?? rating.ratingCount);
  if (!value) return;
  const label = count ? `Rated ${value} from ${count} reviews` : `Rated ${value}`;
  addItem(ctx.kb.insights.trustSignals, { kind: "rating", text: label }, ctx.url, (v) => v.text);
}

/** Phones are duplicates if their digits match (ignoring a leading US 1). */
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}
