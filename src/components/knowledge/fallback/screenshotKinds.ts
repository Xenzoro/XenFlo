/*
  "What does this screenshot show?" choices. The fields are what the screenshot should
  fill once vision AI can read it; until then they're listed as "waiting for AI".
*/
export const SCREENSHOT_KINDS = [
  { value: "offerings", label: "Menu, services or prices", fields: ["offerings"] },
  { value: "about", label: "About us or our story", fields: ["company.overview", "company.foundingStory"] },
  { value: "team", label: "Team or staff", fields: ["people"] },
  { value: "reviews", label: "Reviews or testimonials", fields: ["insights.testimonials"] },
  { value: "contact", label: "Contact info or hours", fields: ["contact.phones", "contact.emails", "company.mainAddress"] },
  { value: "branding", label: "Logo or branding", fields: ["brand.logos", "brand.artStyle"] },
  { value: "other", label: "Something else", fields: [] as string[] },
] as const;

export type ScreenshotKind = (typeof SCREENSHOT_KINDS)[number]["value"];

export function fieldsFor(kind: ScreenshotKind): string[] {
  return [...(SCREENSHOT_KINDS.find((k) => k.value === kind)?.fields ?? [])];
}
