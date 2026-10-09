import robotsParser from "robots-parser";
import { fetchPage } from "./fetch";

/** The name we match against User-agent lines in robots.txt. */
const BOT_NAME = "XenFloBot";

export interface RobotsRules {
  /** True when robots.txt was found */
  found: boolean;
  isAllowed: (url: string) => boolean;
  sitemaps: string[];
  /** Seconds the site asks us to wait between requests, if set */
  crawlDelay: number | null;
}

/**
 * Load robots.txt for a site. A missing or unreadable robots.txt means
 * everything is allowed (standard crawler behavior).
 */
export async function loadRobots(siteUrl: string): Promise<RobotsRules> {
  const robotsUrl = new URL("/robots.txt", siteUrl).toString();
  try {
    const res = await fetchPage(robotsUrl, { timeoutMs: 5_000, accept: "text/plain" });
    // Some sites serve an HTML page at /robots.txt; ignore it.
    if (/html/i.test(res.contentType)) throw new Error("not a robots file");

    const robots = robotsParser(robotsUrl, res.body);
    return {
      found: true,
      // isAllowed returns undefined for URLs on other hosts; treat that as allowed.
      isAllowed: (url) => robots.isAllowed(url, BOT_NAME) !== false,
      sitemaps: robots.getSitemaps(),
      crawlDelay: robots.getCrawlDelay(BOT_NAME) ?? null,
    };
  } catch {
    return { found: false, isAllowed: () => true, sitemaps: [], crawlDelay: null };
  }
}
