"use client";

/*
  Company: hero card with the name and quick stats, then two-column section cards
  (About, Business, Locations, Contact). Every value edits inline.
*/
import { Building2 } from "lucide-react";
import type { Address } from "@/types/knowledge";
import { useKnowledge } from "@/context/KnowledgeContext";
import { Card, SectionCard, SectionLabel } from "@/components/ui/Card";
import { EditableField } from "@/components/ui/EditableField";
import { EditableList } from "@/components/ui/EditableList";

// Addresses are edited as one line of text; the split parts are cleared when the user rewrites it.
const addressText = (a: Address) => a.formatted;
const parseAddress = (text: string): Address => ({ street: null, city: null, region: null, postalCode: null, country: null, formatted: text });

const validYear = (t: string) => {
  const y = Number(t);
  return Number.isInteger(y) && y >= 1700 && y <= new Date().getFullYear() ? null : "Enter a 4-digit year.";
};

const validEmail = (t: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? null : "That doesn't look like an email.");

export function CompanyTab() {
  const { kb } = useKnowledge();
  if (!kb) return null;
  const logo = kb.brand.logos.find((l) => l.value)?.value;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-page">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote logos from any domain
              <img src={logo.url} alt={logo.alt ?? "Logo"} className="max-h-12 max-w-12 object-contain" />
            ) : (
              <Building2 className="size-7 text-subtle" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <SectionLabel>Company</SectionLabel>
            <EditableField path="company.name" emptyLabel="company name" valueClassName="text-2xl font-bold" />
            <EditableField
              path="company.website"
              emptyLabel="website"
              display={(v: string) => <span className="text-primary">{v.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>}
            />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border-soft pt-5 md:grid-cols-4">
          <EditableField<number> path="company.yearFounded" label="Founded" kind="number" emptyLabel="year" validate={validYear} valueClassName="font-semibold" />
          <EditableField path="company.legalEntityType" label="Legal entity" emptyLabel="type" placeholder="LLC, Inc…" valueClassName="font-semibold" />
          <EditableField path="company.employeeCount" label="Employees" emptyLabel="count" placeholder="e.g. 11-50" valueClassName="font-semibold" />
          <EditableField path="company.revenue" label="Revenue" emptyLabel="amount" placeholder="e.g. $1M-$5M" valueClassName="font-semibold" />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="About" subtitle="What you do and why you started">
          <div className="space-y-4">
            <EditableField path="company.overview" label="Overview" kind="textarea" />
            <EditableField path="company.pitch" label="One-line pitch" kind="textarea" emptyLabel="pitch" />
            <EditableField path="company.foundingStory" label="Founding story" kind="textarea" emptyLabel="story" />
          </div>
        </SectionCard>

        <SectionCard title="Business" subtitle="How your company is set up">
          <div className="grid gap-4 sm:grid-cols-2">
            <EditableField path="company.industry" label="Industry" emptyLabel="industry" />
            <EditableField path="company.businessModel" label="Business model" emptyLabel="model" placeholder="B2B, B2C…" />
            <EditableField path="company.companyRole" label="Company role" emptyLabel="role" placeholder="Service provider, retailer…" />
            <EditableField path="company.legalName" label="Legal name" emptyLabel="legal name" />
          </div>
        </SectionCard>

        <SectionCard title="Locations" subtitle="Where you are and where you work">
          <div className="space-y-4">
            <EditableField<Address> path="company.mainAddress" label="Main address" emptyLabel="address" format={addressText} parse={parseAddress} />
            <EditableList<Address> path="company.otherLocations" label="Other locations" variant="rows" format={addressText} parse={parseAddress} addLabel="location" />
            <EditableList path="company.serviceLocations" label="Service areas" addLabel="area" placeholder="e.g. Las Vegas Valley" />
            <EditableList path="company.alternateNames" label="Also known as" addLabel="name" />
          </div>
        </SectionCard>

        <SectionCard title="Contact" subtitle="How customers reach you">
          <div className="space-y-4">
            <EditableList path="contact.emails" label="Emails" variant="rows" addLabel="email" validate={validEmail} />
            <EditableList path="contact.phones" label="Phones" variant="rows" addLabel="phone" />
            <EditableField path="contact.contactPageUrl" label="Contact page" emptyLabel="link" />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
