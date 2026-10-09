import type { PageContext } from "./types";
import { addItem } from "../merge";
import { cleanUrl } from "../url";
import { textOf } from "./text";

const BUTTONISH = /btn|button|cta/i;
// Interface controls and cookie banners, not marketing calls to action.
const NOT_CTA = /^(next|previous|prev|menu|close|open|toggle|search|submit|ok|cancel|back|more|play|pause|accept|accept all|decline|reject|reject all|allow|allow all|deny|got it|dismiss|skip|show more|show less|read less|en|english|×|x)$/i;
const MAX_CTAS = 12;
// Real calls to action start with an action word ("Get a quote", "Order", "Start your server").
const ACTION = /^(get|start|buy|order|book|schedule|call|contact|request|try|sign up|join|shop|view|see|learn|download|claim|subscribe|apply|reserve|explore|discover|create|choose|pick|deploy|launch|find|talk|chat|email|visit|register|donate|play|upgrade|build|grab|reach|message|text|check|compare|watch|let'?s)\b/i;

/** Button-style links and buttons ("Get a Quote", "Start Your Server"), most frequent first. */
export function extractCtas(ctx: PageContext): void {
  const { $text: $, url, kb } = ctx;
  const counts = new Map<string, { text: string; url: string | null; n: number }>();

  $('a, button, input[type="submit"], [role="button"]').each((_, node) => {
    const el = $(node);
    const cls = `${el.attr("class") ?? ""} ${el.attr("id") ?? ""}`;
    // Buttons, button-styled links, or plain action links in the page body (not menus).
    const styled = el.is("button, input") || BUTTONISH.test(cls) || el.attr("role") === "button";
    if (!styled && el.closest("nav, header, footer, [class*=menu i]").length) return;
    // Dropdown and menu toggles aren't CTAs.
    if (el.attr("aria-expanded") !== undefined || el.attr("aria-haspopup") !== undefined) return;

    const text = (el.is("input") ? el.attr("value") ?? "" : textOf(el)).replace(/[.!→›»>]+$/, "").trim();
    const words = text.split(/\s+/).length;
    if (/@|https?:|www\./i.test(text)) return; // an email or URL used as link text
    if (text.length < 3 || text.length > 40 || words > (styled ? 6 : 4) || /[?:]/.test(text) || NOT_CTA.test(text) || !ACTION.test(text)) return;

    const key = text.toLowerCase();
    const href = el.attr("href");
    const entry = counts.get(key) ?? { text, url: href ? cleanUrl(href, url) : null, n: 0 };
    entry.n++;
    counts.set(key, entry);
  });

  const ranked = [...counts.values()].sort((a, b) => b.n - a.n);
  for (const cta of ranked) {
    if (kb.customers.ctas.length >= MAX_CTAS) break;
    addItem(kb.customers.ctas, { text: cta.text, url: cta.url }, url, (v) => v.text.toLowerCase());
  }
}
