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
    - Inferred fields offer "Fill with AI"; never-guessed ones (team, legal entity) only "Add it yourself".
    - Any field can be marked **Not applicable**; it counts as complete.
    - With no head office, the main address card offers "Use one of your locations".
  - **Company, Customers, Brand, People, Offerings:** every field editable inline. Empty fields show dashed "+ Add" pills.
  - **Offerings and menus:** for restaurants, cafes and shops (or any site where menus were found) the Offerings tab comes right after Overview, in a **menu view**. Items are grouped by brand or location (with its address, item count and price range), then by section. Each item shows its name, description, price and source ("from Sakana Sushi menu PDF", "read from menu image"). The view has search and collapsible groups. Service businesses keep the card view. See [menus](#menus-and-price-lists).
  - **Read menus with AI:** one button on the Offerings tab reads picture menus (image PDFs and menu images), up to 8 pages per run. Already-read menus are cached and free.
  - **Enrich with AI:** suggestions for everything a person could tell from your site: industry, business model, customers, channels, funnels, themes, pitch, writing style, Content Kit, art style and offering categories.
  - Each suggestion comes with its evidence, and you accept or reject each one.
  - AI and inferred values carry a badge and a one-click "Wrong? Remove".
  - See [AI](#ai-enrichment-and-prompts).
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
2. **Discover** links from the nav, header, footer and body, plus `sitemap.xml` (from robots.txt or common locations). Each link is categorized (menu, about, team, services, products, pricing, features, faq, testimonials, contact, locations, press, careers, blog, legal) and scored. Menu pages (`/menu`, `/food`, `/drinks`, price lists, specials, catering) rank just below About, so they make the first 15 pages. Nav links rank higher; deep paths and blog posts rank lower.
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
| `offerings` | product, service and plan cards with prices (fixed, starting at, range, subscription, quote, free); on menu pages, list and table menus line by line |
| `menu-sources` | menu PDF links and large menu images (for the menu pass and the AI menu reader); ordering, delivery and booking platforms (Toast, Square, Clover, DoorDash, Uber Eats, OpenTable…) as channels |
| `people` | team cards (name, title, bio, photo), kept apart from testimonial authors |
| `testimonials` | quote blocks, authors and ratings |
| `ctas` | button and CTA text with links |
| `signals` | FAQs, differentiators, trust signals (reviews, guarantees, certifications), promotions |
| `press` | press and "as seen in" links |
| `tech` | analytics, CRM, email, chat, payments and platform, detected from script and link sources |
| `branding` | logos, fonts and brand colors (below) |

Pasted text and uploaded HTML go through the same extractors (`/api/extract`).

### Menus and price lists
For restaurants and shops, the offerings usually live in PDFs and images, not HTML. Phase 10 handles them in three steps:
1. **Found during the crawl** (`extract/menu-sources.ts`):
   - **PDFs:** menu PDF links are recorded with the page that links them and the brand that page is about. The `SAKANA SUSHI` page title becomes "Sakana Sushi". When a hub page and a restaurant page link the same PDF, the restaurant page wins, because that's where its address is.
   - **Images:** large images on menu pages, or images named like a menu, are recorded too. Stock photos, logos and site chrome are skipped.
   - **Ordering platforms:** links to Toast, Square, Clover, menu11, DoorDash, Uber Eats, Grubhub, OpenTable, Resy and similar become **channels** ("Online ordering (Clover)", scraped, with the link as the source). Those platforms are never fetched.
2. **Read after the crawl, without AI** (`menus/`):
   - **Download:** menu PDFs are fetched with the same redirect and private-network checks as pages (`fetchBinary`).
   - **Caps:** **20 MB** per PDF, the **first 4 pages**, **12 PDFs** per scrape, 2 at a time, in a **15 s** budget. The rest are read by Dig deeper.
   - **Text:** [unpdf](https://github.com/unjs/unpdf), a serverless build of Mozilla's pdf.js (pure JavaScript, no native binaries, so it runs in Vercel functions), pulls out the text, and `parse.ts` turns clear priced lists into items.
   - **What's left:** picture-only PDFs are marked for AI. PDFs with jumbled text are kept, trimmed, for AI to sort.
   - **Locations:** each item is linked to the address found on the same page (`/sakana` → 3949 S Maryland Pkwy).
3. **Read with AI on request** ("Read menus with AI", `/api/menus`, [menu-reader.v2](prompts/menu-reader.v2.md)):
   - **Per run:** up to **8 pages or images** at high detail (a 2-page PDF counts as 2), plus up to 4 jumbled-text menus. Restaurant pages come before hub pages, then smaller files first.
   - **Speed:** menus are read in parallel, and nothing new starts after 40 s.
   - **Cost:** about $0.01 per page on gpt-5.4-mini, so at most about $0.09 per run.
   - **Cache:** each menu is cached on its own, so a second run is free for menus already read and moves on to the rest.

**One brand per menu, one copy per item** (`menus/organize.ts`, `menus/brands.ts`), run after the scrape and whenever menus are read:
- **Brand names** come from each restaurant's page title, cleaned ("HWARO 2 AYCE KBBQ IN LAS VEGAS" → "Hwaro 2"). A title that is a known brand plus format words is snapped to the brand: "Neko Hana Omakase" → "Neko Hana", the logo shown on that page.
- **A menu with no brand** (linked only from a hub page) gets one in this order:
  1. its file name (`Content-Disposition` or Wix `dn=`) or link text equals one brand's **full** name ("nabemenu (2).pdf" → Nabe)
  2. most of its items (60%+) are already on one brand's menu
  3. otherwise it's named after itself ("All You Can Eat Hotpot Menu (PDF)"). Never an unnamed bucket.
- **Full names only:** brands are never matched by part of a name. Neko, Neko Supremo, Neko Loco and Neko Hana are four restaurants.
- **Text copies:** a text copy of a menu that AI already read from its picture is skipped. Items found only in the copy are kept, and the kept items cite both files.
- **Duplicates:** within a brand, an item listed twice is kept once (the priced and described version), citing both menus.
- **Every brand appears** in the menu view, even without a menu: "Menu not read yet" (with the link) or "No menu found online". The brand list comes from brand pages, menu groups, and brand names read from the homepage logo grid by the vision call (Enrich with AI).

**Review before use.** Menu items read by AI start as unreviewed:
- **Banner:** the menu view shows "Menus read by AI. Please review." with "X of Y menus reviewed". It can't be dismissed until every menu is reviewed.
- **Mark as reviewed:** each brand has this button. It turns that brand's AI items into the owner's (badge **Reviewed**, with a timestamp). Editing an item also counts.
- **Prices stay out of AI writing until reviewed:** unreviewed AI prices are flagged "needs review" on the Overview and are left out of every AI prompt.
- **Read again with AI:** re-reads one brand's menu with the current prompt and replaces its earlier reading (the owner's edits stay).

**Prices are never invented.**
- **Heuristics:** a price comes only from the item's own lines. "STEP 2" or "Table 4" is not a price, and "Market price" keeps no amount.
- **AI:** the model must copy prices as printed, or return null. A "price" with no number in it is dropped in code.
- **Confidence:**
  - Items from HTML or PDF text are **Scraped**.
  - Items read from pictures are **AI**, with the file as evidence.
  - AI-sorted text stays **Scraped** only if every name and price appears word for word in that text. Otherwise the item is **AI**, and a price that isn't in the text is removed.
- **Wrong? Remove:** removing an item remembers it by brand + name, so it isn't added again.

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

**Enrich with AI** (a button next to Save, on `/knowledge` and in the Detailed view, and "Fill with AI" on Next to do cards) fills every field a person could confidently fill by reading the site, and nothing more. It never runs automatically.

| Suggests | From |
|---|---|
| Industry, groupings, outlook, business model, company role, service locations, buyers, needs, ideal customer, channels, funnels, themes, positioning, community and values, seasonal messaging, pitch, writing style, voice guide, Content Kit, offering categories | [understand-business.v1](prompts/understand-business.v1.md) |
| Art style, brand names read from logos, facts from uploaded screenshots | [logo-vision.v1](prompts/logo-vision.v1.md) |

The earlier pitch, writing-style, ideal-persona and content-kit prompts were merged into understand-business; they stay in `prompts/` as reference.

**Read menus with AI** is a separate button and route (`/api/menus`, [menu-reader.v2](prompts/menu-reader.v2.md)), so Enrich with AI stays text + vision only and fast. It uses the same passcode, cache and daily quota (one unit per run) and the same confidence rules. Read items are added directly with their AI badge and evidence instead of going through the review list. See [menus](#menus-and-price-lists).

**Three tiers** (`src/lib/ai/field-tiers.ts`, enforced in code):
- **Read facts** (contacts, addresses, CTAs, logos, colors…) are never overwritten.
- **Inferred fields** are suggested with evidence.
- **Never guessed:** people, testimonial authors, employee count, revenue, legal entity and legal name are dropped from every suggestion.

**Confidence bar:**
- **Facts** need high confidence and 2 real evidence items (or a quote containing the value).
- **Generated writing** (pitch, style, Content Kit) needs at least 1.
- **Everything else** is listed in the review as "Not enough evidence", with the reason.

Details: [docs/data-quality.md](docs/data-quality.md).

**Measured on the four test sites:**
- **Before:** after scraping plus the old enrichment, 11 of 19 tier 2 fields were still empty on every site.
- **After:** each site gets 20–22 suggestions, with nothing in tier 3 and no read facts overwritten. What stays empty is mostly industry outlook and seasonal messaging, which none of these sites talks about.

**How it works** (`src/lib/ai/enrich.ts`, the single entry point):
1. **The input is page evidence, not just fields:** every crawled page's title, meta description and headings (captured during the crawl), plus locations, offerings, CTA text with link targets, testimonial text without names, and alt text (`src/lib/ai/evidence.ts`). The prompt is loaded from `prompts/` at runtime. There's **one text call** and **one vision call**, run in parallel through OpenAI's Responses API, using plain `fetch` and no SDK.
2. The model must answer in a strict JSON schema built from Zod (`src/lib/ai/schemas.ts`). The reply is validated with the same Zod schema before it's used.
3. **Nothing is applied automatically.**
   - The owner sees every suggestion, with its evidence, next to the current value, and ticks the ones to keep. Per-offering category fixes are a separate opt-in group.
   - Accepted values keep `ai_live` and their evidence, and show an **AI** badge with a "Wrong? Remove" button everywhere.
   - Removing a value clears it and remembers it, so it isn't suggested again; editing it makes it the owner's.
4. **Never invent facts.** Unknown stays null. AI never overwrites what the owner edited, and fields marked Not applicable are skipped.

**Live vs preview mode**
- **Live:** needs `OPENAI_API_KEY` **and** the right `AI_PASSCODE`, plus quota left today.
- **Preview:**
  - a free heuristic pass ("Inferred": industry from a keyword map, channels and funnels from CTA patterns, business model hints; same 2-evidence rule)
  - plus template suggestions built only from facts already in the knowledge base ("AI preview")
  - writing style, persona and art style aren't suggested

  Preview is used:
  - with no key, or no passcode set on the server
  - when the user picks "Use preview mode"
  - when the daily cap is reached
  - when both AI calls fail
- **Fallbacks:** a wrong passcode is an error the user can fix rather than a silent switch. If only one call fails (timeout, bad reply), the other call's results are kept and a note explains what was skipped.

**Limits** (`src/lib/ai/config.ts`)
- **Calls:** one text call plus one image call per run; never automatic.
- **Input:** capped at about 16,000 tokens, prompt included. Evidence goes in priority order: the business in its own words, every page's title/meta/headings, brands and locations, CTAs, testimonial text, FAQs, then the rest. Real runs used 4k–12k.
- **Output:** capped at 3,500 tokens per call (real runs: 1.2k–2.6k). `reasoning.effort` is `none`, so the whole budget goes to the answer.
- **Cost per run** (third-party list prices): about $0.02–0.03 on gpt-5.4-mini, or about $0.08 with gpt-5.4 for the text call.
- **Images:** at most 2. The best raster logo and the hero image are sent at `detail: "low"`. Screenshots waiting for AI (`needsAiFields`) go first, at `detail: "high"`, because menus and about pages are text-heavy. SVG logos are skipped (OpenAI can't read them).
- **Cache:** results are cached in Supabase (`ai_enrichments`) by a hash of the prompt text, models and exact input. The same knowledge base version never pays twice, and cache hits don't count toward the cap.
- **Daily cap:** `AI_DAILY_LIMIT` (default 20) live runs per day site-wide, enforced atomically in Postgres (`take_ai_quota`).
- **Passcode:** `AI_PASSCODE`, compared in constant time. With no passcode configured, live AI is off.

**Model comparison** (Apex Hosting, same input, text call only; vision stayed on mini; run with the earlier pre-Phase 9 prompts):

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

**Menus (Phase 10):**
- **Found:** every restaurant page links a `menu` PDF (Wix `/_files/ugd/*.pdf`, which redirects to `filesusr.com`), for 22 distinct PDFs across the restaurant and hub pages. The default 15-page crawl finds 15 of them. Umami's `umami.menu11.com` ordering link is recorded as a channel.
- **Without AI:** only 1 of the 21 PDFs tested has a text layer: the all-you-can-eat hot pot menu, an unpriced list that the heuristics mark for AI sorting. The rest are pictures saved as PDFs (Canva and Illustrator exports with outlined text). Kogi (34 MB), Hwaro 1 (43 MB), Captain 6 (70 MB) and one hub PDF (32 MB) are over the 20 MB cap and are listed with a link and an "upload a screenshot" hint.
- **Result:** with no AI the Offerings tab honestly shows 0 items plus a "Menus not read yet" list. "Read menus with AI" reads them 8 pages at a time.

**After reading 5 menus with AI** (live run, then the organize fixes, re-checked from the cache at no cost):
- **Before:** an ungrouped bucket of 56 items, with names taken from page titles: (none) 56, Sumo Sushi All You Can Eat 139, Nabe Ayce Hot Pot 97, Hwaro 2 Ayce Kbbq In Las Vegas 92, Neko Hana Omakase 32. 416 items in all.
- **After:** Sumo Sushi 139, Nabe 100, Hwaro 2 92, Neko Hana 32. 363 items, nothing ungrouped.
- **Why it changed:** the 56 items came from a text copy of Nabe's menu, linked only from the "All you can eat hot pot" hub page. Its file is named `nabemenu (2).pdf`, and 53 of its 56 items match Nabe's picture menu. The copy is skipped, and its 3 extra items (Premium Short Rib, Premium Ribeye, Addicting Cucumber Salad) were added to Nabe.
- **Every restaurant is listed:** the other 12 show "Menu not read yet" or "Menu too large to read", with links.

What it still misses: people, testimonials and FAQs. They aren't on the site.

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
- **Update (October 9, 2026):** the site's robots.txt no longer restricts bots. It only asks for a 10-second crawl delay, which XenFlo respects (capped at 3 s per request for the demo). The site is now a single page: no menu (HTML, PDF or image) and no prices. Its Clover online ordering link is recorded as the channel "Online ordering (Clover)". The notes below describe the earlier version of the site.
- Its robots.txt asked AI crawlers (GPTBot, ClaudeBot and others) to stay out, so XenFlo stops and shows the blocked panel with the ownership checkbox and upload options. That is the demo of the consent flow. Its content was only used with the owner's permission.
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
- **Information inside images** (menus, logos with names, flyers) needs vision AI. Picture menus are read 8 pages per run with "Read menus with AI". PDFs over 20 MB are not downloaded; the owner can upload a screenshot instead. Only the first 4 pages of a PDF are read.
- **Menus behind ordering platforms** (Toast, Clover, DoorDash…) are not read. XenFlo records the platform as a channel but never scrapes it.
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
src/app/                pages (/knowledge, /knowledge/view) and API routes (scrape, extract, knowledge, uploads, enrich, menus)
src/components/         ui/, knowledge/ (workspace, tabs, fallback), view/, tour/
src/lib/scraper/        fetch, robots, discover, crawl, styles, colors, score, extract/*, menus/ (PDF text, menu parser, grouping)
src/lib/db/             Supabase data layer (the only code that talks to the database)
src/lib/ai/             enrich() entry point, menu reader, prompt loading, schemas, OpenAI call, preview mode
src/types/              knowledge.ts (source of truth) + knowledge.schema.ts (Zod)
supabase/migrations/    SQL migrations
prompts/                versioned enrichment prompts
docs/                   schema, data quality, enrichment, improvements log
data/examples/          complete JSON from real scrapes
```
