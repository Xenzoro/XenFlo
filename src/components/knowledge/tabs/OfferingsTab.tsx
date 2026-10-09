"use client";

/** Offerings: product and service cards with category, features and price. */
import type { Offering, PricingType } from "@/types/knowledge";
import type { FormField } from "@/components/ui/RecordForm";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/Card";
import { RecordList } from "@/components/ui/RecordList";

const PRICING_LABEL: Record<PricingType, string> = {
  fixed: "Fixed price",
  starting_at: "Starting at",
  range: "Price range",
  subscription: "Subscription",
  quote: "Quote",
  free: "Free",
  unknown: "Price not listed",
};

const FIELDS: FormField[] = [
  { key: "name", label: "Name", required: true },
  { key: "category", label: "Category" },
  { key: "description", label: "Description", kind: "textarea" },
  { key: "features", label: "Features", kind: "list" },
  { key: "pricingType", label: "Pricing", kind: "select", options: Object.entries(PRICING_LABEL).map(([value, label]) => ({ value, label })) },
  { key: "priceText", label: "Price as shown", placeholder: "e.g. $9.99/mo" },
  { key: "priceAmount", label: "Price amount", kind: "number" },
  { key: "currency", label: "Currency", placeholder: "USD" },
];

const BLANK: Offering = { name: "", category: null, description: null, features: [], pricingType: "unknown", priceText: null, priceAmount: null, currency: null };

function OfferingCard({ o }: { o: Offering }) {
  return (
    <div className="flex h-full flex-col pr-14">
      {o.category && <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{o.category}</p>}
      <p className="mt-0.5 font-semibold">{o.name}</p>
      {o.description && <p className="mt-1 line-clamp-3 text-xs text-muted">{o.description}</p>}
      {o.features.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {o.features.slice(0, 5).map((f) => (
            <li key={f} className="flex gap-1.5">
              <span className="text-primary">✓</span>
              {f}
            </li>
          ))}
          {o.features.length > 5 && <li className="text-subtle">+{o.features.length - 5} more</li>}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        {o.priceText && <span className="text-lg font-bold">{o.priceText}</span>}
        <Badge>{PRICING_LABEL[o.pricingType]}</Badge>
      </div>
    </div>
  );
}

export function OfferingsTab() {
  return (
    <SectionCard title="Products and services" subtitle="What you sell, with prices when your site lists them">
      <RecordList<Offering>
        path="offerings"
        columns={3}
        fields={FIELDS}
        blank={BLANK}
        addLabel="offering"
        emptyText="We didn't find products or services. Add what you sell so Flo can promote it."
        render={(o) => <OfferingCard o={o} />}
      />
    </SectionCard>
  );
}
