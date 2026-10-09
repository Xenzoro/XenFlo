# Data quality

A knowledge base is only useful if Flo can trust it. A wrong fact is worse than a missing one, because it ends up in a customer's social posts and emails. XenFlo's rules:

- **Never guess.** Unknown values stay empty and are marked Missing.
- **Always show where a value came from.** Every field records its source URL and a confidence level.
- **Make gaps obvious and easy to fill.**

---

## 1. Confidence levels

Every value is a `Field`: `{ value, source, confidence, updatedAt, evidence? }` (`src/types/knowledge.ts`). In Advanced view, each field shows its confidence as a badge, and the source link is one click away.

**AI, AI preview and Inferred values always show their badge**, not only in Advanced view:
- The badge's tooltip lists what the value is based on (`evidence`).
- A **"Wrong? Remove"** button sits next to the badge (see §1c).

| Confidence | Badge | Set when | Trust |
|---|---|---|---|
| `user_edited` | User edited | The owner typed or changed it | Highest. Nothing automatic overwrites it. |
| `scraped` | Scraped | Read directly from a page or its JSON-LD; `source` is the page URL | High, but heuristics can still misread a page (see §4) |
| `ai_live` | AI | A real model suggested it, it passed the confidence bar (§1b), and the owner accepted it | Medium. Every value carries the evidence it was based on. |
| `inferred` | Inferred | A rule derived it: a year from `© 2013`, a brand name from `Sumo Henderson_Logo.png`, an industry from a JSON-LD type, or the preview-mode keyword and CTA heuristics (2 evidence items required) | Medium-low |
| `ai_mock` | AI preview | Template output with no API call (preview mode), accepted by the owner | Built only from facts already present |
| `missing` | Missing | We looked and found nothing | Shown as a dashed "+ Add" pill |

**Which value wins** (`src/lib/scraper/merge.ts`): `user_edited > scraped > ai_live > inferred > ai_mock > missing`.
- A scraped value replaces an inferred one; an inferred value never replaces a scraped one.
- For equal confidence, the first value found wins. The homepage and JSON-LD are read first, so the site's own structured data beats text deeper in the site.
- List items are de-duplicated with a per-list key: lowercased name, normalized URL, or the hex value for colors.

## 1a. Three tiers: what AI may fill

Every field is in exactly one tier, in `src/lib/ai/field-tiers.ts`. A test fails if a field is added without a tier. The rules are enforced in code (`filterByTier`), not only in the prompt.

| Tier | Fields | AI may… |
|---|---|---|
| **1 Read** (stated facts) | name, overview, website, year founded, founding story, main address, other locations, alternate names, emails, phones, CTAs, partners and tools, logos, colors, fonts, social links, offerings (name, price, features), testimonial quotes, FAQs, differentiators, trust signals, promotions, press, legal links | **Never overwrite.** It can fill an empty one only if the value appears word for word in the evidence (a screenshot or logo text). |
| **2 Inferred** (obvious to a person reading the site) | industry, industry groupings, industry outlook, business model, company role, service locations, target buyers, customer needs, ideal persona, channels, funnels, content themes, positioning, community and values, seasonal messaging, writing style, art style, pitch, offering categories, the Content Kit | Suggest, only at high confidence with evidence (§1b). |
| **3 Never guessed** | team members (all of `people`), people's names, titles and gender, testimonial authors and their companies, employee count, revenue, legal entity, legal name | **Never.** Any suggestion for these paths is dropped. They stay empty unless the site states them. In "Next to do" they say "Add it yourself", never "Fill with AI". |

## 1b. The confidence bar

For every tier 2 field, the model returns a value, a confidence (`high` / `medium` / `low`), its evidence, and a reason when it isn't high. The code then decides (`src/lib/ai/confidence.ts`):

- **Real evidence only.** A citation counts only if it's an item id that exists in the input, or a quote that actually appears in it. Made-up citations are ignored.
- **Facts** (industry, business model, channels, funnels, buyers, needs, themes, positioning, values, seasonal messaging, offering categories) need `high` **and** at least **2 real evidence items**, or 1 direct quote that contains the value.
  - Example: "Sakana" + "Neko Loco Sushi" + an overview mentioning sushi → Sushi.
- **Generated fields** (pitch, writing style, voice guide, ideal persona, Content Kit) are written, not looked up. They need at least **1 real evidence item** and confidence `high` or `medium`, so a good pitch isn't lost just because it's new writing.
- **Everything else** (medium or low facts, highs with one weak citation, answers like "N/A") is not suggested. The review modal lists it under **"Not enough evidence"** with the reason, so the owner knows why the field is still empty.
- **No guessing:** unsure means null, and numbers and dates are never invented.

