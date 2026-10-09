# Enrichment from outside sources

A website is only one view of a business. Many small-business sites don't list a founding year, employee count, legal entity or full address, while their Google listing, state registration or Instagram does. This doc covers where XenFlo could fill those gaps, **what is and isn't allowed**, and which knowledge base fields each source fills.

None of these outside sources are wired in yet. Today XenFlo uses the website, owner-provided content, and AI suggestions over those facts (next section).

## Today: understanding the business from its own site

**Enrich with AI** (a button; it never runs automatically) asks a model to write down what a person would conclude from reading the site. For example, "a group of all-you-can-eat sushi, Korean BBQ and hot pot restaurants in Las Vegas", which Dragon Factory never writes as a label.

**Evidence input** (`src/lib/ai/evidence.ts`): more than the knowledge base fields, trimmed to a fixed budget (about 16k input tokens including the prompt), highest value first:
1. Overview, founding story, company name.
2. Every crawled page's title, meta description and h1–h3 headings, captured during the crawl.
3. Sub-brand names, locations (city/state), offering names and categories.
4. CTA texts **with their link targets** (`"order online" → clover.com/...`).
5. Testimonial text **without names**, then FAQs.
6. Differentiators, trust signals, promotions, image alt text and logo file names, tools and partners.

Every item has an id, so the model's evidence can be checked. Records scraped before page evidence existed get the hint "Re-scrape for better results."

**Rules** (details in [data-quality.md](data-quality.md) §1a–1c):
- **Three tiers:**
  - read facts are never overwritten
  - inferred fields are suggested with evidence
  - people, legal entity, legal name, employee count and revenue are never guessed (dropped in code)
- **Confidence bar:**
  - facts need high confidence and 2 real evidence items
  - generated writing (pitch, style, Content Kit) needs at least 1
  - everything else is listed as "Not enough evidence" with the reason
- **The owner decides:** every suggestion is reviewed; edits become `user_edited`, and "Wrong? Remove" is remembered.

**Without a key or passcode (preview mode):** a free heuristic pass (`src/lib/ai/heuristics.ts`):
- **Industry and groupings** from a keyword map (sushi, KBBQ, hot pot, boba, HVAC, plumbing, game server hosting…).
- **Channels and funnels** from CTA patterns ("order online" → online ordering, "book now" → online booking, "apply now" → hiring, "get a quote" → quote request).
- **Business model hints:** bookings plus locations → B2C, local; monthly plans with no location → Subscription.
- The same 2-evidence rule applies, and results are marked "Inferred".

