import robotsParser from "robots-parser";
import { fetchPage } from "./fetch";

/** The name we match against User-agent lines in robots.txt. */
const BOT_NAME = "XenFloBot";

/**
 * Well-known AI crawlers. If a site's robots.txt shuts these out, the owner clearly
 * doesn't want AI tools reading it, even when XenFloBot itself isn't named, so we
 * ask for the owner's permission before scraping (see scrapeSite).
 */
export const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "PerplexityBot",
  "Bytespider",
  "Applebot-Extended",
  "meta-externalagent",
  "Amazonbot",
  "cohere-ai",
];

export interface RobotsVerdict {
  /** XenFloBot may fetch the URL */
  allowed: boolean;
  /** AI crawlers that are disallowed from the site root */
  aiRestricted: string[];
}

/** Pure check of a robots.txt text (no network), so it can be tested on sample files. */
export function classifyRobots(robotsTxt: string, url: string): RobotsVerdict {
  const robotsUrl = new URL("/robots.txt", url).toString();
  const robots = robotsParser(robotsUrl, robotsTxt);
  const root = new URL("/", url).toString();
  return {
    allowed: robots.isAllowed(url, BOT_NAME) !== false,
    // Only count bots that are named on purpose; a blanket "User-agent: *" block is caught by `allowed`
    aiRestricted: AI_CRAWLERS.filter(
      (bot) => new RegExp(`^\\s*user-agent:\\s*${bot}\\s*$`, "im").test(robotsTxt) && robots.isAllowed(root, bot) === false,
    ),
  };
}

export interface RobotsRules {
  /** True when robots.txt was found */
  found: boolean;
  isAllowed: (url: string) => boolean;
  sitemaps: string[];
  /** Seconds the site asks us to wait between requests, if set */
  crawlDelay: number | null;
  /** AI crawlers this site's robots.txt shuts out (see AI_CRAWLERS) */
  aiRestricted: string[];
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
      aiRestricted: classifyRobots(res.body, siteUrl).aiRestricted,
      // isAllowed returns undefined for URLs on other hosts; treat that as allowed.
      isAllowed: (url) => robots.isAllowed(url, BOT_NAME) !== false,
      sitemaps: robots.getSitemaps(),
      crawlDelay: robots.getCrawlDelay(BOT_NAME) ?? null,
    };
  } catch {
    return { found: false, isAllowed: () => true, sitemaps: [], crawlDelay: null, aiRestricted: [] };
  }
}
