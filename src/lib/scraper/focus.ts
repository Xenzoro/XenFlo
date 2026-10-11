import type { KnowledgeBase, PageCategory } from "@/types/knowledge";
import type { DiscoveredLink } from "./discover";

/*
  Deep crawls ("Dig deeper" past FOCUS_AFTER pages) only follow pages that usually add knowledge:
  menus, locations and restaurant pages, services, pricing, about and contact. Blogs, news, tags,
  archives, pagination and query-string copies are skipped, so the extra pages are worth reading
  and the saved knowledge base stays a reasonable size.
*/

/** After this many pages, only high-value pages are crawled. */
export const FOCUS_AFTER = 30;

const FOCUS_CATEGORIES: PageCategory[] = ["menu", "locations", "services", "pricing", "about", "contact"];

// "/page/2", "/blog/page/3"
const PAGINATION = /\/page\/\d+\/?$/i;
// Date archives: "/2024/", "/2024/05/…"
const DATE_ARCHIVE = /\/(?:19|20)\d{2}(?:\/\d{1,2})?(?:\/|$)/;

/** Is this link still worth crawling once the crawl has FOCUS_AFTER pages? */
export function isFocusLink(link: Pick<DiscoveredLink, "url" | "category">, kb: KnowledgeBase): boolean {
  const u = new URL(link.url);
  // Query strings are mostly copies of a page we have ("?utm_source=", "?page=2", "?sort=")
  if (u.search || PAGINATION.test(u.pathname) || DATE_ARCHIVE.test(u.pathname)) return false;
  if (FOCUS_CATEGORIES.includes(link.category)) return true;
  // A privacy / terms page only while the legal name is still unknown (see crawlLegalPage)
  if (link.category === "legal") return kb.company.legalName.value === null || kb.company.legalEntityType.value === null;
  // Pages with no keyword one level deep: on a restaurant group these are the restaurants ("/sakana")
  if (link.category === "other") return u.pathname.split("/").filter(Boolean).length <= 1;
  return false;
}

// First path segments that hold one page per branch: "/location/las-vegas", "/stores/henderson"
const LOCATION_SECTIONS = /^(locations?|stores?|branch(es)?|offices?)$/i;

/**
 * A scrape that starts on one branch's page ("/location/las-vegas") is about that branch, so
 * other branches' pages ("/location/reno-nevada/...") are skipped: their phones, service areas
 * and ratings would be wrong for it. The locations index ("/locations") and the branch's own
 * subpages are still crawled. Returns null when the start page isn't a branch page.
 */
export function locationScope(startUrl: string): ((link: Pick<DiscoveredLink, "url">) => boolean) | null {
  const [section, slug] = new URL(startUrl).pathname.split("/").filter(Boolean);
  if (!section || !slug || !LOCATION_SECTIONS.test(section)) return null;
  return (link) => {
    const [s, branch] = new URL(link.url).pathname.split("/").filter(Boolean);
    return !(s?.toLowerCase() === section.toLowerCase() && branch && branch.toLowerCase() !== slug.toLowerCase());
  };
}
