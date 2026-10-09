/**
 * Knowledge base data model: the single source of truth for the whole app.
 *
 * Every piece of knowledge is wrapped in a Field so we always know where it
 * came from (source URL), how much to trust it (confidence) and when it last
 * changed. Lists are arrays of Fields, so each item carries its own metadata.
 *
 * The matching Zod schema lives in ./knowledge.schema.ts and is type-checked
 * against these types, so the two can't silently drift apart.
 */

/** How a value got into the knowledge base. Drives the badge shown in Advanced view. */
export type Confidence =
  | "scraped" // read directly from the website
  | "inferred" // derived by rules from scraped data (e.g. name from a logo file name)
  | "ai_mock" // placeholder AI output (no API key), labeled "AI preview"
  | "ai_live" // real AI output
  | "user_edited" // typed or changed by the user
  | "missing"; // we looked and found nothing

export interface Field<T> {
  value: T | null;
  /** URL (or "upload"/"user") the value came from. Null when missing. */
  source: string | null;
  confidence: Confidence;
  /** ISO timestamp */
  updatedAt: string;
}

export type FieldList<T> = Field<T>[];

// ---------- Shared item shapes ----------

export interface Address {
  street: string | null;
  city: string | null;
  region: string | null; // state / province
  postalCode: string | null;
  country: string | null;
  /** Full one-line version, used when we can't split the parts */
  formatted: string;
}

export type SocialPlatform =
  | "linkedin"
  | "facebook"
  | "instagram"
  | "x"
  | "youtube"
  | "tiktok"
  | "twitch"
  | "discord"
  | "pinterest"
  | "other";

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
}

export interface Logo {
  url: string;
  /** Where on the page we found it: "header img", "og:image", "favicon"... */
  kind: string;
  alt: string | null;
}

export interface Person {
  name: string;
  title: string | null;
  role: string | null;
  bio: string | null;
  imageUrl: string | null;
  /** Team members are kept separate from customers/partners (e.g. testimonial authors). */
  type: "team" | "customer_partner";
}

export type PricingType = "fixed" | "starting_at" | "range" | "subscription" | "quote" | "free" | "unknown";

export interface Offering {
  name: string;
  category: string | null;
  description: string | null;
  features: string[];
  pricingType: PricingType;
  /** Raw price text as shown, e.g. "$9.99/mo" */
  priceText: string | null;
  priceAmount: number | null;
  currency: string | null;
}

export interface Testimonial {
  quote: string;
  author: string | null;
  authorTitle: string | null;
  /** Company the author belongs to, when the attribution names one */
  company: string | null;
  rating: number | null;
}

export interface Faq {
  question: string;
  answer: string;
}

export interface TrustSignal {
  kind: "certification" | "award" | "review_count" | "rating" | "guarantee" | "other";
  text: string;
}

export interface LinkItem {
  label: string;
  url: string;
}

export interface Cta {
  text: string;
  url: string | null;
}

export interface Supplier {
  name: string;
  /** "analytics", "payments", "email", "chat", "partner"... */
  category: string;
}

export interface VoiceGuide {
  wordsToUse: string[];
  wordsToAvoid: string[];
  dos: string[];
  donts: string[];
}

// ---------- Sections (one per UI tab) ----------

export interface CompanySection {
  name: Field<string>;
  overview: Field<string>;
  website: Field<string>;
  industry: Field<string>;
  businessModel: Field<string>; // B2B, B2C, marketplace...
  companyRole: Field<string>; // manufacturer, retailer, service provider...
  yearFounded: Field<number>;
  legalEntityType: Field<string>; // LLC, Inc, Ltd...
  legalName: Field<string>;
  employeeCount: Field<string>; // ranges like "11-50" are common, so string
  revenue: Field<string>;
  mainAddress: Field<Address>;
  otherLocations: FieldList<Address>;
  serviceLocations: FieldList<string>;
  alternateNames: FieldList<string>;
  pitch: Field<string>;
  foundingStory: Field<string>;
}

export interface ContactSection {
  emails: FieldList<string>;
  phones: FieldList<string>;
  contactPageUrl: Field<string>;
}

export interface CustomersSection {
  targetBuyers: FieldList<string>;
  customerNeeds: FieldList<string>;
  idealPersona: Field<string>;
  industryGroupings: FieldList<string>;
  industryOutlook: Field<string>;
  channels: FieldList<string>;
  funnels: FieldList<string>;
  ctas: FieldList<Cta>;
  suppliersPartners: FieldList<Supplier>;
}

export interface BrandSection {
  writingStyle: Field<string>;
  artStyle: Field<string>;
  fonts: FieldList<string>;
  /** Hex strings like "#2563eb" */
  colors: FieldList<string>;
  logos: FieldList<Logo>;
  socialLinks: FieldList<SocialLink>;
}

export interface InsightsSection {
  testimonials: FieldList<Testimonial>;
  faqs: FieldList<Faq>;
  differentiators: FieldList<string>;
  trustSignals: FieldList<TrustSignal>;
  contentThemes: FieldList<string>;
  promotions: FieldList<string>;
  pressMentions: FieldList<LinkItem>;
  communityValues: FieldList<string>;
  legalLinks: FieldList<LinkItem>;
  positioningSignals: FieldList<string>;
}

export interface ContentKitSection {
  contentPillars: FieldList<string>;
  socialHooks: FieldList<string>;
  hashtags: FieldList<string>;
  emailSubjects: FieldList<string>;
  blogIdeas: FieldList<string>;
  voiceGuide: Field<VoiceGuide>;
}

// ---------- Crawl, completeness, consent ----------

export type PageCategory =
  | "home"
  | "about"
  | "team"
  | "services"
  | "products"
  | "pricing"
  | "features"
  | "faq"
  | "testimonials"
  | "contact"
  | "locations"
  | "press"
  | "careers"
  | "blog"
  | "legal"
  | "other";

export interface CrawledPage {
  url: string;
  category: PageCategory;
  status: number | null; // HTTP status, null if the request failed
  title: string | null;
  fetchedAt: string;
  durationMs: number;
  error: string | null;
}

export interface CrawlLogEntry {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface CrawlInfo {
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  robotsAllowed: boolean;
  /** Pages we found but did not crawl yet (used by "Dig deeper") */
  pendingUrls: string[];
  pages: CrawledPage[];
  log: CrawlLogEntry[];
}

export interface Completeness {
  /** 0 to 100 */
  score: number;
  /** Dot paths of important fields still empty, e.g. "company.yearFounded" */
  missing: string[];
}

export interface Consent {
  confirmed: true;
  timestamp: string;
  method: "checkbox_upload" | "checkbox_paste";
}

// ---------- The knowledge base ----------

export interface KnowledgeBase {
  id: string;
  url: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  company: CompanySection;
  contact: ContactSection;
  customers: CustomersSection;
  brand: BrandSection;
  people: FieldList<Person>;
  offerings: FieldList<Offering>;
  insights: InsightsSection;
  contentKit: ContentKitSection;
  completeness: Completeness;
  crawl: CrawlInfo;
  consent: Consent | null;
}
