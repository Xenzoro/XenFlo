/**
 * Zod schema matching src/types/knowledge.ts.
 * Used to validate scraper output, API payloads, and records loaded from Supabase.
 * The type check at the bottom fails the build if this drifts from the TS types.
 */
import { z } from "zod";
import type { KnowledgeBase } from "./knowledge";

export const confidenceSchema = z.enum([
  "scraped",
  "inferred",
  "ai_mock",
  "ai_live",
  "user_edited",
  "missing",
]);

/** Wraps any value schema in { value, source, confidence, updatedAt }. */
export function fieldSchema<T extends z.ZodType>(inner: T) {
  return z.object({
    value: inner.nullable(),
    source: z.string().nullable(),
    confidence: confidenceSchema,
    updatedAt: z.string(),
    evidence: z.array(z.string()).optional(),
  });
}

export function listSchema<T extends z.ZodType>(inner: T) {
  return z.array(fieldSchema(inner));
}

const str = z.string();
const nstr = z.string().nullable();

export const addressSchema = z.object({
  street: nstr,
  city: nstr,
  region: nstr,
  postalCode: nstr,
  country: nstr,
  formatted: str,
});

export const socialLinkSchema = z.object({
  platform: z.enum([
    "linkedin",
    "facebook",
    "instagram",
    "x",
    "youtube",
    "tiktok",
    "twitch",
    "discord",
    "pinterest",
    "other",
  ]),
  url: str,
});

export const logoSchema = z.object({ url: str, kind: str, alt: nstr });

export const personSchema = z.object({
  name: str,
  title: nstr,
  role: nstr,
  bio: nstr,
  imageUrl: nstr,
  type: z.enum(["team", "customer_partner"]),
});

export const offeringSchema = z.object({
  name: str,
  category: nstr,
  description: nstr,
  features: z.array(str),
  pricingType: z.enum(["fixed", "starting_at", "range", "subscription", "quote", "free", "unknown"]),
  priceText: nstr,
  priceAmount: z.number().nullable(),
  currency: nstr,
  categoryConfidence: confidenceSchema.optional(),
  categoryEvidence: z.array(str).optional(),
  // Added in Phase 10; optional so records saved earlier still validate
  group: nstr.optional(),
  location: nstr.optional(),
  sourceKind: z.enum(["page", "pdf", "image", "upload"]).optional(),
  foundOn: nstr.optional(),
});

export const testimonialSchema = z.object({
  quote: str,
  author: nstr,
  authorTitle: nstr,
  company: nstr,
  rating: z.number().nullable(),
});

export const faqSchema = z.object({ question: str, answer: str });

export const trustSignalSchema = z.object({
  kind: z.enum(["certification", "award", "review_count", "rating", "guarantee", "other"]),
  text: str,
});

export const linkItemSchema = z.object({ label: str, url: str });
export const ctaSchema = z.object({ text: str, url: nstr });
export const supplierSchema = z.object({ name: str, category: str });

export const voiceGuideSchema = z.object({
  wordsToUse: z.array(str),
  wordsToAvoid: z.array(str),
  dos: z.array(str),
  donts: z.array(str),
});

export const companySectionSchema = z.object({
  name: fieldSchema(str),
  overview: fieldSchema(str),
  website: fieldSchema(str),
  industry: fieldSchema(str),
  businessModel: fieldSchema(str),
  companyRole: fieldSchema(str),
  yearFounded: fieldSchema(z.number()),
  legalEntityType: fieldSchema(str),
  legalName: fieldSchema(str),
  employeeCount: fieldSchema(str),
  revenue: fieldSchema(str),
  mainAddress: fieldSchema(addressSchema),
  otherLocations: listSchema(addressSchema),
  serviceLocations: listSchema(str),
  alternateNames: listSchema(str),
  pitch: fieldSchema(str),
  foundingStory: fieldSchema(str),
});

export const contactSectionSchema = z.object({
  emails: listSchema(str),
  phones: listSchema(str),
  contactPageUrl: fieldSchema(str),
});

export const customersSectionSchema = z.object({
  targetBuyers: listSchema(str),
  customerNeeds: listSchema(str),
  idealPersona: fieldSchema(str),
  industryGroupings: listSchema(str),
  industryOutlook: fieldSchema(str),
  channels: listSchema(str),
  funnels: listSchema(str),
  ctas: listSchema(ctaSchema),
  suppliersPartners: listSchema(supplierSchema),
});

