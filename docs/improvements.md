# Improvements Log

A running list of issues found while building and testing XenFlo on real websites, plus ideas for making the knowledge base more trustworthy. Each entry notes where it was found and its status.

Status key: **Fixed** · **Planned** · **Idea**

---

## Crawling

| Issue | Found on | Status |
|---|---|---|
| Legal and careers pages were crawled before more useful pages like /features and /faq | Apex Hosting (Phase 1) | Fixed in Phase 2 (priority ranking) |
| The same page could be crawled twice (`/pricing` vs `/pricing/`) | Apex Hosting (Phase 1) | Fixed in Phase 2 (`pageKey()` normalization) |
| Two parallel fetches could push the crawl past the 30 page limit | Phase 2 testing | Fixed in Phase 2 |
| Progress during a scrape shows step names, not live progress, because the API returns everything at the end | Phase 4 | Idea: stream crawl events to the UI so the progress card shows real pages as they finish |
| No sitemap at any common location | Apex Hosting | Handled: discovery falls back to links only |
| Site asked for a 10 second Crawl-delay in robots.txt, but the scraper caps waits at 3 seconds | Anime Boba Cafe (Phase 4) | Design choice: delays are capped at 3 seconds so a scrape finishes in seconds, not minutes. The scraper still crawls slowly and politely (2 at a time, small page cap) and never retries aggressively. |
| Every offering got the same category ("Minecraft Server Hosting"), even other games | Apex Hosting (Phase 4) | Idea: take the category from the offering's own page or heading, not the nearest page title |
| Poppins never loaded because the font variable sat on `<body>` instead of `<html>` | Phase 4 | Fixed in Phase 4 |
| Generic fonts slipped through as "Ui Sans Serif" because hyphens became spaces before filtering | Phase 4 | Fixed in Phase 4 |

## Data accuracy

| Issue | Found on | Status |
|---|---|---|
| **Placeholder staff scraped as real people.** The About page lists three staff profiles that appear to be template filler. The scraper read them correctly, but the content itself isn't real. | Anime Boba Cafe | Idea: placeholder detection (see below) |
| **Leftover WordPress demo pages** (`/sample-page`, `/hello-world`, `/category/uncategorized`) are a strong sign the site was never fully cleaned up after setup | Anime Boba Cafe | Idea: if found, flag the whole knowledge base "may contain template content, please review" |
| Hidden page sections (switched off with CSS) could be scraped even though visitors never see them | General | Idea: skip elements hidden with `display:none`, `hidden`, or `aria-hidden` |
| No check that a scraped value actually appears on its source page | General | Idea: verification pass after extraction; anything not found on its source page is dropped or marked unverified |
| Testimonial authors and real team members can get mixed up | Seen in a sample knowledge profile | Fixed in Phase 2: authors are tagged `customer_partner`, never `team` |

## Branding

| Issue | Found on | Status |
|---|---|---|
| **Platform default colors reported as brand colors:** `#007cba` and `#005a87` (WordPress default blues), `#1da1f2` (Twitter blue), and WordPress palette oranges | Anime Boba Cafe, Goettl | Fixed: colors are now ranked by where they're actually used (buttons ×6, header and nav ×4, links ×2), plugin only CSS rules are ignored, and known platform defaults (WordPress, Kadence `#f76a0c`, Swiper, Wix `#116dff`) are filtered. Goettl went from WordPress blues and orange to its real navy `#003963` and red `#cd163f` |
| A brand's real color (Goettl's red, used on icons and the Book Now button) was missing entirely | Goettl | Fixed with usage based ranking above |
| All colors shown as one flat list, so minor icon colors (like a green checkmark) look as important as the brand colors | Goettl | Fixed in Phase 7: Brand tab shows the top 3 as **Primary** and the rest as **Secondary** |
| White logos invisible on the light checkerboard preview | Apex, Dragon Factory, Goettl | Fixed: logo previews detect light logos and switch to a dark background, with a manual light/dark toggle |
| The same logo listed several times (header, JSON-LD, apple touch icon, social image) | Goettl | Fixed in Phase 7: identical logos are grouped and shown once, listing every place they were found (Goettl went from 7 logos to 5) |
| Photo alt text treated as an alternate company name ("Person holding a wrench...") | Goettl (Phase 7) | Idea: only accept alt text clues from logo images, and reject descriptive sentences |

## Offerings and contact

