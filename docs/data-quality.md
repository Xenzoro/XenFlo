# Data quality

A knowledge base is only useful if Flo can trust it. A wrong fact is worse than a missing one, because it ends up in a customer's social posts and emails. XenFlo's rules:

- **Never guess.** Unknown values stay empty and are marked Missing.
- **Always show where a value came from.** Every field records its source URL and a confidence level.
- **Make gaps obvious and easy to fill.**

---

## 1. Confidence levels

Every value is a `Field`: `{ value, source, confidence, updatedAt }` (`src/types/knowledge.ts`). In Advanced view, each field shows its confidence as a badge, and the source link is one click away.

| Confidence | Badge | Set when | Trust |
|---|---|---|---|
| `user_edited` | User edited | The owner typed or changed it | Highest. Nothing automatic overwrites it. |
| `scraped` | Scraped | Read directly from a page or its JSON-LD; `source` is the page URL | High, but heuristics can still misread a page (see §4) |
| `ai_live` | AI | A real model produced it from scraped facts (reserved; not wired in yet) | Medium. Must cite its inputs. |
| `inferred` | Inferred | A rule derived it: a year from `© 2013`, a brand name from `Sumo Henderson_Logo.png`, an industry from a JSON-LD type | Medium-low |
| `ai_mock` | AI preview | Template output with no API call | Example only, never a fact |
| `missing` | Missing | We looked and found nothing | Shown as a dashed "+ Add" pill |

**Which value wins** (`src/lib/scraper/merge.ts`): `user_edited > scraped > ai_live > inferred > ai_mock > missing`.
- A scraped value replaces an inferred one; an inferred value never replaces a scraped one.
- For equal confidence, the first value found wins. The homepage and JSON-LD are read first, so the site's own structured data beats text deeper in the site.
- List items are de-duplicated with a per-list key: lowercased name, normalized URL, or the hex value for colors.

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

Fields that need judgment rather than reading (pitch, writing style, ideal persona, art style) are never filled by rules. They stay Missing until the owner writes them or AI enrichment runs (see `prompts/`).

## 3. Fallbacks

| Situation | What happens |
|---|---|
| robots.txt blocks XenFloBot, or asks AI crawlers to stay out | The scrape stops with a friendly panel. The owner can confirm ownership (consent recorded as `checkbox_scrape`) and continue politely, or paste or upload content instead. |
| Site unreachable, timeout (10s per page), non-200 | Clear error card for the homepage. A failed inner page is logged in the crawl log and skipped. |
| Homepage under 30 words (likely a JavaScript-only site) | Warning in the crawl log; the upload fallback is the way forward. |
| Thin or image-only content | Low score banner, then Dig deeper or Add info yourself. |
| Pasted text or uploaded HTML | Runs through the same extractors as a scrape and only fills empty fields, so nothing the owner already has is overwritten. |
| Screenshots | Stored privately (Supabase Storage). Without live AI they can't be read, so the app asks the owner to paste the text instead. Each screenshot records the fields it should fill once vision AI is on (`needsAiFields`). |
| No `OPENAI_API_KEY`, or an AI error | AI fields stay Missing. Previews are clearly labeled "AI preview". |
| Supabase not configured | Scraping still works. Save returns a clear "not configured" error, and the JSON can still be downloaded. |

## 4. How heuristics fail on real sites

Testing on real small-business sites showed the scraper usually reads the page **correctly**, but the page itself can be wrong, stale or made for someone else. These are the failure modes we've seen, and who fixes each one.

### Placeholder staff (template content on a real site)
**Seen on:** Anime Boba Cafe. The About page lists Akira Yamamoto, Sakura Tanaka and Kenji Nakamura, three "team members" who appear to be filler from the site template. The scraper extracted them perfectly, and they would have ended up in Flo's posts as real staff.

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
| Phones from other locations, button text as a phone | Goettl Las Vegas: Arizona, Texas and California area codes, and "CALL Now" | Pages link to sister branches, and one `tel:` link holds button text instead of a number | Only accept `tel:` values that look like phone numbers; prefer numbers in the same area code as the address or page city |
| Photo alt text as a brand name | Goettl: "Person holding a wrench in front of the goettl" | Logo-name clues accept any image with "goettl" in it | Only take names from images whose alt or filename looks like a logo, and limit the length |
| Mixed founding facts | Goettl: founded 1939, but "Keeping Las Vegas cool since 2012" in the story | A national company's location page | Both are true in context. The source link shows which page said what, and AI cleanup or the owner can clarify. |
| One category for everything | Apex: every game listed under "Minecraft Server Hosting" | Category taken from the nearest page title | Take the category from the offering's own heading or page |
| Info only in images | Dragon Factory: menus, prices and restaurant names | Nothing to read in HTML | File name and alt clues recover brand names; vision AI or screenshots for the rest |
| Duplicate logos | Goettl: the same logo in the header and JSON-LD, and the same icon as apple-touch-icon and favicon | Each source is recorded separately | The Brand tab groups identical images and lists every place each was found |

## 5. How AI or the owner fixes problems

- **The owner is the final authority.** Every field is editable inline. Edits become `user_edited`, and AI never overwrites them. Advanced view shows each value's source page, so a wrong value can be traced and corrected.
- **AI cleans up; it doesn't invent.** The prompts in `prompts/` only rewrite or summarize facts already in the knowledge base. They must cite the inputs they used (`basedOn`) and return `null` plus a `missing` reason rather than guess. Planned AI checks:
  - rewrite a mashed-together hero overview into one clean sentence
  - flag likely placeholder staff
  - confirm a logo is real before describing its art style; a blank gray image must return "missing", not "no discernible style"
  - read menu and logo images (vision)
- **Planned verification pass:** after extraction, confirm every scraped value actually appears on its source page. Anything that doesn't is dropped or marked unverified.