export const brandSectionSchema = z.object({
  writingStyle: fieldSchema(str),
  artStyle: fieldSchema(str),
  fonts: listSchema(str),
  colors: listSchema(str),
  logos: listSchema(logoSchema),
  socialLinks: listSchema(socialLinkSchema),
});

export const insightsSectionSchema = z.object({
  testimonials: listSchema(testimonialSchema),
  faqs: listSchema(faqSchema),
  differentiators: listSchema(str),
  trustSignals: listSchema(trustSignalSchema),
  contentThemes: listSchema(str),
  promotions: listSchema(str),
  pressMentions: listSchema(linkItemSchema),
  communityValues: listSchema(str),
  legalLinks: listSchema(linkItemSchema),
  positioningSignals: listSchema(str),
  // Added in Phase 9; older records don't have it
  seasonalMessaging: listSchema(str).default([]),
});

export const contentKitSectionSchema = z.object({
  contentPillars: listSchema(str),
  socialHooks: listSchema(str),
  hashtags: listSchema(str),
  emailSubjects: listSchema(str),
  blogIdeas: listSchema(str),
  voiceGuide: fieldSchema(voiceGuideSchema),
});

export const pageCategorySchema = z.enum([
  "home",
  "about",
  "team",
  "services",
  "products",
  "pricing",
  "features",
  "faq",
  "testimonials",
  "contact",
  "locations",
  "press",
  "careers",
  "blog",
  "legal",
  "menu",
  "other",
]);

export const menuSourceSchema = z.object({
  url: str,
  kind: z.enum(["pdf", "image"]),
  foundOn: str,
  label: nstr,
  group: nstr,
  status: z.enum(["found", "read", "no_text", "messy", "read_ai", "too_large", "blocked", "failed"]),
  items: z.number().int().min(0),
  bytes: z.number().nullable().optional(),
  pages: z.number().int().nullable().optional(),
  area: z.number().nullable().optional(),
  text: nstr.optional(),
  note: nstr.optional(),
});

export const crawlInfoSchema = z.object({
  startedAt: str,
  finishedAt: nstr,
  durationMs: z.number(),
  robotsAllowed: z.boolean(),
  pendingUrls: z.array(str),
  pages: z.array(
    z.object({
      url: str,
      category: pageCategorySchema,
      status: z.number().nullable(),
      title: nstr,
      fetchedAt: str,
      durationMs: z.number(),
      error: nstr,
      metaDescription: nstr.optional(),
      headings: z.array(str).optional(),
      imageAlts: z.array(str).optional(),
    }),
  ),
  log: z.array(
    z.object({
      at: str,
      level: z.enum(["info", "warn", "error"]),
      message: str,
    }),
  ),
  menuSources: z.array(menuSourceSchema).optional(),
});

export const knowledgeBaseSchema = z.object({
  id: str,
  url: str,
  companyName: str,
  createdAt: str,
  updatedAt: str,
  version: z.number().int(),
  company: companySectionSchema,
  contact: contactSectionSchema,
  customers: customersSectionSchema,
  brand: brandSectionSchema,
  people: listSchema(personSchema),
  offerings: listSchema(offeringSchema),
  insights: insightsSectionSchema,
  contentKit: contentKitSectionSchema,
  completeness: z.object({
    score: z.number().min(0).max(100),
    missing: z.array(str),
  }),
  crawl: crawlInfoSchema,
  consent: z
    .object({
      confirmed: z.literal(true),
      timestamp: str,
      method: z.enum(["checkbox_upload", "checkbox_paste", "checkbox_scrape"]),
    })
    .nullable(),
  // Added in Phase 6; records saved earlier have no uploads key, so default to []
  uploads: z
    .array(
      z.object({
        id: str,
        kind: z.enum(["text", "html", "screenshot"]),
        name: str,
        size: z.number().int().min(0),
        path: nstr,
        uploadedAt: str,
        needsAiFields: z.array(str),
      }),
    )
    .default([]),
  // Added in Phase 9
  dismissed: z.array(z.object({ path: str, key: str, at: str })).default([]),
  notApplicable: z.array(str).default([]),
});

// Compile-time guard: errors if the schema and the TS interface disagree in either direction.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const schemaMatchesTypes: Same<z.infer<typeof knowledgeBaseSchema>, KnowledgeBase> = true;
void schemaMatchesTypes;