| Issue | Found on | Status |
|---|---|---|
| Section headings picked up as offerings ("Signs You Need Duct Services"); Goettl showed 42 offerings | Goettl (Phase 7) | Idea: require a price, a services page, or a short description pattern; skip headings phrased as questions or "signs you need..." |
| Phone numbers from other locations picked up, plus button text like "CALL Now" | Goettl (Phase 7) | Idea: keep only valid phone formats, and when a location page is scraped, prefer the number for that location |
| Library default color reported as brand color (Swiper's `#007aff`) | Apex Hosting (Phase 2) | Fixed in Phase 2: bundled library stylesheets are skipped |
| "Apple System" listed as a font; it's the device's built in system font | Anime Boba Cafe | Idea: add to the system font filter (alongside Arial, Segoe UI, system-ui) |
| Unresolved CSS variables and icon fonts listed as fonts (`var(--font-family)`, `ETmodules`) | MoFlo's sample profiles | Fixed in Phase 2: variables resolved, icon fonts filtered |
| Art style described from a blank gray image ("no discernible art style") | a sample knowledge profile | Idea: check an image is a real logo before sending it to vision AI |

## Links and contact

| Issue | Found on | Status |
|---|---|---|
| Four "Privacy Policy" links that point back to the page they're on (the real link is probably `#`) | Anime Boba Cafe | Idea: skip links that resolve to the current page |
| Address missing even though "Henderson" appears in the text | Anime Boba Cafe | Idea: smarter address detection (city and state patterns, Google Maps embeds, footer blocks) |

## Content quality

| Issue | Found on | Status |
|---|---|---|
| Overview mashes hero headings together ("Dive into the world of anime Sip, Play, and Enjoy...") | Anime Boba Cafe | Idea: AI cleanup pass that rewrites the overview from the extracted text |
| Menus and prices live in images, so offerings come back empty | Dragon Factory | Idea: vision AI reads menu images (live AI mode) |
| Restaurant brand names only exist as logo images | Dragon Factory | Partly fixed: cleaned image file names give sub brand names; vision AI would read the rest |

## Ethics and permissions

| Issue | Found on | Status |
|---|---|---|
| A site's robots.txt blocked specific AI crawlers (my research tool was blocked) but allowed XenFloBot, so the scrape was technically permitted | Anime Boba Cafe | Idea: instead of refusing outright, ask before continuing. When robots.txt restricts AI crawlers (or all bots), show a prompt: "This site limits automated or AI access. Are you the owner, or do you have the owner's permission?" with the same consent checkbox as the upload fallback. If confirmed, record the consent (who, when, method) with the knowledge base and continue; if not, offer manual entry instead. This respects the site's wishes while still serving real owners, who are MoFlo's actual customers. |

## Observations from MoFlo's own Knowledge feature

These came from testing an existing knowledge feature with my own site and Apex Hosting, and from sample profiles. Framed as improvement ideas.

| Observation | Idea |
|---|---|
| On a personal site, fields like founded, employees, and legal entity stay empty because the site doesn't list them | Enrichment from outside sources (state business registries, Google Business Profile, LinkedIn) |
| After building Apex's knowledge base, Flo generated an email titled "Florida's gaming scene is booming," though Apex isn't a Florida business | Accurate service area detection; a business that serves customers online shouldn't get a single local voice location |
| Blog titles came out very technical and corporate, while Apex's real voice is a friendly gamer brand | Use testimonials and real customer language to calibrate writing style and audience |
| Key People included customers quoted in testimonials | Separate team from customers (done in XenFlo) |
| Gender inferred from names | Only fill when stated on the site, or mark clearly as inferred |

## Saving and versions

| Issue | Found on | Status |
|---|---|---|
| Re-scrape brings back items the owner deleted by hand, because the fresh crawl finds them again | Phase 5 | Idea: remember dismissed items per knowledge base and skip them on re-scrape |
| Editing a scraped list item and then re-scraping shows both the old and the edited version | Phase 5 | Idea: track which scraped item an edit replaced, so the original isn't added back |
| Re-scrapes don't create a crawl run record (only first saves do) | Phase 5 | Planned: small migration so updates from a re-scrape also record the crawl |

## Development environment

| Issue | Status |
|---|---|
| Hydration warning in the browser caused by the Grammarly extension injecting attributes into `<body>` | Not an app bug. Optional: add `suppressHydrationWarning` to `<body>` |
| Files getting Windows (CRLF) line endings in a Linux project | Fixed: `core.autocrlf input` and WebStorm set to LF |
