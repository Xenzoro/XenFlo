"use client";

/** Customers: who you sell to, what they need, and how you reach them. */
import { ExternalLink } from "lucide-react";
import type { Cta, Supplier } from "@/types/knowledge";
import { SectionCard } from "@/components/ui/Card";
import { EditableField } from "@/components/ui/EditableField";
import { EditableList } from "@/components/ui/EditableList";

export function CustomersTab() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SectionCard title="Who you serve" subtitle="Your buyers and the groups they belong to">
        <div className="space-y-4">
          <EditableList path="customers.targetBuyers" label="Target buyers" addLabel="buyer" placeholder="e.g. Families with young kids" />
          <EditableList path="customers.industryGroupings" label="Industry groupings" addLabel="group" />
          <EditableField path="customers.idealPersona" label="Ideal customer" kind="textarea" emptyLabel="persona" />
        </div>
      </SectionCard>

      <SectionCard title="Needs and outlook" subtitle="What your customers care about">
        <div className="space-y-4">
          <EditableList path="customers.customerNeeds" label="Customer needs" variant="rows" addLabel="need" />
          <EditableField path="customers.industryOutlook" label="Industry outlook" kind="textarea" emptyLabel="outlook" />
        </div>
      </SectionCard>

      <SectionCard title="Marketing" subtitle="Channels, funnels and calls to action">
        <div className="space-y-4">
          <EditableList path="customers.channels" label="Channels" addLabel="channel" placeholder="e.g. Instagram, email" />
          <EditableList path="customers.funnels" label="Funnels" addLabel="funnel" placeholder="e.g. Free trial → paid plan" />
          <EditableList<Cta>
            path="customers.ctas"
            label="Calls to action"
            addLabel="CTA"
            format={(c) => c.text}
            parse={(text, prev) => ({ text, url: prev?.url ?? null })}
            render={(c) => (
              <span className="inline-flex items-center gap-1">
                {c.text}
                {c.url && <ExternalLink className="size-3 text-subtle" />}
              </span>
            )}
          />
        </div>
      </SectionCard>

      <SectionCard title="Suppliers and partners" subtitle="Tools and companies you work with (detected from your site's code)">
        <EditableList<Supplier>
          path="customers.suppliersPartners"
          addLabel="partner"
          format={(s) => s.name}
          parse={(name, prev) => ({ name, category: prev?.category ?? "partner" })}
          render={(s) => (
            <span>
              {s.name} <span className="text-subtle">· {s.category}</span>
            </span>
          )}
        />
      </SectionCard>
    </div>
  );
}
