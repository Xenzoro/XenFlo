import type { SocialPlatform } from "@/types/knowledge";
import type { PageContext } from "./types";
import { addItem, clean } from "../merge";
import { cleanUrl } from "../url";

const PLATFORMS: { platform: SocialPlatform; host: RegExp }[] = [
  { platform: "linkedin", host: /(^|\.)linkedin\.com$/ },
  { platform: "facebook", host: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/ },
  { platform: "instagram", host: /(^|\.)instagram\.com$/ },
  { platform: "x", host: /(^|\.)(twitter\.com|x\.com)$/ },
  { platform: "youtube", host: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { platform: "tiktok", host: /(^|\.)tiktok\.com$/ },
  { platform: "twitch", host: /(^|\.)twitch\.tv$/ },
  { platform: "discord", host: /(^|\.)(discord\.gg|discord\.com|discordapp\.com)$/ },
  { platform: "pinterest", host: /(^|\.)pinterest\.[a-z.]+$/ },
];

// Share buttons and embeds link to these platforms too, but they aren't the company's profile.
const NOT_A_PROFILE = /\/(sharer|share|intent|dialog|plugins|embed|watch\?|hashtag|search)|[?&](u|url|text)=/i;

/** Which social platform a URL belongs to, or null if it isn't a profile link. */
export function socialPlatform(link: string): SocialPlatform | null {
  try {
    const url = new URL(link);
    if (NOT_A_PROFILE.test(url.pathname + url.search)) return null;
    // A bare domain ("facebook.com/") isn't a profile.
    if (url.pathname.replace(/\//g, "") === "" && !/discord\.gg/.test(url.hostname)) return null;
    const host = url.hostname.toLowerCase();
    return PLATFORMS.find((p) => p.host.test(host))?.platform ?? null;
  } catch {
    return null;
  }
}

const MAX_SOCIALS = 15;
// More profile links than this in a page body means it's a directory (server lists,
// partner pages) linking to other people's profiles, not the company's own.
const MAX_BODY_PROFILES = 4;

export function extractSocial(ctx: PageContext): void {
  const { $, url, kb, category } = ctx;
  const links = (selector: string) =>
    $(selector)
      .map((_, el) => cleanUrl($(el).attr("href") ?? "", url))
      .get()
      .filter((href): href is string => !!href && !!socialPlatform(href));

  const chrome = links("header a[href], footer a[href], nav a[href]");
  const body = links("a[href]").filter((href) => !chrome.includes(href));
  const bodyProfiles = new Set(body.map((h) => h.toLowerCase()));
  const trusted = category === "home" || bodyProfiles.size <= MAX_BODY_PROFILES ? [...chrome, ...body] : chrome;

  for (const href of trusted) {
    if (kb.brand.socialLinks.length >= MAX_SOCIALS) break;
    addItem(kb.brand.socialLinks, { platform: socialPlatform(href)!, url: href }, url, (v) => v.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, ""));
  }

  // twitter:site is "@handle"
  const handle = clean($('meta[name="twitter:site"]').attr("content"));
  if (handle && /^@\w{1,15}$/.test(handle)) {
    addItem(kb.brand.socialLinks, { platform: "x", url: `https://x.com/${handle.slice(1)}` }, url, (v) =>
      v.url.toLowerCase().replace(/^https?:\/\/(www\.)?(twitter|x)\.com/, ""),
    );
  }
}