**Cost** (third-party list prices; check OpenAI's pricing page):

| | per run |
|---|---|
| gpt-5.4-mini | about $0.02–0.03, depending on site size |
| gpt-5.4 (text call) | about $0.08 |

Runs are capped per day, and cached per knowledge base version.

### Reading menus (Phase 10)

Restaurants keep their offerings in menus, and menus usually come as PDFs or images. **Read menus with AI** has its own button (Offerings tab) and route (`/api/menus`), separate from Enrich with AI, so the text and vision call stays fast.

- **What it reads:**
  - picture-only menu PDFs (sent to the model as files)
  - menu images (high detail)
  - PDF text too jumbled for the heuristics
  Text PDFs are read for free during the scrape with unpdf; no AI is used for their text.
- **Cap and order:** up to **8 pages or images per run** (a 2-page PDF counts as 2), plus up to 4 jumbled-text menus. Restaurant pages come before hub pages, then smaller files; for images, ones named like a menu come first, then the biggest. The note says how many are left: "Run again to read the next batch".
- **Time:** all menus in a run are read in parallel, and nothing new starts after 40 s. Whatever finished is returned, within the route's 60 s.
- **Cache:** each menu is cached on its own, keyed by prompt, model and file URL (plus the text for jumbled-text menus). A second run costs nothing for menus already read and doesn't need quota if everything is cached.
- **Quota:** one unit of the daily live-AI cap per run, with the same passcode as Enrich with AI.
- **Prompt:** [menu-reader.v1](../prompts/menu-reader.v1.md): copy items as printed, never estimate a price, skip house rules and notices.
- **Confidence:** see [data-quality.md](data-quality.md) §1d.

**Cost** (gpt-5.4-mini, third-party list prices): a high-detail menu page is about 2.5k input tokens, and the items read are 1–2k output tokens. That's about **$0.01 per page**, so **at most about $0.09 per run** at the cap of 8.

## Principles
1. **Official APIs, used within their terms.** No HTML scraping of platforms that forbid it.
2. **The owner's permission for the owner's accounts.** Connecting Instagram or Google Business Profile happens through the platform's own login (OAuth), and the owner can disconnect anytime. This fits MoFlo: the customer *is* the business owner.
3. **Every value keeps its source.** Enriched values are stored like any other field, e.g. `source: "google_places:<place_id>"`, with confidence:
   - `scraped` when the API returns the fact directly
   - `inferred` when we derive it
   - `ai_live` for AI summaries

   Owner edits always win.
4. **Ask before overwriting.** When a source disagrees with the website (two different phone numbers), show both and let the owner pick. Never silently replace.
5. **Respect caching and display rules.** Some APIs limit how long data may be stored or require attribution (Google Places, Yelp). Those values are refreshed from the API rather than kept forever, and shown with attribution where required.

---

## Allowed: official APIs with the owner's permission (OAuth)

The owner connects the account in MoFlo; we read only that business's own data.

| Source | What it gives | Fills |
|---|---|---|
| **Google Business Profile API** | Verified name, address, phone, hours, categories, service areas, the owner's reviews, posts | `company.mainAddress`, `company.otherLocations`, `company.serviceLocations`, `contact.phones`, `company.industry`, `insights.testimonials`, `insights.trustSignals` (rating, review count) |
| **Instagram Graph API** (business or creator account) | Bio, website, follower count, recent posts with captions and hashtags | `brand.writingStyle` (via the writing-style prompt), `contentKit.hashtags`, `insights.contentThemes`, `brand.socialLinks`, `brand.artStyle` (from post images, vision) |
| **Facebook Pages API** (Meta Graph) | Page about, category, address, phone, hours, website, rating, recent posts | `company.overview`, `company.industry`, `company.mainAddress`, `contact.phones`, `insights.trustSignals`, `insights.promotions` (from posts) |
| **TikTok Login Kit + Display API** | Profile, bio, follower count, the owner's videos with captions | `brand.writingStyle`, `contentKit.socialHooks`, `contentKit.hashtags`, `insights.contentThemes` |
| **LinkedIn Organization / Community Management APIs** (page admin) | Company page description, industry, company size range, founded year, specialties, locations | `company.employeeCount`, `company.yearFounded`, `company.industry`, `company.overview`, `customers.industryGroupings`, `insights.differentiators` (specialties) |

LinkedIn's organization APIs need approved developer access and the user must be a page admin. Until then, the owner can paste their LinkedIn "About" text into **Add info yourself**, which already works.

## Allowed: public APIs (API key, public business data)

| Source | What it gives | Fills | Notes |
|---|---|---|---|
| **Google Places API** | Business name, formatted address, phone, website, hours, types, rating, user rating count, a few recent reviews, business status | `company.mainAddress`, `contact.phones`, `company.industry`, `insights.trustSignals` ("4.6 from 11,415 reviews"), `insights.testimonials` (with attribution) | Match by website domain plus name, and confirm with the owner. Follow Google's caching and attribution terms (the place ID may be stored; most other content must be refreshed). |
| **Yelp Fusion API** | Categories, rating, review count, price level, hours, short review excerpts | `company.industry`, `insights.trustSignals`, `offerings` price level hint | Display and caching rules apply; excerpts only, with a link back. |
| **YouTube Data API** | Channel description, subscriber count, video titles and descriptions | `brand.socialLinks`, `insights.contentThemes`, `contentKit.blogIdeas` (from popular topics), `brand.writingStyle` | Public channel data needs only an API key. |
| **Discord invite endpoint** (`GET /api/v10/invites/{code}?with_counts=true`) | Server name, description, approximate member and online counts | `insights.trustSignals` (e.g. "a 12,000-member community"), `insights.communityValues`, `customers.channels` | For invite links already found on the site (Apex links one). |
| **Brandfetch API** | Official logos (light and dark variants), brand colors, fonts by domain | `brand.logos`, `brand.colors`, `brand.fonts` | A second opinion on our CSS-based colors and logo detection. Mark as `inferred` when it disagrees with the site. |
| **OpenCorporates API** | Legal name, entity type, incorporation date, status, registered address, jurisdiction | `company.legalName`, `company.legalEntityType`, `company.yearFounded` (as incorporation year, labeled), `company.alternateNames` (DBAs where listed) | Open data with attribution; an API key for volume. |
| **State business registries** (Nevada SilverFlume, Arizona Corporation Commission, California bizfile…) | Same as OpenCorporates, straight from the state | Same as OpenCorporates | Use official APIs or bulk data where a state offers them. Where it only has a search page, link the owner to it rather than scraping it. |
| **AI web search** (model with a search tool) | Press mentions, awards, news, "as seen in" | `insights.pressMentions`, `insights.trustSignals` (awards), `insights.positioningSignals` | Every result must come with its URL. Stored as `inferred` and shown for the owner to confirm, never as a fact. No people searches. |

## Not allowed

| Don't | Why |
|---|---|
| **Scrape social platforms directly** (Instagram, Facebook, LinkedIn, TikTok, X pages) | Against their terms, brittle, and it often means reading data behind a login. Use the official APIs above with the owner's OAuth. |
| **Create fake or shared "scraper" accounts** to see logged-in content | Violates platform terms and misrepresents who is accessing the data. |
| **Bypass blocks:** ignore robots.txt, rotate IPs or user agents to dodge rate limits, solve CAPTCHAs, get around paywalls or Cloudflare challenges | If a site says no, the answer is the owner's permission or the owner's own content (XenFlo's consent checkbox and upload fallback), not evasion. XenFlo always identifies itself as `XenFloBot/1.0`. |
| **Scrape Google Maps, Yelp or review site HTML** | They offer APIs with terms. Use those. |
| **Collect personal data about individuals** (reviewers' profiles, employees' personal social accounts, home addresses) | The knowledge base is about the business. People entries come only from what the business publishes about its own team. |
| **Buy scraped data dumps** | Unknown provenance and consent; values couldn't be traced to a source. |
| **Let AI fill gaps from "general knowledge"** | Models confuse similar businesses. AI may only summarize facts with a cited source (see `prompts/`). |

---

## Field coverage at a glance

Which outside sources could fill the fields websites most often leave empty (from Apex, Dragon Factory and Goettl testing):

| Field | Often missing because | Best sources |
|---|---|---|
| `company.mainAddress` | Online-only business, or the address is only in a map embed | Google Business Profile, Google Places, state registry (registered address, labeled as such) |
| `company.yearFounded` | Not stated on the site | LinkedIn, OpenCorporates or state registry (incorporation year, labeled) |
| `company.legalEntityType` / `legalName` | Only in fine print, or not at all | OpenCorporates, state registry |
| `company.employeeCount` | Almost never on small-business sites | LinkedIn (size range) |
| `company.industry` | No JSON-LD type | Google Places types, Yelp categories, LinkedIn industry |
| `contact.phones` / `emails` | Contact form only (Apex uses live chat) | Google Business Profile, Facebook Page |
| `insights.trustSignals` | Reviews live on Google and Yelp, not the site | Google Places, Yelp, Google Business Profile |
| `brand.writingStyle` / `contentKit.*` | Sites are short; the real voice lives on social | Instagram, TikTok, YouTube (via the writing-style prompt) |
| `brand.logos` / `brand.colors` | Image-only or theme-default sites | Brandfetch (cross-check), logo-vision prompt |
| `offerings` (Dragon Factory) | Menus are picture PDFs | Read menus with AI (today), owner uploads; later Google Business Profile menu links or the ordering platform's official API with the owner's permission (Toast, Square, Clover) |

## Order of operations (suggested)
1. Scrape the website (today's XenFlo).
2. Offer **one-click connections** for the owner's Google Business Profile and Instagram. These have the highest value and the clearest permission.
3. Run **public lookups** (Places by domain, OpenCorporates by name and state) and show matches as suggestions: "We found a matching business registered in Nevada. Is this you?"
4. Run **AI enrichment** last, over everything gathered, using the prompts in `prompts/`.
5. Re-check sources on re-scrape and highlight anything that changed.
