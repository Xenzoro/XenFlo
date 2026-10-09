"use client";

/** Insights (advanced): testimonials, FAQs, differentiators, trust signals and other marketing signals. */
import { Star } from "lucide-react";
import type { Faq, LinkItem, Testimonial, TrustSignal } from "@/types/knowledge";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/Card";
import { EditableList } from "@/components/ui/EditableList";
import { RecordList } from "@/components/ui/RecordList";

const LINK_FIELDS = [
  { key: "label", label: "Title", required: true },
  { key: "url", label: "URL", required: true },
];

function LinkCard({ item }: { item: LinkItem }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block pr-14 text-sm font-medium text-primary hover:underline">
      {item.label}
      <span className="block truncate text-xs font-normal text-subtle">{item.url}</span>
    </a>
  );
}

export function InsightsTab() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SectionCard title="Testimonials" subtitle="What customers say about you" className="md:col-span-2">
        <RecordList<Testimonial>
          path="insights.testimonials"
          columns={2}
          addLabel="testimonial"
          emptyText="No testimonials found yet."
          blank={{ quote: "", author: null, authorTitle: null, company: null, rating: null }}
          fields={[
            { key: "quote", label: "Quote", kind: "textarea", required: true },
            { key: "author", label: "Author" },
            { key: "authorTitle", label: "Author title" },
            { key: "company", label: "Company" },
            { key: "rating", label: "Rating (1-5)", kind: "number" },
          ]}
          render={(t) => (
            <figure className="pr-14">
              {t.rating != null && (
                <div className="mb-1 flex text-warning">
                  {Array.from({ length: Math.round(t.rating) }, (_, i) => (
                    <Star key={i} className="size-3.5 fill-current" />
                  ))}
                </div>
              )}
              <blockquote className="line-clamp-5 text-sm">“{t.quote}”</blockquote>
              {t.author && (
                <figcaption className="mt-2 text-xs text-muted">
                  {[t.author, t.authorTitle, t.company].filter(Boolean).join(" · ")}
                </figcaption>
              )}
            </figure>
          )}
        />
      </SectionCard>

      <SectionCard title="FAQs" subtitle="Questions customers ask" className="md:col-span-2">
        <RecordList<Faq>
          path="insights.faqs"
          columns={2}
          addLabel="FAQ"
          emptyText="No FAQs found yet."
          blank={{ question: "", answer: "" }}
          fields={[
            { key: "question", label: "Question", required: true },
            { key: "answer", label: "Answer", kind: "textarea", required: true },
          ]}
          render={(f) => (
            <div className="pr-14">
              <p className="text-sm font-semibold">{f.question}</p>
              <p className="mt-1 line-clamp-4 text-xs text-muted">{f.answer}</p>
            </div>
          )}
        />
      </SectionCard>

      <SectionCard title="Differentiators" subtitle="What makes you different">
        <EditableList path="insights.differentiators" variant="rows" addLabel="differentiator" />
      </SectionCard>

      <SectionCard title="Trust signals" subtitle="Certifications, awards, ratings, guarantees">
        <EditableList<TrustSignal>
          path="insights.trustSignals"
          variant="rows"
          addLabel="trust signal"
          format={(t) => t.text}
          parse={(text, prev) => ({ text, kind: prev?.kind ?? "other" })}
          render={(t) => (
            <span>
              {t.text} <Badge className="ml-1">{t.kind.replace("_", " ")}</Badge>
            </span>
          )}
        />
      </SectionCard>

      <SectionCard title="Content themes" subtitle="Topics that come up again and again">
        <EditableList path="insights.contentThemes" addLabel="theme" />
      </SectionCard>

      <SectionCard title="Promotions" subtitle="Deals and offers stated on your site">
        <EditableList path="insights.promotions" variant="rows" addLabel="promotion" />
      </SectionCard>

      <SectionCard title="Seasonal messaging" subtitle="Seasonal or recurring campaigns (e.g. summer tune-ups, holiday hours)">
        <EditableList path="insights.seasonalMessaging" variant="rows" addLabel="seasonal message" />
      </SectionCard>

      <SectionCard title="Community and values" subtitle="Causes, values and community work">
        <EditableList path="insights.communityValues" variant="rows" addLabel="value" />
      </SectionCard>

      <SectionCard title="Positioning" subtitle="Competitor and positioning signals">
        <EditableList path="insights.positioningSignals" variant="rows" addLabel="signal" />
      </SectionCard>

      <SectionCard title="Press mentions" subtitle="Articles and features about you">
        <RecordList<LinkItem> path="insights.pressMentions" fields={LINK_FIELDS} blank={{ label: "", url: "" }} addLabel="press mention" render={(l) => <LinkCard item={l} />} />
      </SectionCard>

      <SectionCard title="Legal and compliance" subtitle="Privacy policy, terms and similar pages">
        <RecordList<LinkItem> path="insights.legalLinks" fields={LINK_FIELDS} blank={{ label: "", url: "" }} addLabel="legal link" render={(l) => <LinkCard item={l} />} />
      </SectionCard>
    </div>
  );
}
