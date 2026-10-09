/**
 * Loads the versioned prompt files in /prompts (the same files documented in prompts/README.md).
 * Each file is used up to its "## Example" heading: the role, input format, output schema and
 * rules go to the model; the examples are for people reading the docs.
 * next.config.ts includes /prompts in the /api/enrich bundle so this works on Vercel.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export const TEXT_PROMPTS = ["company-pitch.v1", "writing-style.v1", "ideal-persona.v1", "content-kit.v1"] as const;
export const VISION_PROMPT = "logo-vision.v1";

const cache = new Map<string, string>();

function load(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const raw = readFileSync(path.join(process.cwd(), "prompts", `${name}.md`), "utf8");
  const body = raw.split(/^## Example\b/m)[0].trim();
  cache.set(name, body);
  return body;
}

// Shared rules from prompts/README.md, repeated here because every call needs them.
const SHARED_RULES = `You enrich a small business's knowledge base for a marketing platform.
Rules for every field:
1. Use only the input. No outside knowledge about the company, even if you think you know it.
2. Never invent facts: no years, numbers, awards, locations, prices, names or quotes that aren't in the input.
3. When the input can't support a field, return null (or an empty list) and add the field name to "missing". Don't write something generic to fill the gap.
4. Answer with one JSON object that matches the schema exactly.`;

/** System prompt for the single text call: shared rules, then each field's prompt file. */
export function textSystemPrompt(): string {
  const sections = TEXT_PROMPTS.map((name) => `----- ${name} -----\n${load(name)}`);
  return `${SHARED_RULES}

You will fill several fields at once. Each section below is the full brief for some of them.
Return ONE JSON object combining all of their outputs, using the top-level keys in the response schema.
Ignore each section's own "basedOn"/"missing" keys and use the shared top-level "basedOn" and "missing" instead.
The input is one JSON object of knowledge base facts; each section reads the keys it lists.

${sections.join("\n\n")}`;
}

/** System prompt for the image call. */
export function visionSystemPrompt(): string {
  return `${SHARED_RULES}

----- ${VISION_PROMPT} -----
${load(VISION_PROMPT)}

----- screenshots -----
Some images may be screenshots the owner uploaded (their "kind" is "screenshot"), each with the fields it should fill.
For those, copy facts that are clearly readable into "screenshotFacts" as { "path", "value" }, using only the allowed paths
listed for that screenshot. Copy text exactly; leave out anything you can't read with certainty.`;
}

/** Recorded in the cache key, so editing a prompt version invalidates old results. */
export const PROMPT_VERSIONS = [...TEXT_PROMPTS, VISION_PROMPT].join(",");
