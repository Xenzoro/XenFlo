/**
 * What the model must return. The same Zod schemas are sent to OpenAI as a strict JSON schema
 * (so the model can only answer in this shape) and used again to validate the reply.
 * Lists are trimmed in code rather than with maxItems, which strict mode may not support.
 */
import { z } from "zod";

const text = z.string();
const list = z.array(z.string());
const confidence = z.enum(["high", "medium", "low"]);

/** One scalar answer with its confidence, cited evidence and (when not high) the reason. */
const scalar = z.object({ value: text.nullable(), confidence, evidence: list, reason: text.nullable() });
/** One list answer, same shape. */
const many = z.object({ values: list, confidence, evidence: list, reason: text.nullable() });

/** prompts/understand-business.v1.md: every tier 2 text field in one call. */
export const textOutputSchema = z.object({
  industry: scalar,
  businessModel: scalar,
  companyRole: scalar,
  industryOutlook: scalar,
  pitch: scalar,
  writingStyle: scalar,
  idealPersona: scalar,
  industryGroupings: many,
  serviceLocations: many,
  targetBuyers: many,
  customerNeeds: many,
  channels: many,
  funnels: many,
  contentThemes: many,
  positioningSignals: many,
  communityValues: many,
  seasonalMessaging: many,
  contentPillars: many,
  socialHooks: many,
  hashtags: many,
  emailSubjects: many,
  blogIdeas: many,
  voiceGuide: z.object({
    value: z.object({ wordsToUse: list, wordsToAvoid: list, dos: list, donts: list }).nullable(),
    confidence,
    evidence: list,
    reason: text.nullable(),
  }),
  offeringCategories: z.array(z.object({ offering: text, category: text, confidence, evidence: list })),
});
export type TextOutput = z.infer<typeof textOutputSchema>;
export type ScalarAnswer = z.infer<typeof scalar>;
export type ListAnswer = z.infer<typeof many>;

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

/** prompts/menu-reader.v1.md: one menu's items, copied as printed. */
export const menuOutputSchema = z.object({
  isMenu: z.boolean(),
  items: z.array(z.object({ name: text, description: text.nullable(), price: text.nullable(), section: text.nullable() })),
  unreadable: text.nullable(),
});
export type MenuOutput = z.infer<typeof menuOutputSchema>;

/** Zod -> the JSON schema OpenAI's structured outputs expect (minus the $schema marker). */
export function toOpenAiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
