import type { PageContext } from "./types";
import { addItem } from "../merge";
import { imageClue, textOf } from "./text";

/*
  Tools and suppliers a site uses, detected from script/link/iframe sources and
  inline scripts. Useful context for marketing (e.g. "already uses Mailchimp").
*/

const TECH: { name: string; category: string; pattern: RegExp }[] = [
  { name: "Google Analytics", category: "analytics", pattern: /google-analytics\.com|gtag\/js|gtag\(/i },
  { name: "Google Tag Manager", category: "analytics", pattern: /googletagmanager\.com\/gtm/i },
  { name: "Meta Pixel", category: "analytics", pattern: /connect\.facebook\.net|fbq\(/i },
  { name: "Hotjar", category: "analytics", pattern: /hotjar\.com/i },
  { name: "Cloudflare Web Analytics", category: "analytics", pattern: /cloudflareinsights\.com/i },
  { name: "Microsoft Clarity", category: "analytics", pattern: /clarity\.ms/i },
  { name: "Cookiebot", category: "consent", pattern: /cookiebot\.com/i },
  { name: "OneTrust", category: "consent", pattern: /onetrust\.com|cookielaw\.org/i },
  { name: "Trustpilot", category: "reviews", pattern: /trustpilot\.com/i },
  { name: "Yelp", category: "reviews", pattern: /yelp\.com\/(biz|embed)|yelpcdn/i },
  { name: "Intercom", category: "chat", pattern: /intercom(cdn)?\.(io|com)|widget\.intercom/i },
  { name: "Drift", category: "chat", pattern: /js\.driftt\.com|drift\.com/i },
  { name: "Zendesk", category: "chat", pattern: /zdassets\.com|zendesk\.com/i },
  { name: "Tawk.to", category: "chat", pattern: /tawk\.to/i },
  { name: "LiveChat", category: "chat", pattern: /livechatinc\.com/i },
  { name: "Crisp", category: "chat", pattern: /crisp\.chat/i },
  { name: "Tidio", category: "chat", pattern: /tidio(chat)?\.co/i },
  { name: "Mailchimp", category: "email", pattern: /mailchimp\.com|list-manage\.com|chimpstatic\.com/i },
  { name: "Klaviyo", category: "email", pattern: /klaviyo\.com/i },
  { name: "HubSpot", category: "crm", pattern: /hs-scripts\.com|hubspot\.com|hsforms/i },
  { name: "Stripe", category: "payments", pattern: /js\.stripe\.com/i },
  { name: "PayPal", category: "payments", pattern: /paypal\.com\/sdk|paypalobjects\.com/i },
  { name: "Square", category: "payments", pattern: /squareup\.com|square\.site/i },
  { name: "WordPress", category: "platform", pattern: /wp-content|wp-includes/i },
  { name: "Wix", category: "platform", pattern: /wixstatic\.com|parastorage\.com|wix\.com/i },
  { name: "Squarespace", category: "platform", pattern: /squarespace(-cdn)?\.com/i },
  { name: "Shopify", category: "platform", pattern: /cdn\.shopify\.com|myshopify\.com/i },
  { name: "Webflow", category: "platform", pattern: /webflow\.(com|io)|website-files\.com/i },
  { name: "Calendly", category: "booking", pattern: /calendly\.com/i },
  { name: "Typeform", category: "forms", pattern: /typeform\.com/i },
  { name: "Google Maps", category: "maps", pattern: /maps\.googleapis\.com|google\.com\/maps/i },
  { name: "OpenTable", category: "booking", pattern: /opentable\.com/i },
  { name: "DoorDash", category: "delivery", pattern: /doordash\.com/i },
  { name: "Uber Eats", category: "delivery", pattern: /ubereats\.com/i },
];

const PARTNER_HEADING = /our partners|partners|trusted by|our clients|brands we (carry|work with)|sponsors|proud (members|partners)/i;

export function extractTech(ctx: PageContext): void {
  const { $, url, kb } = ctx;

  // Everything that points at a third party: script/link/iframe sources, inline scripts, the generator tag, links.
  const sources = [
    ...$("script[src], iframe[src], img[src]").map((_, el) => $(el).attr("src") ?? "").get(),
    ...$("link[href], a[href]").map((_, el) => $(el).attr("href") ?? "").get(),
    $('meta[name="generator"]').attr("content") ?? "",
    $("script:not([src])").text().slice(0, 200_000),
  ].join("\n");

  for (const tech of TECH) {
    if (!tech.pattern.test(sources)) continue;
    addItem(kb.customers.suppliersPartners, { name: tech.name, category: tech.category }, url, (v) => v.name.toLowerCase());
    if (tech.category === "reviews") {
      addItem(kb.insights.trustSignals, { kind: "review_count", text: `Shows reviews from ${tech.name}` }, url, (v) => v.text.toLowerCase());
    }
  }

  // Partner logo strips: name each logo from its alt text or file name.
  ctx.$text("h2, h3, h4").each((_, node) => {
    const heading = ctx.$text(node);
    const title = textOf(heading);
    if (!PARTNER_HEADING.test(title) || title.length > 60) return;
    heading
      .parent()
      .find("img")
      .each((__, img) => {
        const clue = imageClue(ctx.$text(img).attr("src"), ctx.$text(img).attr("alt"));
        if (clue && !PARTNER_HEADING.test(clue) && !/trust|partner|logo/i.test(clue)) addItem(kb.customers.suppliersPartners, { name: clue, category: "partner" }, url, (v) => v.name.toLowerCase());
      });
  });
}
