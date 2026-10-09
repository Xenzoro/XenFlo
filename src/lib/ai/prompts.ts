/**
 * Loads the versioned prompt files in /prompts (the same files documented in prompts/README.md).
 * Each file is used up to its "## Example" heading: the role, input format, output schema and
 * rules go to the model; the examples are for people reading the docs.
 * next.config.ts includes /prompts in the /api/enrich bundle so this works on Vercel.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// One text call: understand-business.v1 merged the earlier pitch, persona, content-kit and writing-style briefs.
export const TEXT_PROMPTS = ["understand-business.v1"] as const;
export const VISION_PROMPT = "logo-vision.v1";
// Phase 10: its own button and route (/api/menus), not part of Enrich with AI
export const MENU_PROMPT = "menu-reader.v1";

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
3. When the input can't support a field, return null (or an empty list) and say why ("reason", or "missing" where the schema has it). Don't write something generic to fill the gap.
4. Answer with one JSON object that matches the schema exactly.`;

/** System prompt for the single text call: shared rules, then each field's prompt file. */
export function textSystemPrompt(): string {
  const sections = TEXT_PROMPTS.map((name) => `----- ${name} -----\n${load(name)}`);
  return `${SHARED_RULES}

Return ONE JSON object with exactly the top-level keys in the response schema.

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

/** System prompt for reading one menu (PDF, image or messy menu text). */
export function menuSystemPrompt(): string {
  return `${SHARED_RULES}

----- ${MENU_PROMPT} -----
${load(MENU_PROMPT)}`;
}

/** Recorded in the cache key, so editing a prompt version invalidates old results. */
export const PROMPT_VERSIONS = [...TEXT_PROMPTS, VISION_PROMPT].join(",");
