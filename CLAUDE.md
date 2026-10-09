# XenFlo: Knowledge Builder for MoFlo Cloud

This is a take home "Builder Challenge" for a MoFlo internship (MoFlo is a Las Vegas AI marketing platform for small, non technical businesses). XenFlo is my version of MoFlo's "MoKnowledge" feature: paste a company website URL, scrape it, turn it into a structured knowledge base, let the user review and edit it, and save it. That knowledge base is what powers MoFlo's apps (MoSocial, MoMail, MoBlogs, MoReviews).

Deadline: Tuesday. Approach: optimizer, not perfectionist. Get a working version first, then improve. Never leave the app in a broken state; run the build after each major step.

## Required stack (do not change)
- Next.js 15 with App Router (NOT 16), TypeScript strict, Tailwind CSS
- State: React hooks and context only
- Parsing: Cheerio. Validation: Zod. Animations: Framer Motion
- Database: Supabase (Postgres) via @supabase/supabase-js
- Hosting: Vercel
- No login/auth for the demo. Design the schema for multiple companies and users with RLS, but the app runs without signing in.
- No required LLM calls. AI fields use clearly labeled mock outputs by default (see AI section).

## Environment
- Dev runs in WSL2 Ubuntu at ~/projects/xenflo
- Secrets live in .env.local (never committed). Keep .env.example updated with blank placeholders.
- Never hardcode keys. Never log secrets.

## Pages
### /knowledge (main page)
1. URL input with validation (accept with or without https, reject invalid)
2. Scrape button, then a progress state that shows real steps (fetching homepage, discovering pages, crawling X of Y, extracting, scoring)
3. Results shown in tabs (see Tabs) with every field editable inline
4. Save button that writes the knowledge base to Supabase and also produces the JSON
5. Clear errors for: invalid URL, timeout, site unreachable, blocked by robots.txt, no content found

### /knowledge/view (management page)
1. Lists saved knowledge bases from Supabase
2. View modes: card, table, detailed
3. Search and filters (industry, completeness, date)
4. Edit, delete (with confirm), duplicate, export JSON, re scrape

## Tabs (progressive disclosure)
Simple by default for non technical owners. An "Advanced view" toggle (top right) reveals power user tabs.