**Measured on the four test sites** (live, gpt-5.4-mini):
- 20–22 field suggestions per site (Apex also gets per-offering category suggestions), with no tier 1 overwrites and no tier 3 suggestions.
- Typically held back:
  - industry outlook: none of the sites discusses its market
  - seasonal messaging
  - Goettl's channels: walk-in was implied but not stated

## 1c. "Wrong? Remove", dismissals and Not applicable

- **Wrong? Remove:**
  - One click clears an AI or inferred value back to Missing (or removes the list item), with no confirm.
  - The value is remembered in `kb.dismissed` (path + normalized value), so the next enrichment run won't suggest it again.
  - The same record is meant for re-scrape dismissals later.
- **Editing** an AI value makes it `user_edited`: the badge disappears and AI never replaces it.
- **Not applicable:** any "Next to do" field can be marked N/A (`kb.notApplicable`). It counts as complete in the health score and stops showing in Next to do. Undo it from Sources → Completeness.
- **Main address with no head office:** when the main address is empty but other locations were found (a restaurant group), the card offers "Use one of your locations" or "Not applicable (no head office)".

## 1d. Menus and offerings (Phase 10)

Offerings are the most valuable data for restaurants and shops, and the easiest place to slip in a wrong price. The rules:

| Where the item came from | Confidence | Evidence shown |
|---|---|---|
| HTML menu page (lists, tables) | Scraped | the page |
| Menu PDF with a text layer, read by the heuristics | Scraped | the PDF |
| PDF text too jumbled for the heuristics, sorted by AI | **Scraped** only if every name, price, description and section appears word for word in that text; otherwise **AI** | the PDF |
| Picture menu (image-only PDF or menu image), read by AI | AI | the PDF or image URL and the page it was found on |
| Added or edited by the owner | User edited | none |

- **Prices are never invented.**
  - **Heuristics:** a price is copied only from the item's own lines. "STEP 2", "Table 4" and "Suite 104" are not prices, and "Market price" / "MP" keep their text with no amount.
  - **AI:** the model is told to copy prices exactly as printed or return null. In code, a "price" with no number is dropped, and for AI-sorted text any price whose numbers aren't in the text is dropped.
