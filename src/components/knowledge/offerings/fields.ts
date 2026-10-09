/** Offering labels and the edit form, shared by the card view and the menu view. */
import type { Offering, PricingType } from "@/types/knowledge";
import type { FormField } from "@/components/ui/RecordForm";

export const PRICING_LABEL: Record<PricingType, string> = {
  fixed: "Fixed price",
  starting_at: "Starting at",
  range: "Price range",
  subscription: "Subscription",
  quote: "Quote",
  free: "Free",
  unknown: "Price not listed",
};

export const OFFERING_FIELDS: FormField[] = [
  { key: "name", label: "Name", required: true },
  { key: "group", label: "Brand or location", placeholder: "e.g. Sakana Sushi (leave empty for the whole business)" },
  { key: "category", label: "Category" },
  { key: "description", label: "Description", kind: "textarea" },
  { key: "features", label: "Features", kind: "list" },
  { key: "pricingType", label: "Pricing", kind: "select", options: Object.entries(PRICING_LABEL).map(([value, label]) => ({ value, label })) },
  { key: "priceText", label: "Price as shown", placeholder: "e.g. $9.99/mo" },
  { key: "priceAmount", label: "Price amount", kind: "number" },
  { key: "currency", label: "Currency", placeholder: "USD" },
];

export const BLANK_OFFERING: Offering = { name: "", category: null, description: null, features: [], pricingType: "unknown", priceText: null, priceAmount: null, currency: null };

/** "$12" or "$9.95–$34.95" */
export function priceRange(min: number | null, max: number | null): string | null {
  if (min === null || max === null) return null;
  const f = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  return min === max ? f(min) : `${f(min)}–${f(max)}`;
}
