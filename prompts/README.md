# Enrichment prompts

Versioned prompts for XenFlo's AI enrichment. Each file is one prompt; a change in behavior means a new version file (`company-pitch.v2.md`), so saved knowledge bases can record which version produced a value.

**Status: wired in.** `src/lib/ai/enrich.ts` is the single entry point, run only from the **Enrich with AI** button:
- **Loading.** `src/lib/ai/prompts.ts` reads these files at runtime and keeps each one up to its `## Example` heading.
- **Text call.** [understand-business.v1](understand-business.v1.md) is the single text prompt (since Phase 9). It reads page evidence and returns every tier 2 field with confidence, evidence and reason. The earlier company-pitch, writing-style, ideal-persona and content-kit prompts were merged into it; they stay here as reference for how each field was first specified.
- **Vision call.** `logo-vision` drives a separate call for images.
- **Menus (Phase 10).** [menu-reader.v2](menu-reader.v2.md) runs from its own **Read menus with AI** button (`src/lib/ai/read-menus.ts`, `/api/menus`), one call per menu, cached per menu.
- **Validation.** The output schema is enforced with OpenAI structured outputs and re-checked with Zod (`src/lib/ai/schemas.ts`).
- **Fallback.** With no key, no passcode, the daily cap reached, or any failure, the app returns labeled preview suggestions instead.
- **Caching.** Editing a prompt file changes the cache key, so old cached answers aren't reused.

| File | Fills (paths in `src/types/knowledge.ts`) | Model |
|---|---|---|
| [understand-business.v1.md](understand-business.v1.md) | **in use:** all tier 2 text fields (industry, business model, company role, customers, channels, funnels, themes, positioning, values, seasonal messaging, pitch, writing style, voice guide, Content Kit, offering categories) | text |
| [company-pitch.v1.md](company-pitch.v1.md) | `company.pitch` (merged into understand-business) | reference |
| [writing-style.v1.md](writing-style.v1.md) | `brand.writingStyle`, `contentKit.voiceGuide` (merged) | reference |
| [ideal-persona.v1.md](ideal-persona.v1.md) | `customers.idealPersona`, `customers.customerNeeds`, `customers.targetBuyers` (merged) | reference |
| [content-kit.v1.md](content-kit.v1.md) | `contentKit.contentPillars`, `socialHooks`, `hashtags`, `emailSubjects`, `blogIdeas` (merged) | reference |
| [menu-reader.v2.md](menu-reader.v2.md) | **in use:** `offerings` (name, description, price as printed, section), from picture menus and jumbled PDF text; headline packages and tiers with a price count as items | vision |
| [menu-reader.v1.md](menu-reader.v1.md) | first version; its cached answers are still used until a menu is read again | reference |
| [logo-vision.v1.md](logo-vision.v1.md) | `brand.artStyle`, `company.alternateNames` (from logos only), screenshot facts | vision |

## Rules shared by every prompt
1. **Use only the input.** No outside knowledge about the company, even if the model "knows" it.
2. **Never invent facts:** no years, numbers, awards, locations, prices, names or quotes that aren't in the input.
3. **Missing means `null`.** When the input can't support a field, return `null` for it and name the reason in `missing`. Don't write something generic to fill the gap.
4. **Output JSON only**, matching the schema exactly. No prose around it.
5. **Cite evidence and pass the bar.** Answers cite evidence ids or quotes from the input. In code, facts need high confidence plus 2 real evidence items, generated writing needs 1, and tier 3 fields (people, legal entity, legal name, employee count, revenue) are always dropped. See `src/lib/ai/confidence.ts` and `src/lib/ai/field-tiers.ts`.

## How the app stores results
The model returns plain values, which become suggestions the owner accepts or rejects. Accepted ones are wrapped in the usual `Field` shape:

```ts
{ value, source: "ai:<model>", confidence: "ai_live", updatedAt }
```

- A `null` value is never suggested, so the field stays `confidence: "missing"`.
- Preview output (no key or passcode, cap reached, or a failure) is stored as `confidence: "ai_mock"` and shows the **AI preview** badge.
- A value the owner already edited (`user_edited`) is **never overwritten** by AI.
