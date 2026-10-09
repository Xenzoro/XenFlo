/**
 * What the model must return. The same Zod schemas are sent to OpenAI as a strict JSON schema
 * (so the model can only answer in this shape) and used again to validate the reply.
 * Lists are trimmed in code rather than with maxItems, which strict mode may not support.
 */
import { z } from "zod";

const text = z.string();
const list = z.array(z.string());

export const textOutputSchema = z.object({
  pitch: text.nullable(),
  writingStyle: text.nullable(),
  voiceGuide: z
    .object({
      wordsToUse: list,
      wordsToAvoid: list,
      dos: list,
      donts: list,
    })
    .nullable(),
  idealPersona: text.nullable(),
  customerNeeds: list,
  targetBuyers: list,
  contentPillars: list,
  socialHooks: list,
  hashtags: list,
  emailSubjects: list,
  blogIdeas: list,
  basedOn: list,
  missing: list,
});
export type TextOutput = z.infer<typeof textOutputSchema>;

/** Screenshot facts may only fill simple text fields (see SCREENSHOT_PATHS in input.ts). */
export const visionOutputSchema = z.object({
  images: z.array(
    z.object({
      index: z.number().int(),
      isLogo: z.boolean(),
      isBlankOrPlaceholder: z.boolean(),
      textInImage: list,
      /** Brand names written in this image; only logo images count as alternate names */
      brandNames: list,
    }),
  ),
  artStyle: text.nullable(),
  screenshotFacts: z.array(z.object({ path: z.string(), value: z.string() })),
  basedOn: list,
  missing: list,
});
export type VisionOutput = z.infer<typeof visionOutputSchema>;

/** Zod -> the JSON schema OpenAI's structured outputs expect (minus the $schema marker). */
export function toOpenAiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
