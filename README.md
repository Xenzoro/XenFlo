# XenFlo

**Knowledge Builder for MoFlo Cloud.** Paste a company's website address and XenFlo reads its most important pages, turns what it finds into a structured knowledge base (company facts, customers, brand, people, offerings, insights), lets the owner review and edit every field, and saves it to Supabase as versioned JSON. That knowledge base is what MoFlo's apps (MoSocial, MoMail, MoBlogs, MoReviews) would write from.

This is my take on MoFlo's "MoKnowledge" feature for the MoFlo Builder Challenge.

- **Live demo:** _coming soon (Vercel link)_
- **Demo video:** _coming soon_

| Scrape and review | Brand tab | Saved knowledge bases |
|---|---|---|
| _screenshot: `docs/screenshots/knowledge.png`_ | _screenshot: `docs/screenshots/brand.png`_ | _screenshot: `docs/screenshots/view.png`_ |

---

## Contents
- [Setup and run](#setup-and-run)
- [Features](#features)
- [Scraping approach](#scraping-approach)
- [Data model and schema](#data-model-and-schema)
- [AI enrichment and prompts](#ai-enrichment-and-prompts)
- [Testing on real sites](#testing-on-real-sites)
- [Assumptions and limitations](#assumptions-and-limitations)
- [Security](#security)
- [How AI tools were used](#how-ai-tools-were-used)
- [Ideas I'd love to build with the team](#ideas-id-love-to-build-with-the-team)
- [Project layout](#project-layout)

---

## Setup and run

**Requirements:** Node 20+, npm, and a Supabase project (the free tier is fine).

```bash
git clone <this repo> xenflo && cd xenflo
npm install
cp .env.example .env.local   # then fill it in (below)
npm run dev                   # http://localhost:3000 → redirects to /knowledge
```

### `.env.local`

| Variable | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes, to save | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes, to save | The public key. It can read and write nothing on its own (no anon policies). |
| `SUPABASE_SERVICE_ROLE_KEY` | yes, to save | Server-only secret key. Used only in API routes and never sent to the browser. |
| `OPENAI_API_KEY` | no | Enables live AI enrichment. Without it, Enrich with AI gives labeled preview suggestions. |
| `AI_PASSCODE` | no, but needed for live AI | Passcode people type to use live AI. **Live AI stays off until this is set**, so a deploy can't run up costs by accident. |
| `AI_MODEL_TEXT` | no | Text model (default `gpt-5.4-mini`) |
| `AI_MODEL_VISION` | no | Vision model for logos, hero images and screenshots (default `gpt-5.4-mini`) |
| `AI_DAILY_LIMIT` | no | Live AI runs allowed per day across the whole site (default `20`; cached results don't count) |
| `SCRAPER_USER_AGENT` | no | Overrides the default `XenFloBot/1.0` User-Agent. |

Scraping and preview enrichment work without Supabase or OpenAI. Saving and the `/knowledge/view` page return a clear "not configured" error until the Supabase keys are set.

### Database

Run the migrations in `supabase/migrations/` in order, with the Supabase CLI (`supabase db push`) or by pasting each file into the SQL editor:

1. `20261009120000_knowledge_schema.sql`: tables, indexes, RLS policies, and the save/version functions
2. `20261009130000_version_conflict_code.sql`: returns HTTP 409 when someone saved a newer version
3. `20261009140000_revoke_rls_auto_enable.sql`: clears a Supabase security advisor warning (safe to run anywhere)
4. `20261009165731_ai_enrichment.sql`: AI result cache and the daily AI cap
5. `20261010120000_uploads_and_scrape_consent.sql`: private `uploads` storage bucket and owner-consented scrapes

### Deploy to Vercel

1. **Import** the GitHub repo in Vercel (framework: Next.js; the defaults are fine).
2. **Environment variables** (Project → Settings → Environment Variables):

   | Variable | Production | Preview |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ |
   | `SUPABASE_SERVICE_ROLE_KEY` | ✓ (mark Sensitive) | ✓ (Sensitive) |
   | `OPENAI_API_KEY` | ✓ (Sensitive) | leave empty, so preview deploys use preview mode |
   | `AI_PASSCODE` | ✓ (Sensitive; share only with reviewers) | leave empty |
   | `AI_DAILY_LIMIT` | `20` | - |
   | `AI_MODEL_TEXT`, `AI_MODEL_VISION` | optional | optional |

   `NEXT_PUBLIC_*` values are public by design (the anon key can't read anything because there are no anon RLS policies). Everything else stays on the server.
3. **Database:** run the migrations above on the Supabase project those keys point to.
4. **Deploy.** The scrape, Dig deeper and enrich routes set `maxDuration = 60`, which fits the Hobby plan. A scrape stops starting new pages after 30 seconds, and each AI call times out after 25 seconds.
5. **Smoke test:** scrape a site, save it, open `/knowledge/view`, then run Enrich with AI with and without the passcode.

Changing an environment variable needs a redeploy to take effect.

### Checks

```bash
npx tsc --noEmit   # type check
npm test           # unit tests (Vitest)
npm run lint
npm run build
```

---

## Features

### `/knowledge`: build a knowledge base
- **URL input** accepts `example.com`, `www.example.com` or a full `https://` address, and rejects anything that isn't a real web address.
- **Progress card** shows the real steps: checking robots.txt, fetching the homepage, discovering pages, crawling, extracting, scoring.
- **Clear errors** for an invalid URL, timeout, unreachable site, robots.txt block, AI-crawler restriction, and no readable content.
- **Tabs, simple by default:**
  - **Overview:** Knowledge Health gauge (0–100), "Next to do" cards with point gains ("Add your founding year +5"), and a Content Kit preview.
  - **Company, Customers, Brand, People, Offerings:** every field editable inline. Empty fields show dashed "+ Add" pills.
  - **Enrich with AI:** suggestions for the pitch, writing style, ideal customer, Content Kit, art style and logo brand names. You accept or reject each one (see [AI](#ai-enrichment-and-prompts)).
- **Brand:** colors split into **Primary** (top 3) and **Secondary**, shown as swatches; logos as images (white logos automatically get a dark background, with a light/dark toggle, and duplicates are grouped); fonts rendered in their own face; social icons.
  - **People:** team members are kept separate from customers and partners, so testimonial authors never end up on the team.
- **Advanced view** (toggle, top right) adds **Insights**, **Content Kit**, **Sources** (pages crawled, crawl log, per-field sources, completeness breakdown, Dig deeper) and **Raw JSON** (copy and download). Every field also gets a confidence badge: Scraped, Inferred, AI preview, AI, User edited or Missing.
- **Dig deeper** crawls more of the pages found, up to 30 in total. **Add info yourself** lets the owner paste text or upload files to fill empty fields without overwriting what's there.
- **Upload fallback** for blocked or thin sites: paste text, upload an HTML file or screenshots, behind a required ownership checkbox (see [consent](#robotstxt-and-owner-consent)).
- **Save** writes a new version to Supabase and also offers the JSON.
- **First-visit tour:** the page dims and a glowing highlight moves between the scrape bar, tabs, health gauge, Advanced toggle and Save. It can be replayed anytime from "Take a tour".

### `/knowledge/view`: manage saved knowledge bases
- Card, table and detailed views
- Search, plus filters for industry, completeness range and date; sorting
- Edit, delete (with confirm), duplicate, export JSON, re-scrape; bulk actions
- Version history drawer: open any earlier version and restore it

### Design
Light, MoFlo Cloud style: `#f8f9fb` page, white `rounded-2xl` cards, primary blue `#2563EB`, Poppins, uppercase gray section labels, pill toggles, a thin icon sidebar and gauge rings. Framer Motion handles staggered lists, modal fades and the spotlight tour, and respects reduced motion. Responsive down to phone width.

---

## Scraping approach

Everything runs server side in API routes (`src/app/api/scrape`), split into small modules under `src/lib/scraper/`.

### robots.txt and owner consent
1. XenFlo reads `robots.txt` first and identifies itself honestly as `XenFloBot/1.0`.
2. **If robots.txt blocks XenFloBot**, or **asks AI crawlers to stay out** (GPTBot, ClaudeBot, CCBot, Google-Extended, PerplexityBot and 9 others), the scrape stops and shows a friendly panel. The owner can then either:
   - tick **"I own this business or have permission from the owner to use this website's content"** and continue, or
   - paste content or upload files instead.
3. The consent is stored with the knowledge base (`confirmed: true`, timestamp, and method: `checkbox_scrape`, `checkbox_paste` or `checkbox_upload`), and in the `upload_consents` table when saved.
4. Even with consent, the crawl stays polite: honest User-Agent, small page cap, and the site's Crawl-delay (capped at 3 seconds).

### Priority, then adaptive crawl
1. **Homepage** (10s timeout, redirects followed, non-200s handled). Its CSS is read for fonts and colors.
2. **Discover** links from the nav, header, footer and body, plus `sitemap.xml` (from robots.txt or common locations). Each link is categorized (about, team, services, products, pricing, features, faq, testimonials, contact, locations, press, careers, blog, legal) and scored. Nav links rank higher; deep paths and blog posts rank lower.
3. **Priority pages:** the best page of each useful kind is crawled first.
4. **Adaptive pages:** after each batch, XenFlo checks which important fields are still empty and picks pages likely to fill them. For example, if testimonials are missing it tries `/reviews`; if offerings are missing it tries `/pricing`, `/menu` or `/plans`. Pages are ranked by the completeness points they could add.
5. **Limits:** **15 pages first**, then **up to 30 in total with Dig deeper**. There is a 30-second time budget, 2 requests at a time, and a 300ms pause between requests.

### Extractors (`src/lib/scraper/extract/`)
| Module | Reads |
|---|---|
| `meta` | title, meta description, Open Graph and Twitter tags, `theme-color` |
| `jsonld` | `ld+json`: Organization, LocalBusiness, Product, FAQPage, Review, Person |
| `about` | overview, founding story, year founded |
| `address` | US street addresses from page text (one line or split across `<br>`/block lines; units like `#105`, `Ste`, `Suite`, `Unit`), with Google/Apple Maps links and embeds as an inferred fallback. Sorted into main address and other locations. |
| `contact` | emails, phones (preferring a location page's own number), contact page |
| `social` | LinkedIn, Facebook, Instagram, X, YouTube, TikTok, Twitch, Discord, Pinterest |
| `offerings` | product, service and plan cards with prices (fixed, starting at, range, subscription, quote, free) |
| `people` | team cards (name, title, bio, photo), kept apart from testimonial authors |
| `testimonials` | quote blocks, authors and ratings |
| `ctas` | button and CTA text with links |
| `signals` | FAQs, differentiators, trust signals (reviews, guarantees, certifications), promotions |
| `press` | press and "as seen in" links |
| `tech` | analytics, CRM, email, chat, payments and platform, detected from script and link sources |
| `branding` | logos, fonts and brand colors (below) |

Pasted text and uploaded HTML go through the same extractors (`/api/extract`).

### Heuristics worth knowing
- **Brand colors are ranked by where they're used, not where they're defined.**
  - Weights: buttons and CTAs count ×6, header and nav ×4, links ×2, everything else ×1. CSS variables are resolved where they're used.
  - Rules that only style plugin or block-library markup (`.wp-block-*`, `.kadence-*`, `.elementor-*`, `.swiper-*`) are ignored.
  - Known platform defaults are filtered out: WordPress `#007cba`/`#005a87`, Kadence `#f76a0c`, Swiper `#007aff`, Wix `#116dff`.
- **Logos:** an image with "logo" in its class, alt or src inside the header beats a JSON-LD logo, which beats an apple-touch-icon, an `og:image` or a favicon. Logos on "Partners" or "As seen on" sections are filed as partners instead.
- **Names from images without AI:** cleaned file names and alt text give sub-brand names (`Sumo Henderson_Logo.png` → "Sumo Henderson").
- **Fonts:** Google Fonts links weigh most; then `font-family` declarations with CSS variables resolved. Icon fonts (ETmodules, FontAwesome…), system fonts and hashed names are filtered out.
- **Main address vs other locations:**
  - On a location page (`/location/las-vegas`), that city's address is the main one.
  - A page listing 3+ addresses is a branch directory: all of them go to other locations.
  - The homepage, about, contact and locations pages can set the main address.
  - Any other page (one restaurant of a group) adds an other location, so a group with no head office keeps the main address empty instead of guessing.
  - A maps link holding only a place name ("Example Cafe") is never stored as an address.
- **Year and legal entity** come from the copyright line and text patterns (`© 2013 Apex Hosting LLC`).

### Confidence levels
Every value is stored as `{ value, source, confidence, updatedAt }`:

| Confidence | Badge | Meaning |
|---|---|---|
| `scraped` | Scraped | Read directly from a page (`source` is its URL) |
| `inferred` | Inferred | Derived by a rule from scraped data (a year from a copyright line, a name from a logo file) |
| `ai_mock` | AI preview | Placeholder output that is clearly labeled; no API call |
| `ai_live` | AI | Real model output the owner accepted (see [AI](#ai-enrichment-and-prompts)) |
| `user_edited` | User edited | Typed or changed by the owner |
| `missing` | Missing | Looked for and not found. It stays empty and is never guessed. |

The **Knowledge Health** score is a weighted checklist of 23 important fields that adds up to 100 (`src/lib/scraper/score.ts`). The missing ones drive both the "Next to do" cards and the adaptive crawl. More detail: [docs/data-quality.md](docs/data-quality.md).

---

## Data model and schema

- **One TypeScript type is the source of truth:** `src/types/knowledge.ts`, with a matching Zod schema in `src/types/knowledge.schema.ts` that is type-checked against it. API input and output are validated with it.
- **Supabase is a hybrid of JSONB and columns.** The full knowledge base lives in a `jsonb` column; the fields used for search, filters and sorting are copied into real columns.
- **Tables:**
  - `companies`
  - `knowledge_bases` (current version)
  - `knowledge_versions` (a snapshot on every save)
  - `crawl_runs`
  - `upload_consents`
  - plus a private `uploads` storage bucket
- **Saving:** goes through Postgres functions, so each save is one transaction. Version conflicts return 409.
- **Access:** RLS is on for every table with owner-only policies. The demo has no login, so it runs server side with the secret key.

Full details (columns, relationships, RLS, multi-company support, versioning, scaling): **[docs/schema.md](docs/schema.md)**.

Complete example outputs from real scrapes: **[data/examples/](data/examples/)**.

---

## AI enrichment and prompts

**Enrich with AI** (a button next to Save, on `/knowledge` and in the Detailed view) suggests the fields that need judgment rather than reading. It never runs automatically.

| Suggests | From |
|---|---|
| Pitch | [company-pitch.v1](prompts/company-pitch.v1.md) |
| Writing style and voice guide | [writing-style.v1](prompts/writing-style.v1.md) |
| Ideal customer, customer needs, target buyers | [ideal-persona.v1](prompts/ideal-persona.v1.md) |
| Content pillars, social hooks, hashtags, email subjects, blog ideas | [content-kit.v1](prompts/content-kit.v1.md) |
| Art style, brand names read from logos, facts from uploaded screenshots | [logo-vision.v1](prompts/logo-vision.v1.md) |

**How it works** (`src/lib/ai/enrich.ts`, the single entry point):
1. The prompt files in `prompts/` are loaded at runtime (up to each file's Example section) and combined into **one text call**. The images go into **one vision call**. Both run in parallel through OpenAI's Responses API, using plain `fetch` and no SDK.
2. The model must answer in a strict JSON schema built from Zod (`src/lib/ai/schemas.ts`). The reply is validated with the same Zod schema before it's used.
3. **Nothing is applied automatically.** The owner sees every suggestion next to the current value and ticks the ones to keep. Accepted values are stored with `confidence: "ai_live"` and `source: "ai:<model>"`, and show an **AI** badge everywhere (not only in Advanced view).
4. **Never invent facts.** The model only sees knowledge base fields, must return `null` when the facts don't support a field (shown as "Not enough facts for…"), and null answers never become suggestions. AI never overwrites a field the owner edited, and list suggestions only add new items.

**Live vs preview mode**
- **Live:** needs `OPENAI_API_KEY` **and** the right `AI_PASSCODE`, plus quota left today.
- **Preview** (`ai_mock`, "AI preview" badge): template suggestions built only from facts already in the knowledge base. There are no templates for writing style, persona or art style, so those aren't suggested. Preview is used:
  - with no key, or no passcode set on the server
  - when the user picks "Use preview mode"
  - when the daily cap is reached
  - when both AI calls fail
- **Fallbacks:** a wrong passcode is an error the user can fix rather than a silent switch. If only one call fails (timeout, bad reply), the other call's results are kept and a note explains what was skipped.

**Limits** (`src/lib/ai/config.ts`)
- **Calls:** one text call plus one image call per run; never automatic.
- **Input:** capped at about 12,000 tokens. Facts go in priority order: core facts, about and founding story, offerings, testimonials, FAQs, then the rest. Lists are trimmed from the end when over budget.
- **Output:** capped at 2,500 tokens per call. `reasoning.effort` is `none`, so the whole budget goes to the answer.
- **Images:** at most 2. The best raster logo and the hero image are sent at `detail: "low"`. Screenshots waiting for AI (`needsAiFields`) go first, at `detail: "high"`, because menus and about pages are text-heavy. SVG logos are skipped (OpenAI can't read them).
- **Cache:** results are cached in Supabase (`ai_enrichments`) by a hash of the prompt text, models and exact input. The same knowledge base version never pays twice, and cache hits don't count toward the cap.
- **Daily cap:** `AI_DAILY_LIMIT` (default 20) live runs per day site-wide, enforced atomically in Postgres (`take_ai_quota`).
- **Passcode:** `AI_PASSCODE`, compared in constant time. With no passcode configured, live AI is off.

**Model comparison** (Apex Hosting, same input, text call only; vision stayed on mini):

| | `gpt-5.4-mini` | `gpt-5.4` |
|---|---|---|
| Pitch | "We provide Minecraft server hosting with lag free hardware, 24/7 live chat support, free subdomain, and automated backups. Start your server and play with friends today." | "We provide Minecraft and game server hosting with lag free hardware, 24/7 live chat support, video guides, and server options for everything from basic servers to fully tailored setups. Start your server and play with friends today." |
| Writing style | "The brand sounds direct, helpful, and gaming-focused. It uses short, simple phrases, second-person and we-language, and leans on practical benefits like support, speed, and easy setup rather than fancy wording." | "The voice is direct, feature-led, and supportive, with short benefit-focused phrases and clear how-to explanations. It speaks in second person and first person, uses gaming and hosting jargon comfortably, and often leans on upbeat calls to action and reassuring support language." |
| Time / tokens | 6.5 s · 6,965 in / 607 out | 9.2 s · 6,965 in / 625 out |

Both stayed within the facts. gpt-5.4 noticed that Apex hosts more than Minecraft and wrote a more specific persona; mini was faster and a little more generic. The default is `gpt-5.4-mini`; switching is one environment variable (`AI_MODEL_TEXT`).

**Privacy note:** the demo's OpenAI project takes part in OpenAI's data sharing program, which keeps the demo's cost near zero. A production version would turn data sharing off, because owners may upload private information (screenshots, pasted documents). Requests are sent with `store: false` either way.

Outside sources that could fill the gaps (Google Places, business registries, official social APIs) and what is and isn't allowed are covered in **[docs/enrichment.md](docs/enrichment.md)**.

---

## Testing on real sites

These results come from the current code at the default 15-page cap. Full JSON is in [`data/examples/`](data/examples/).

### Apex Hosting (`apexminecrafthosting.com`): info rich
**Completeness 61 · 15 pages · ~11s**

What it found:
- **Offerings:** 33 with real prices (RAM plans like "4 GB RAM, $14.99/mo, $11.24 first month", and 28 other games "Starting at …").
- **Insights:** 33 FAQs, 9 testimonials, 8 differentiators, trust signals ("7 Day Money Back Guarantee", "7500+ Customers have given rating"), and the promo "25% off on first order with APEX25".
- **People:** 33 team members with titles, kept separate from 4 testimonial authors tagged as customers.
- **Company and contact:** 7 social platforms; `Apex Hosting LLC` from the copyright line; founding year inferred as 2013.
- **Brand:** lime and purple colors (`#c0ff1e`, `#9061f9`); the white header logo shows on a dark background automatically.

What it missed:
- No public email or phone (support is live chat), and no address.
- Every offering gets the category "Minecraft Server Hosting", even the other games. This is logged as an improvement.

### Dragon Factory (`dragonfactories.com`): multi-brand restaurant group, info in images (Wix)
**Completeness 51 · 15 pages · ~7s**

What it found:
- **Sub-brands:** 8 restaurant brand names, recovered from logo file names, alt text and page names: Neko Loco, Chojang, Sumo Hotpot, Sushi Sumo Decatur, Sumo Henderson, Omakase Sumo, Neko Hana, Umami.
- **Story:** founding story and year (2013).
- **Contact and brand:** a careers email, a phone number and Instagram. Wix font names were cleaned (`avenir-lt-w01_35-light1475496` → "Avenir LT"). Wix's own UI blue `#116dff` is now filtered out of the colors.

**Locations:** each restaurant has its own page with one address under the opening hours. XenFlo files all 10 as **other locations**, including three suites in the same building. It leaves the main address empty, because the group's site doesn't name a head office.

What it missed: offerings, people, testimonials and FAQs are empty. The menus, prices and most brand names live inside images. That's the clearest case for the vision prompt and the screenshot upload fallback.

### Goettl Air Conditioning and Plumbing (`goettl.com/location/las-vegas/`): HVAC, a typical MoFlo customer
**Completeness 60 · 15 pages · ~14s**

This is a WordPress + Kadence site, and it exposed a real bug in brand colors. The old version counted how often each color appeared in the CSS, so WordPress's admin blues and Kadence's highlight orange won. The new version ranks colors by where they're used and ignores plugin-only rules:

| | Brand colors found |
|---|---|
| **Before** | `#007cba` `#005a87` (WordPress blues), `#2b6cb0`, `#f76a0c` (Kadence orange), `#003963`, `#35c0dd`. **Goettl's red was missing entirely.** |
| **After** | **`#003963` (navy), `#cd163f` (red)**, then `#acdcff`, `#72b556`, `#2b6cb0`, `#44d62c` |

Navy and red match the palette in Goettl's own theme settings and are used on its Book Now buttons and header.

Other results:
- **Found:** founded 1939; 9 trust signals (including "4.6, 11,415 Reviews" and "The RIGHT WAY Guarantee"); senior, military and first-responder discounts; 12 CTAs ("Book Now", "Book Online"…); HubSpot, Google Analytics and Google Maps detected.
- **Logos:** the duplicates (the same logo in the header and JSON-LD, the same icon as apple-touch-icon and favicon) now show once, with every place they were found.
- **Weak spots it showed:**
  - **Offerings:** 42 were found, but many are page section headings ("Signs You Need Duct Services") rather than services.
  - **Founding story:** mixes Goettl's 1939 founding with "Keeping Las Vegas cool since 2012".

  Cases like these are what the owner's review and AI cleanup are for (see [data-quality](docs/data-quality.md)).
- **Addresses:** the main address is the Las Vegas branch (written across two lines: "6521 West Post Rd., Suite 1,<br>Las Vegas, NV 89118"). The other 5 branches listed on the page are kept as other locations.
- **Fixed after testing: phones and alternate names.** This is a location page, and Goettl's `/locations` directory lists every branch's number. The scraper now keeps only valid phone numbers, prefers the number listed next to "Las Vegas, NV", and skips numbers next to other branches' addresses. Alt text only counts as a brand name when it names a logo, not when it describes a photo.

  | | Before | After |
  |---|---|---|
  | Phones | (213) 317-2704, (844) 446-3885, **"CALL Now"**, 6025368852 (Phoenix), 5202145988 (Tucson), +1702-291-9893, +1210-405-6238 (San Antonio), 7377272107 (Austin) | (213) 317-2704 (on the Las Vegas page), **(702) 291-9893** (Las Vegas listing), (844) 446-3885 (company-wide) |
  | Alternate names | Goettl - Since 1939 - Air Conditioning and Plumbing, Goettl Tech, **Person holding a wrench in front of the goettl**, Original Goettl Air Conditioning | Goettl Tech, Original Goettl Air Conditioning |

### Anime Boba Cafe (`animebobacafe.com`): blocked site, template placeholder staff
- Its robots.txt asks AI crawlers (GPTBot, ClaudeBot and others) to stay out, so XenFlo stops and shows the blocked panel with the ownership checkbox and upload options. That is the demo of the consent flow. Its content was only used with the owner's permission.
- With permission, the scrape worked technically, but the About page lists **three staff profiles that appear to be template filler** on a real site. The scraper read them correctly; the content itself isn't real.
- The site also still has WordPress demo pages (`/sample-page`, `/hello-world`) and WordPress default colors.
- This is the motivating case for placeholder detection in [docs/data-quality.md](docs/data-quality.md).

---

## Assumptions and limitations

**Assumptions**
- The user is the business owner or has their permission. The consent checkbox records that whenever robots.txt or the site's setup gets in the way.
- A small business's important facts are on 15 to 30 pages: home, about, services, pricing, FAQ, contact, reviews.
- No login for the demo. The schema, RLS and storage policies are ready for users and teams.

**Limitations**
- **No JavaScript rendering.** Sites that build everything in the browser (some React and Wix pages) return little text; XenFlo warns when the homepage has fewer than 30 words.
- **AI is opt-in and capped.** Pitch, writing style, persona and art style stay Missing until the owner fills them in or accepts AI suggestions. The public demo needs a passcode for live AI and is limited to 20 runs a day.
- **Vision can't read SVG logos** (Apex's logo is an SVG), so art style may come from the hero image instead. Screenshots can fill overview, founding story, phones and emails; offerings and people from screenshots aren't extracted yet.
- **Heuristics misfire** on some layouts: for example, section headings read as offerings. Every value shows its source and confidence in Advanced view, so these are easy to spot and fix.
- **Information inside images** (menus, logos with names, flyers) needs vision AI.
- **Colors and fonts** come from the homepage's CSS only (inline styles plus up to 3 of the site's own stylesheets).
- **No live progress:** the scrape API returns everything at the end, so the progress card shows the steps rather than each page as it finishes.
- **Re-scrape** can bring back items the owner deleted by hand.

---

## Security

### The scraper only reads public websites (SSRF protection)
Users choose the URL, and the sites they point at choose where to redirect. Without a guard, the server could be turned against itself, the local network or cloud metadata (`169.254.169.254`). `src/lib/scraper/safety.ts` blocks that:

1. **Address checks on every request.** Before *every* request, including robots.txt, sitemaps, stylesheets and inner pages, the URL must:
   - use http or https on the standard ports (80/443), with no username or password
   - not be an IP literal or a hostname like `localhost`, `*.local` or `*.internal`
   - resolve in DNS **only** to public addresses
2. **What counts as private.** Loopback, RFC 1918 private ranges, carrier-grade NAT, link-local (cloud metadata), multicast, documentation and reserved ranges, IPv6 unique-local and link-local, and IPv4 hidden inside IPv6 (`::ffff:127.0.0.1`, NAT64). If a name has several addresses and any one is private, the request is refused.
3. **Redirects are followed by hand** (`redirect: "manual"`, at most 5 hops). Every hop goes through the same check, so a public site can't bounce the scraper to `http://127.0.0.1` or the metadata endpoint.
4. **Dig deeper only follows URLs on the company's own domain.** The list of pages left to crawl comes back from the browser, so it isn't trusted.

Blocked addresses return `PRIVATE_ADDRESS` ("That address isn't a public website").

Tested by asking it to scrape the following, all refused:
- `localtest.me` and `127.0.0.1.nip.io`, which resolve to 127.0.0.1
- `10.0.0.1.nip.io` and `169.254.169.254.nip.io`
- an httpbin redirect to `http://127.0.0.1/` and to the metadata URL
- `example.com:8080`
- a Dig deeper request with private URLs planted in its page list

Normal sites, including http→https and bare→www redirects, still work.

**Known gap:** the DNS check and the actual connection resolve the name separately, so a DNS-rebinding attacker with a very short TTL could, in theory, answer differently the second time. Closing that fully means pinning the connection to the checked IP with a custom HTTP agent (the `undici` package), or running the scraper in an isolated network with no route to private ranges, which serverless hosting like Vercel largely already is.

### Other protections
- **Secrets stay on the server:** the Supabase secret key and the OpenAI key are only read in API routes. The browser only ever sees the public Supabase URL and anon key, and the anon key can't read anything (no anon RLS policies).
- **Database access:** RLS is on for every table; AI cache and quota tables are server-only; Postgres functions have execute revoked from `anon`.
- **Uploads:** screenshots go to a private bucket with type and size limits (PNG/JPG/WebP, 5 MB), and are shown through 1-hour signed URLs.
- **AI costs:** live AI needs a passcode (compared in constant time), runs only from a button, and is capped per day in Postgres.
- **Polite crawling:** robots.txt is respected unless the owner gives consent, which is recorded. The User-Agent is honest, and page caps, time budgets and crawl delays apply.
- **Input validation:** every API body is validated with Zod, and pasted text and files have size limits.

## How AI tools were used

I built XenFlo with **Claude Code** as my pair programmer. It did most of the scaffolding and implementation: the scraper modules, components, migrations and a lot of the TypeScript. **The design, product decisions, testing and direction were mine.**

That included:
- choosing what the knowledge base should contain and how it should feel for a non-technical owner
- the progressive disclosure (simple tabs first, Advanced view for power users)
- the consent-first approach to blocked sites
- testing on real businesses and deciding what "right" looked like

For example, I noticed Goettl's colors were WordPress blues instead of their real red and navy, and decided colors should be ranked by where they're used.

I reviewed every change, ran the builds, and kept a running log of what broke on real sites in [docs/improvements.md](docs/improvements.md).

---

## Ideas I'd love to build with the team

Pulled from my running log, **[docs/improvements.md](docs/improvements.md)**, which has the full list with where each issue was found.

- **Placeholder and template detection.** Flag demo pages (`/sample-page`, `/hello-world`), known template names and lorem ipsum, and mark the knowledge base "may contain template content, please review" instead of trusting it.
- **A verification pass.** After extraction, check that each value actually appears on its source page. Anything that doesn't is dropped or marked unverified.
- **Live crawl progress.** Stream crawl events so the progress card shows real pages as they finish.
- **Vision AI for image-heavy sites.** Read menu images and logo names (Dragon Factory), and check that an image is a real logo before asking AI to describe its art style.
- **Owner-friendly AI consent.** When robots.txt restricts AI crawlers, ask "Are you the owner?" instead of refusing, record the consent, and continue. (Built here; I'd love to refine it with real customers.)
- **Accurate service areas.** An online business shouldn't get a single local voice. I saw MoFlo write "Florida's gaming scene is booming" for Apex, which isn't a Florida business.
- **Voice from real customers.** Calibrate writing style and audience from testimonials and customer language, so a friendly gamer brand doesn't get corporate blog titles.
- **Outside enrichment.** Use Google Places, state business registries and official social APIs to fill founded year, employees, legal entity and address (see [docs/enrichment.md](docs/enrichment.md)).
- **Respect owner edits on re-scrape.** Remember dismissed and replaced items so a fresh crawl doesn't add them back.

---

## Project layout

```
src/app/                pages (/knowledge, /knowledge/view) and API routes (scrape, extract, knowledge, uploads)
src/components/         ui/, knowledge/ (workspace, tabs, fallback), view/, tour/
src/lib/scraper/        fetch, robots, discover, crawl, styles, colors, score, extract/*
src/lib/db/             Supabase data layer (the only code that talks to the database)
src/lib/ai/             enrich() entry point, prompt loading, schemas, OpenAI call, preview mode
src/types/              knowledge.ts (source of truth) + knowledge.schema.ts (Zod)
supabase/migrations/    SQL migrations
prompts/                versioned enrichment prompts
docs/                   schema, data quality, enrichment, improvements log
data/examples/          complete JSON from real scrapes
```
