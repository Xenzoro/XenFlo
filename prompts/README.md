# Enrichment prompts

Versioned prompts for XenFlo's AI enrichment. Each file is one prompt; a change in behavior means a new version file (`company-pitch.v2.md`), so saved knowledge bases can record which version produced a value.

**Status:** these are designed and ready, but **not wired into the app yet**. XenFlo currently runs with no AI calls. AI-only fields stay Missing, and the Content Kit preview is a clearly labeled template (`src/lib/ai/mockPreview.ts`).

The plan:
- **One entry point.** A single `src/lib/ai/enrich.ts` loads these files and runs them server side when `OPENAI_API_KEY` is set.
- **Fallback.** On a missing key or any failure, it falls back to the labeled mock.
- **Validation.** Every response is validated with Zod against the output schema below before anything is written.

| File | Fills (paths in `src/types/knowledge.ts`) | Model |
|---|---|---|
| [company-pitch.v1.md](company-pitch.v1.md) | `company.pitch` | text |
| [writing-style.v1.md](writing-style.v1.md) | `brand.writingStyle`, `contentKit.voiceGuide` | text |
| [ideal-persona.v1.md](ideal-persona.v1.md) | `customers.idealPersona`, `customers.customerNeeds`, `customers.targetBuyers` | text |
| [logo-vision.v1.md](logo-vision.v1.md) | `brand.artStyle`, `company.alternateNames`, color hints | vision |

## Rules shared by every prompt
1. **Use only the input.** No outside knowledge about the company, even if the model "knows" it.
2. **Never invent facts:** no years, numbers, awards, locations, prices, names or quotes that aren't in the input.
3. **Missing means `null`.** When the input can't support a field, return `null` for it and name the reason in `missing`. Don't write something generic to fill the gap.
4. **Output JSON only**, matching the schema exactly. No prose around it.
5. **Cite evidence.** Each filled field lists the input paths it was based on (`basedOn`), so the Sources tab can show why.

## How the app stores results
The model returns plain values. The app wraps each one in the usual `Field` shape:

```ts
{ value, source: "ai:<prompt-file>", confidence: "ai_live", updatedAt }
```

- A `null` value is stored as `confidence: "missing"`.
- Without a key, mock output is stored as `confidence: "ai_mock"` and shows the **AI preview** badge.
- A value the owner already edited (`user_edited`) is **never overwritten** by AI.