Default tabs:
1. Overview: mini dashboard. Knowledge Health gauge (0 to 100, styled like MoFlo's Brand Power), "Next to do" cards that show point gains (example: "Add your founding year +5"), and a Content Kit preview ("Here's what Flo can make with your knowledge": sample social post, email subject, blog idea).
2. Company: overview, website, industry, business model, company role, year founded, legal entity type, employee count, revenue, main address, other locations, service locations, alternate names, pitch, founding story
3. Customers: target buyers, customer needs, ideal persona, industry groupings, industry outlook, channels, funnels, CTAs, suppliers/partners
4. Brand: writing style, art style, fonts, brand colors (hex, shown as swatches), logos (shown as images), social links
5. People: name, title, role, short bio, and a type tag: team member vs customer/partner (do NOT mix testimonial authors into the team)
6. Offerings: cards with name, category, features, description, pricing type and amount when available

Advanced tabs:
1. Insights: testimonials, FAQs, differentiators/USPs, trust signals (certifications, awards, review counts), recurring content themes, promos and seasonal messaging, press mentions, community and values, legal/compliance links, competitor or positioning signals
2. Content Kit: content pillars, social hooks, hashtags, email subject angles, blog ideas (from FAQs and themes), voice guide (words to use, words to avoid, tone do's and don'ts)
3. Sources: pages crawled, crawl log, per field source URLs, completeness breakdown, "dig deeper" controls, upload consent records
4. Raw JSON: formatted view with copy and download

In advanced view, every field shows a confidence badge: Scraped, Inferred, AI (mock or live), Missing, User edited.

## Scraper (src/lib/scraper)
Runs server side in API routes only. Split into small modules (fetch, robots, discover, extract per category, score).

1. Respect robots.txt. If disallowed, stop and show the blocked state (see Upload fallback). Use an honest User Agent like "XenFloBot/1.0".
2. Fetch homepage with a timeout. Follow redirects. Handle non 200s.
3. Discover internal links and prioritize: about, team, services, products, pricing, faq, testimonials/reviews, contact, locations, press, careers. Also check sitemap.xml.
4. Adaptive crawl: crawl priority pages first, then check which fields are still empty and only crawl pages likely to fill them. First scrape ~15 pages. Dig deeper works in batches: up to 15 more pages per click, up to MAX_CRAWL_PAGES in total (env, default 200). After 30 pages only high value pages are followed (menu, restaurant/location, services, pricing, about, contact, legal if still needed). Overall time budget per click. Small concurrency, polite delays.
5. Extract from: title and meta tags, Open Graph and Twitter tags, JSON LD (ld+json: Organization, LocalBusiness, Product, FAQPage, Review, Person), headings and paragraphs, nav and footer, regex for emails, phones, addresses, copyright year and legal entity (LLC, Inc), social links (LinkedIn, Facebook, Instagram, X/Twitter, YouTube, TikTok, Twitch, Discord), pricing patterns, CTA button text, testimonial blocks, FAQ blocks.
6. Branding: logo (img with logo in class/alt/src, header images, apple touch icon, favicon), fonts (Google Fonts links, font-family in CSS; resolve CSS variables; filter icon fonts like ETmodules, FontAwesome), colors (CSS variables, theme-color meta, frequent hex values; ignore pure black/white unless dominant).
7. Image clues without AI: use alt text and cleaned file names (example: "Sumo Henderson_Logo.png" becomes "Sumo Henderson").
8. Tech/supplier detection from script and link sources (analytics, email tools, chat widgets, payment providers).
9. Every extracted value records its source URL and confidence.
10. After extraction, compute a completeness score and the list of missing fields.

## After the crawl
If important fields are still missing, offer the user:
1. "Dig deeper" (15 more pages per click, up to MAX_CRAWL_PAGES), or
2. "Add info yourself" (fill fields or upload content)

## Upload fallback (blocked or thin sites)
When a site blocks automated access or content is thin, show a friendly panel:
"This site limits automated access. You can still build your knowledge base by uploading screenshots or files, or pasting the content yourself."
Required checkbox before upload: "I own this business or have permission from the owner to use this website's content."
Upload button stays disabled until checked. Store consent in the record (confirmed: true, timestamp, method).
Friendly accuracy note: "Please make sure uploaded info is accurate. Your knowledge base is only as good as what goes into it."
Pasted text and HTML go through the same extractors. Screenshots need vision AI (live mode only); in mock mode, prompt the user to paste text instead.

## AI enrichment
All AI work goes through one function (src/lib/ai/enrich.ts).
1. Default: returns clearly labeled mock outputs (badge: "AI preview").
2. If OPENAI_API_KEY exists in env: call the API server side for text fields (pitch, writing style, ideal persona, customer needs, content kit) and a vision capable model for logos/hero images (art style, brand names from logos).
3. On any failure or no key: fall back to mock automatically.
4. Never invent facts. Unknown stays empty and marked Missing.
Prompts live in /prompts as versioned files and are imported by the enrich function.

## Data model
One TypeScript type (src/types/knowledge.ts) is the source of truth, with a matching Zod schema. Each field is a value plus metadata: { value, source, confidence, updatedAt }. Lists hold items with the same metadata. Top level includes id, url, companyName, createdAt, updatedAt, version, completeness, crawl info, consent.
Supabase: companies, knowledge_bases (versioned), knowledge_versions or JSONB snapshots, crawl_runs, pages_crawled, uploads/consents. Keep the data layer in src/lib/db so it is swappable. Migrations in supabase/migrations.

## Design (match MoFlo Cloud)
- Light mode only. Very light gray page background (around #f8f9fb), white cards with large rounded corners (rounded-2xl) and soft borders, subtle shadows
- Primary blue #2563EB for buttons, active states, highlights. Lighter blue for disabled buttons
- Selected or flagged cards get a blue outline
- Font: Poppins via next/font
- Small uppercase gray section labels (like "LAST 7 DAYS"), bold headings, lots of white space
- Pill shaped toggles and filters
- Thin icon sidebar on the left, top bar with app name
- Hero card at top of the Company tab with company name and quick stats; two column section cards with uppercase title and small gray subtitle
- Empty states: "+ year", "+ count", dashed "+ Add" pills; edit inline
- Gauge rings for scores
- Footer note: "Everything here powers Flo. The more complete your knowledge, the more your content sounds like you."
- Animations (Framer Motion): staggered dropdown items (each item slides down and fades in ~40ms after the previous), modals fade and float in, first visit spotlight tour that dims the page and moves a blue glowing highlight smoothly between elements (scrape bar, tabs, health gauge, save)
- Responsive down to phone width

## File organization
src/app (pages, API routes), src/components (ui, knowledge, view, tour), src/lib (scraper, ai, db, utils), src/types, src/context, prompts/, docs/, data/examples/, supabase/migrations/

## Documentation deliverables
1. README: what it does, setup and run, features, scraping approach, schema design, example prompts, assumptions and limitations, screenshots, and how AI tools were used to build it
2. prompts/: at least 3 enrichment prompts (company pitch, writing style analysis, ideal customer persona) plus a vision prompt for logos/art style. Each specifies role, input format, output JSON schema, rules against inventing facts, and how to mark missing data
3. docs/data-quality.md: handling incomplete data, fallbacks, confidence levels
4. docs/enrichment.md: outside sources (Google Business Profile, state business registries, LinkedIn, review sites, Brandfetch, AI web search) and strategies
5. docs/schema.md: Supabase tables, column types, relationships, RLS policies, multi company support, versioning
6. ANSWERS.txt: headings for the 5 required questions. Jake writes the answers himself; do not fill them in.
7. data/examples/: at least one complete JSON output from a real scrape

## Test sites
- apexminecrafthosting.com (main showcase, info rich)
- dragonfactories.com (stress test: multi brand restaurant group, info in images, Wix)
- a small local service business (typical MoFlo customer)
- animebobacafe.com (small local cafe; its robots.txt no longer blocks XenFloBot, so it is no longer the blocked site demo. Only use its content with the owner's permission.)
- Blocked state and consent flow: demo with any site whose robots.txt blocks XenFloBot or AI crawlers.

## Working rules
- Small, focused commits with clear messages
- Run `npm run build` and fix TypeScript errors after each major step
- Explain non obvious code with short comments; Jake needs to understand and explain every file
- Ask before adding new dependencies beyond those listed
