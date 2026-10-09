import type { PageContext } from "./types";
import { addItem } from "../merge";
import { cleanUrl, isSameSite } from "../url";
import { socialPlatform } from "./social";
import { imageClue, textOf } from "./text";

const AS_SEEN = /as seen (on|in)|featured (in|on)|in the (news|press)|press|media coverage/i;
const MAX_PRESS = 12;

/** Press mentions: outside links on press pages, and logo strips like "As seen on". */
export function extractPress(ctx: PageContext): void {
  const { $text: $, url, kb, category } = ctx;
  const add = (label: string, href: string) => {
    if (kb.insights.pressMentions.length >= MAX_PRESS) return;
    addItem(kb.insights.pressMentions, { label, url: href }, url, (v) => v.label.toLowerCase());
  };

  if (category === "press") {
    $("a[href]").each((_, node) => {
      const el = $(node);
      const href = cleanUrl(el.attr("href") ?? "", url);
      const label = textOf(el);
      if (!href || isSameSite(href, url) || socialPlatform(href)) return;
      if (label.length >= 15 && label.length <= 150) add(label, href);
    });
  }

  // Logo strips: name each logo from its alt text or file name.
  $("h2, h3, h4, p").each((_, node) => {
    const heading = $(node);
    if (!AS_SEEN.test(textOf(heading)) || textOf(heading).length > 60) return;
    heading
      .parent()
      .find("img")
      .each((__, img) => {
        const clue = imageClue($(img).attr("src"), $(img).attr("alt"));
        const link = $(img).closest("a").attr("href");
        if (clue) add(clue, (link && cleanUrl(link, url)) || url);
      });
  });
}
