import type { Confidence, Field, KnowledgeBase } from "@/types/knowledge";

/** Wrap a value with its metadata. */
export function field<T>(value: T, source: string | null, confidence: Confidence): Field<T> {
  return { value, source, confidence, updatedAt: new Date().toISOString() };
}

/** An empty field: value null, marked missing. */
export function missing<T>(): Field<T> {
  return { value: null, source: null, confidence: "missing", updatedAt: new Date().toISOString() };
}

/** A blank knowledge base for a URL: every scalar is missing, every list is empty. */
export function emptyKnowledgeBase(url: string): KnowledgeBase {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    url,
    companyName: "",
    createdAt: now,
    updatedAt: now,
    version: 1,
    company: {
      name: missing(),
      overview: missing(),
      website: field(url, url, "scraped"),
      industry: missing(),
      businessModel: missing(),
      companyRole: missing(),
      yearFounded: missing(),
      legalEntityType: missing(),
      legalName: missing(),
      employeeCount: missing(),
      revenue: missing(),
      mainAddress: missing(),
      otherLocations: [],
      serviceLocations: [],
      alternateNames: [],
      pitch: missing(),
      foundingStory: missing(),
    },
    contact: { emails: [], phones: [], contactPageUrl: missing() },
    customers: {
      targetBuyers: [],
      customerNeeds: [],
      idealPersona: missing(),
      industryGroupings: [],
      industryOutlook: missing(),
      channels: [],
      funnels: [],
      ctas: [],
      suppliersPartners: [],
    },
    brand: {
      writingStyle: missing(),
      artStyle: missing(),
      fonts: [],
      colors: [],
      logos: [],
      socialLinks: [],
    },
    people: [],
    offerings: [],
    insights: {
      testimonials: [],
      faqs: [],
      differentiators: [],
      trustSignals: [],
      contentThemes: [],
      promotions: [],
      pressMentions: [],
      communityValues: [],
      legalLinks: [],
      positioningSignals: [],
    },
    contentKit: {
      contentPillars: [],
      socialHooks: [],
      hashtags: [],
      emailSubjects: [],
      blogIdeas: [],
      voiceGuide: missing(),
    },
    completeness: { score: 0, missing: [] },
    crawl: {
      startedAt: now,
      finishedAt: null,
      durationMs: 0,
      robotsAllowed: true,
      pendingUrls: [],
      pages: [],
      log: [],
    },
    consent: null,
    uploads: [],
  };
}
