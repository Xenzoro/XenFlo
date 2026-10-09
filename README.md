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
| `OPENAI_API_KEY` | no | Reserved for live AI enrichment (not wired in yet, see [AI](#ai-enrichment-and-prompts)). |
| `SCRAPER_USER_AGENT` | no | Overrides the default `XenFloBot/1.0` User-Agent. |

Scraping works without Supabase. Saving and the `/knowledge/view` page return a clear "not configured" error until the keys are set.

### Database

Run the migrations in `supabase/migrations/` in order, with the Supabase CLI (`supabase db push`) or by pasting each file into the SQL editor:

1. `20261009120000_knowledge_schema.sql`: tables, indexes, RLS policies, and the save/version functions
2. `20261009130000_version_conflict_code.sql`: returns HTTP 409 when someone saved a newer version
3. `20261009140000_revoke_rls_auto_enable.sql`: clears a Supabase security advisor warning (safe to run anywhere)
4. `20261010120000_uploads_and_scrape_consent.sql`: private `uploads` storage bucket and owner-consented scrapes

### Checks

```bash
npx tsc --noEmit   # type check
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
| `contact` | emails, phones, addresses, contact page |
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
- **Year and legal entity** come from the copyright line and text patterns (`© 2013 Apex Hosting LLC`).

### Confidence levels
Every value is stored as `{ value, source, confidence, updatedAt }`:

| Confidence | Badge | Meaning |
|---|---|---|
| `scraped` | Scraped | Read directly from a page (`source` is its URL) |
| `inferred` | Inferred | Derived by a rule from scraped data (a year from a copyright line, a name from a logo file) |
| `ai_mock` | AI preview | Placeholder output that is clearly labeled; no API call |
| `ai_live` | AI | Real model output (reserved; see below) |
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

**XenFlo runs without any AI calls today.** Fields that need AI are left empty and marked Missing, never guessed:
- pitch
- writing style
- ideal persona
- art style

The Overview's Content Kit preview is built from templates using only facts already in the knowledge base. It carries an "AI preview" badge so it's never mistaken for real model output (`src/lib/ai/mockPreview.ts`).

The enrichment prompts are **designed and versioned, but not wired in yet.** The plan:
1. One `enrich()` function calls them server side when `OPENAI_API_KEY` is set.
2. It falls back to the labeled mock on any failure or without a key.
3. Screenshots uploaded in the fallback flow are stored, ready for the vision prompt.

| Prompt | Fills |
|---|---|
| [company-pitch.v1](prompts/company-pitch.v1.md) | `company.pitch` |
| [writing-style.v1](prompts/writing-style.v1.md) | `brand.writingStyle`, `contentKit.voiceGuide` |
| [ideal-persona.v1](prompts/ideal-persona.v1.md) | `customers.idealPersona`, `customers.customerNeeds`, `customers.targetBuyers` |
| [logo-vision.v1](prompts/logo-vision.v1.md) | `brand.artStyle`, `company.alternateNames`, color hints |

Each prompt defines:
- the model's role and the input format
- a JSON output schema matching `src/types/knowledge.ts`
- rules against inventing facts, and how to mark missing data
- an example

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
  - **Phones:** numbers from other Goettl locations, and the button text "CALL Now", get picked up.
  - **Alternate names:** a photo's alt text ("Person holding a wrench…") became one.
  - **Founding story:** mixes Goettl's 1939 founding with "Keeping Las Vegas cool since 2012".

  These are exactly the cases an AI cleanup pass or the owner's review would catch (see [data-quality](docs/data-quality.md)).

### Anime Boba Cafe (`animebobacafe.com`): blocked site, template placeholder staff
- Its robots.txt asks AI crawlers (GPTBot, ClaudeBot and others) to stay out, so XenFlo stops and shows the blocked panel with the ownership checkbox and upload options. That is the demo of the consent flow. Its content was only used with the owner's permission.
- With permission, the scrape worked technically, but the About page lists three staff members (Akira Yamamoto, Sakura Tanaka, Kenji Nakamura) who appear to be **template filler on a real site**. The scraper read them correctly; the content itself isn't real.
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
- **No live AI yet.** Pitch, writing style, persona and art style stay Missing unless the owner fills them in.
- **Heuristics misfire** on some layouts: section headings read as offerings, numbers from other locations read as phones, alt text read as names. Every value shows its source and confidence in Advanced view, so these are easy to spot and fix.
- **Information inside images** (menus, logos with names, flyers) needs vision AI.
- **Colors and fonts** come from the homepage's CSS only (inline styles plus up to 3 of the site's own stylesheets).
- **No live progress:** the scrape API returns everything at the end, so the progress card shows the steps rather than each page as it finishes.
- **Re-scrape** can bring back items the owner deleted by hand.

---

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
src/lib/ai/             mock AI preview (enrich() goes here when wired)
src/types/              knowledge.ts (source of truth) + knowledge.schema.ts (Zod)
supabase/migrations/    SQL migrations
prompts/                versioned enrichment prompts
docs/                   schema, data quality, enrichment, improvements log
data/examples/          complete JSON from real scrapes
```