- **Category stays tier 2.** A section heading read by AI ("Hand Rolls") carries its own AI badge, like any AI-suggested category.
- **Brand and location** come from the page the menu was found on: its title gives the brand, and the address on the same page gives the location. A PDF found only on a hub page ("All you can eat sushi") has no brand unless its file name names one (Wix's `dn=Captain+6+-+Menu+-+2026.pdf`).
- **Brand per menu:** a menu found only on a hub page gets its brand from its file name or link text, but only when that equals one brand's **full** name (spaces aside: "hwaro2-menu.pdf" = "Hwaro 2"). Next comes overlap, when 60%+ of its items are already on one brand's menu. Otherwise it is named after itself ("All You Can Eat Hotpot Menu (PDF)"). Partial names never match: Neko ≠ Neko Supremo ≠ Neko Loco ≠ Neko Hana.
- **Text copies and duplicates:** a text copy of a menu already read from its picture is marked `duplicate`. Its extra items are kept, and the kept items cite the copy. Within a brand, an item listed on two menus is kept once (priced and described first), with both menus as evidence.
- **Review:** AI-read items stay unreviewed until the owner presses **Mark as reviewed** for that brand, or edits the item. Reviewed items become `user_edited` with `reviewedAt` (badge "Reviewed"). Until then, their prices are flagged "needs review" on the Overview and **left out of every AI prompt** (`quotablePrice` in `src/lib/ai/evidence.ts`), so Flo never quotes a misread price.
- **Raised cents:** "$58⁹⁵", "$58 95" or "$58^95" (a dollar sign and exactly two raised digits) is read as $58.95. Anything else is kept as printed. "$5895" is not changed, because it can't be told apart from $5,895.
- **Wrong? Remove** on a menu item removes it and remembers it as brand + name (`kb.dismissed`, path `offerings`), so "Read menus with AI" never adds it back. The same item under another brand is a different item.
- **What isn't read:**
  - PDFs over 20 MB (listed with a link and a screenshot hint)
  - pages past the first 4 of a PDF
  - files robots.txt disallows
  - ordering platforms (Toast, Clover, DoorDash…). Those are recorded only as channels and never fetched.

## 2. Handling incomplete data

**The Knowledge Health score** (`src/lib/scraper/score.ts`):
- It's a weighted checklist of 23 important fields that adds up to 100 (company name 8, overview 7, offerings 7, logos 5, founded year 5…).
- A field counts as filled when it has a value, or at least one item for a list. "People" only counts team members, not testimonial authors.
- The list of missing fields drives three things:

| Mechanism | What it does |
|---|---|
| **Adaptive crawl** | While crawling, each missing field maps to the pages likely to hold it (`FIELD_HINTS`: missing FAQs → `/faq`, `/help`; missing team → `/team`, `/about`, `/meet`…). Pages are ranked by the points they could add. |
| **Next to do cards** | The Overview shows the most valuable missing fields with their points ("Add your founding year +5"). Clicking one jumps to the field and highlights it. |
| **Low score banner** | Below 70, a banner offers **Dig deeper** (crawl more of the pages found, up to 30 total) or **Add info yourself** (paste text, upload an HTML file or screenshots). |

Fields that need judgment rather than reading (tier 2) are never filled during the scrape. They stay Missing until the owner writes them or accepts suggestions from Enrich with AI (live AI, or the keyword and CTA heuristics in preview mode).

## 3. Fallbacks

| Situation | What happens |
|---|---|
| robots.txt blocks XenFloBot, or asks AI crawlers to stay out | The scrape stops with a friendly panel. The owner can confirm ownership (consent recorded as `checkbox_scrape`) and continue politely, or paste or upload content instead. |
| Site unreachable, timeout (10s per page), non-200 | Clear error card for the homepage. A failed inner page is logged in the crawl log and skipped. |
| Homepage under 30 words (likely a JavaScript-only site) | Warning in the crawl log; the upload fallback is the way forward. |
| Thin or image-only content | Low score banner, then Dig deeper or Add info yourself. |
| Pasted text or uploaded HTML | Runs through the same extractors as a scrape and only fills empty fields, so nothing the owner already has is overwritten. |
| Menus in PDFs and images | PDFs are downloaded after the crawl (20 MB, 4 pages, 12 PDFs, 15 s) and their text is read with unpdf. Picture-only menus wait in "Menus not read yet" for **Read menus with AI** (8 pages per run, cached per menu). Without live AI, the owner sees the list with links and can add items by hand. |
| Screenshots | Stored privately (Supabase Storage). Enrich with AI sends screenshots waiting for AI (`needsAiFields`) to the vision call at high detail, and readable overview, story, phone and email facts come back as suggestions. Without live AI, the app asks the owner to paste the text instead. |
| No `OPENAI_API_KEY` or passcode, daily cap reached, or both AI calls fail | Enrich with AI falls back to preview suggestions labeled "AI preview". If only one call fails, the other's results are kept with a note. |
| Supabase not configured | Scraping still works. Save returns a clear "not configured" error, and the JSON can still be downloaded. |

## 4. How heuristics fail on real sites

Testing on real small-business sites showed the scraper usually reads the page **correctly**, but the page itself can be wrong, stale or made for someone else. These are the failure modes we've seen, and who fixes each one.

### Placeholder staff (template content on a real site)
**Seen on:** Anime Boba Cafe. The About page lists three staff profiles that appear to be template filler. The scraper extracted them perfectly, and they would have ended up in Flo's posts as real staff.

The same site still had WordPress demo pages (`/sample-page`, `/hello-world`, `/category/uncategorized`), a strong sign the template was never fully cleaned up.

**Fix today:** the owner reviews the People tab and removes them (one click per card). People are a scored field, so the owner sees them.

**Placeholder detection ideas:**
1. **Demo page signals.** If `/sample-page`, `/hello-world` or "Uncategorized" exists, flag the whole knowledge base: "This site may still contain template content. Please review people and text."
2. **Known filler.** Check against a small list of template text: lorem ipsum, "Your Name Here", "John Doe", "Jane Smith", "Company Name", "123 Main Street", `(555)` phone numbers, `example.com` emails.
3. **Stock image names.** Team photos named `team-1.jpg`, `avatar-placeholder.png` or `person-3.jpg`, or loaded from theme demo folders (`/wp-content/themes/<theme>/demo/`).
4. **Cross-site repetition.** The same person name and bio found on several unrelated sites is template content. This needs a shared index, which MoFlo would naturally have across customers.
5. **AI check (live mode).** Ask the model "does this look like real staff or template filler?". The answer is shown as a warning badge, never used to delete anything automatically.

### Platform default colors
**Seen on:** Goettl (WordPress + Kadence) and Anime Boba Cafe. The old color logic counted how often each color appeared in the CSS, so WordPress's admin blues (`#007cba`, `#005a87`) and Kadence's highlight orange (`#f76a0c`) beat the brand. Goettl's real red didn't appear at all.

**Fix (done):** colors are ranked by **where they're used**:
- Buttons and CTAs ×6, header and nav ×4, links ×2, everything else ×1.
- Rules that only style plugin markup (`.wp-block-*`, `.kadence-*`, `.elementor-*`, `.swiper-*`) and WordPress plugin stylesheets are ignored.
- Known defaults (WordPress, Kadence, Swiper `#007aff`, Wix `#116dff`) are filtered out.

Goettl now returns navy `#003963` and red `#cd163f` first. The Brand tab shows the top 3 as **Primary** and the rest as **Secondary**, so minor icon colors don't look as important as the brand.

**Still possible:** a site whose real brand color matches a platform default, or a theme whose buttons use a different color than the logo. The owner can edit or reorder colors, and a vision pass on the logo could confirm the palette (`prompts/logo-vision.v1.md` returns color hints that are checked against the CSS colors).

### Hidden template content
Page builders often ship sections that are switched off with CSS (`display:none`, `hidden`, `aria-hidden`), or tucked into tabs and modals: an old promo, a demo testimonial slider, a "Meet the team" block never filled in. Cheerio reads HTML, not the rendered page, so hidden text can be extracted.

**Ideas:** skip elements with the `hidden` attribute, `aria-hidden="true"`, inline `display:none`, and common hidden classes (`.hidden`, `.d-none`, `.sr-only`, `.elementor-hidden-*`). Treat text inside closed modals as lower confidence.

### Other misreads seen in testing
| Misread | Example | Why | Fix |
|---|---|---|---|
| Section headings as offerings | Goettl: "Signs You Need Duct Services", "Schedule A Service Today" | Service pages use repeated heading + list blocks that look like offering cards | Owner removes them; ideas: require a price or CTA nearby, and drop question or "Schedule…" headings |
| Phones from other locations, button text as a phone | Goettl Las Vegas: Arizona, Texas and California area codes, and "CALL Now" | Pages link to sister branches, and one `tel:` link's text is a button label | **Fixed:** only valid US numbers are kept (formatted from the `tel:` digits when the link text isn't a number). On a `/location/<city>` page, numbers next to another branch's "City, ST 12345" are skipped, and the city's own listing is placed right after the page's numbers. |
| Photo alt text as a brand name | Goettl: "Person holding a wrench in front of the goettl logo" | The alt text contained "logo", so the photo counted as a logo | **Fixed:** alt text only marks a logo when it names one; captions (more than 6 words, "person holding…", "in front of…") are never names, and alternate names are capped at 5 words |
| Mixed founding facts | Goettl: founded 1939, but "Keeping Las Vegas cool since 2012" in the story | A national company's location page | Both are true in context. The source link shows which page said what, and AI cleanup or the owner can clarify. |
| One category for everything | Apex: every game listed under "Minecraft Server Hosting" | Category taken from the nearest page title | Take the category from the offering's own heading or page |
| Info only in images | Dragon Factory: menus, prices and restaurant names | Nothing to read in HTML; 20 of the 21 menu PDFs tested are pictures with no text layer | File name and alt clues recover brand names. **Phase 10:** menu PDFs are found and linked to their brand and address, and "Read menus with AI" reads the picture menus 8 pages at a time |
| Unpriced all-you-can-eat lists | Dragon Factory hot pot menu: dishes listed under "Appetizer", "Salad", "Hand Rolls" with no prices, mixed with house rules ("Time limit is 90 minutes") | Without prices, a dish line looks like any short line | Marked "needs sorting" instead of guessing; AI sorts it with the word-for-word check |
| Duplicate logos | Goettl: the same logo in the header and JSON-LD, and the same icon as apple-touch-icon and favicon | Each source is recorded separately | The Brand tab groups identical images and lists every place each was found |

## 5. How AI or the owner fixes problems

- **The owner is the final authority.** Every field is editable inline. Edits become `user_edited`, and AI never overwrites them. Advanced view shows each value's source page, so a wrong value can be traced and corrected.
- **AI cleans up; it doesn't invent.** The prompts in `prompts/` only summarize what the site's pages say. Every answer cites its evidence, passes the confidence bar (§1b) and the tier rules (§1a), or stays empty with a reason. Planned AI checks:
  - rewrite a mashed-together hero overview into one clean sentence
  - flag likely placeholder staff
  - confirm a logo is real before describing its art style; a blank gray image must return "missing", not "no discernible style"
  - read menu and logo images (vision)
- **Planned verification pass:** after extraction, confirm every scraped value actually appears on its source page. Anything that doesn't is dropped or marked unverified.
