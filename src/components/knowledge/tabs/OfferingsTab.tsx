"use client";

/**
 * Offerings: product and service cards with category, features and price.
 * Food, drink and retail businesses (or any site with menus) get the menu view instead, with a toggle back to cards.
 */
import { useState } from "react";
import type { Offering } from "@/types/knowledge";
import { BLANK_OFFERING, OFFERING_FIELDS, PRICING_LABEL } from "../offerings/fields";
import { Badge } from "@/components/ui/Badge";
import { AiValueTag } from "@/components/ui/AiValueTag";
import { useKnowledge } from "@/context/KnowledgeContext";
import { SectionCard } from "@/components/ui/Card";
import { RecordList } from "@/components/ui/RecordList";
import { Pill } from "@/components/ui/Pill";
import { offeringsFirst } from "@/lib/utils/offerings";
import { MenuView } from "../offerings/MenuView";
import { PendingMenus } from "../offerings/PendingMenus";

function OfferingCard({ o }: { o: Offering }) {
  const { kb, dismissValue, busy } = useKnowledge();
  const index = kb?.offerings.findIndex((f) => f.value === o) ?? -1;
  // A category suggested by AI keeps its own badge (the rest of the offering was read from the site),
  // until the owner edits the offering by hand.
  const aiCategory = o.categoryConfidence && kb?.offerings[index]?.confidence !== "user_edited" ? o.categoryConfidence : null;
  return (
    <div className="flex h-full flex-col pr-14">
      {o.category && (
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
          {o.category}
          {aiCategory && index >= 0 && (
            <span className="normal-case tracking-normal">
              <AiValueTag confidence={aiCategory} evidence={o.categoryEvidence} onRemove={() => dismissValue(`offerings.${index}.category`)} disabled={busy} />
            </span>
          )}
        </p>
      )}
      <p className="mt-0.5 font-semibold">{o.name}</p>
      {o.group && <p className="text-xs text-muted">{o.group}</p>}
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
  const { kb } = useKnowledge();
  // Restaurants, cafes and shops (or any site with menus) get the menu view; service businesses keep the cards
  const menuStyle = !!kb && offeringsFirst(kb);
  const [view, setView] = useState<"menu" | "cards">(menuStyle ? "menu" : "cards");
  const sources = kb?.crawl.menuSources ?? [];

  return (
    <div className="space-y-4">
      <PendingMenus sources={sources} />
      <SectionCard
        title={menuStyle ? "Menu and offerings" : "Products and services"}
        subtitle={menuStyle ? "Grouped by brand or location, then section, with prices when they're listed" : "What you sell, with prices when your site lists them"}
        action={
          menuStyle && (
            <div className="flex gap-1.5" role="group" aria-label="Offerings layout">
              {(["menu", "cards"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}>
                  <Pill active={view === v}>{v === "menu" ? "Menu view" : "Cards"}</Pill>
                </button>
              ))}
            </div>
          )
        }
      >
        {menuStyle && view === "menu" ? (
          <MenuView />
        ) : (
          <RecordList<Offering>
            path="offerings"
            columns={3}
            fields={OFFERING_FIELDS}
            blank={BLANK_OFFERING}
            addLabel="offering"
            emptyText="We didn't find products or services. Add what you sell so Flo can promote it."
            render={(o) => <OfferingCard o={o} />}
          />
        )}
      </SectionCard>
    </div>
  );
}
