/*
  Friendly names for the scored fields in src/lib/scraper/score.ts.
  `todo` is the "Next to do" card text; `name` is used in the completeness breakdown.
*/
export const FIELD_LABELS: Record<string, { name: string; todo: string }> = {
  "company.name": { name: "Company name", todo: "Add your company name" },
  "company.overview": { name: "Overview", todo: "Describe what your business does" },
  "company.industry": { name: "Industry", todo: "Add your industry" },
  "company.yearFounded": { name: "Year founded", todo: "Add your founding year" },
  "company.legalEntityType": { name: "Legal entity", todo: "Add your legal entity type (LLC, Inc...)" },
  "company.mainAddress": { name: "Main address", todo: "Add your main address" },
  "company.pitch": { name: "Pitch", todo: "Write your one-line pitch" },
  "company.foundingStory": { name: "Founding story", todo: "Tell your founding story" },
  "contact.emails": { name: "Email", todo: "Add a contact email" },
  "contact.phones": { name: "Phone", todo: "Add a phone number" },
  "customers.targetBuyers": { name: "Target buyers", todo: "Add who you sell to" },
  "customers.idealPersona": { name: "Ideal customer", todo: "Describe your ideal customer" },
  "customers.ctas": { name: "Calls to action", todo: "Add your main call to action" },
  "brand.logos": { name: "Logo", todo: "Add your logo" },
  "brand.colors": { name: "Brand colors", todo: "Add your brand colors" },
  "brand.fonts": { name: "Fonts", todo: "Add your brand fonts" },
  "brand.socialLinks": { name: "Social links", todo: "Add your social profiles" },
  "brand.writingStyle": { name: "Writing style", todo: "Describe your writing style" },
  people: { name: "Team members", todo: "Add a team member" },
  offerings: { name: "Offerings", todo: "Add a product or service" },
  "insights.testimonials": { name: "Testimonials", todo: "Add a customer testimonial" },
  "insights.faqs": { name: "FAQs", todo: "Add a frequently asked question" },
  "insights.trustSignals": { name: "Trust signals", todo: "Add an award, certification or rating" },
};

export function fieldName(path: string): string {
  return FIELD_LABELS[path]?.name ?? path;
}
