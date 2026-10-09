"use client";

/*
  Overview: a mini dashboard.
  - Knowledge Health gauge (the completeness score), styled like MoFlo's Brand Power
  - "Next to do" cards: the highest-value missing fields. Inferred fields (tier 2) offer "Fill with AI";
    never-guessed ones (tier 3: people, legal entity) only "Add it yourself". Any can be marked
    "Not applicable", which counts as complete.
  - Content Kit preview: mock examples of what Flo could write, clearly labeled
*/
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown, FileText, Mail, MapPin, MessageSquare, PartyPopper, Sparkles } from "lucide-react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { SCORE_CHECKS } from "@/lib/scraper/score";
import { mockContentPreview } from "@/lib/ai/mockPreview";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionLabel } from "@/components/ui/Card";
import { Gauge } from "@/components/ui/Gauge";
import { Menu } from "@/components/ui/Menu";
import { tierOf } from "@/lib/ai/field-tiers";
import { ENRICH_EVENT } from "../ai/EnrichModal";
import { FIELD_LABELS, fieldName } from "../fieldLabels";

function healthLabel(score: number) {
  if (score >= 80) return { text: "Great", note: "Flo has plenty to work with." };
  if (score >= 50) return { text: "Good", note: "A few more details will make your content sharper." };
  return { text: "Needs work", note: "Add the basics below so Flo can sound like you." };
}

export function OverviewTab() {
  const { kb, jumpTo, setNotApplicable, promoteLocation, busy } = useKnowledge();
  if (!kb) return null;

  const { score, missing } = kb.completeness;
  const health = healthLabel(score);
  // Biggest point gains first
  const todos = SCORE_CHECKS.filter((c) => missing.includes(c.path))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  const preview = mockContentPreview(kb);
  // Screenshots marked as holding info that only vision AI can read
  const waiting = [...new Set((kb.uploads ?? []).flatMap((u) => u.needsAiFields))];

  const stats = [
    { label: "Pages read", value: kb.crawl.pages.length },
    { label: "Offerings", value: kb.offerings.length },
    { label: "Team", value: kb.people.filter((p) => p.value?.type === "team").length },
    { label: "Testimonials", value: kb.insights.testimonials.length },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Health gauge */}
      <Card className="flex flex-col items-center p-6 text-center" data-tour="health">
        <SectionLabel>Knowledge Health</SectionLabel>
        <div className="my-5">
          <Gauge value={score} label="out of 100" />
        </div>
        <p className="text-lg font-bold">{health.text}</p>
        <p className="mt-1 text-xs text-muted">{health.note}</p>
        <div className="mt-5 grid w-full grid-cols-4 gap-2 border-t border-border-soft pt-4">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-base font-bold">{s.value}</p>
              <p className="text-[10px] text-subtle">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Next to do */}
      <Card className="p-6 lg:col-span-2">
        <SectionLabel>Next to do</SectionLabel>
        <h3 className="mt-1 font-bold">Boost your Knowledge Health</h3>
        {todos.length === 0 ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-success-soft p-4 text-sm text-success">
            <PartyPopper className="size-5" /> Everything important is filled in. Nice work!
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {todos.map((t, i) => (
              <motion.div key={t.path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}>
                <Card className="flex h-full flex-col justify-between gap-3 p-4 hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{FIELD_LABELS[t.path]?.todo ?? t.path}</p>
                    <Badge tone="green">+{t.weight}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {tierOf(t.path) === 2 && (
                      <Button size="sm" onClick={() => window.dispatchEvent(new Event(ENRICH_EVENT))} disabled={busy} icon={<Sparkles className="size-3.5" />}>
                        Fill with AI
                      </Button>
                    )}
                    {t.path === "company.mainAddress" && kb.company.otherLocations.length > 0 ? (
                      // No head office found, but the site lists locations: pick one, or say there's none
                      <Menu
                        label="Use one of your locations"
                        align="left"
                        items={kb.company.otherLocations.flatMap((f, i) =>
                          f.value ? [{ label: f.value.formatted, icon: <MapPin className="size-3.5" />, onSelect: () => promoteLocation(i) }] : [],
                        )}
                        trigger={(p) => (
                          <button {...p} type="button" disabled={busy} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium hover:border-primary/40">
                            Use one of your locations <ChevronDown className="size-3" />
                          </button>
                        )}
                      />
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => jumpTo(t.path)} icon={<ArrowRight className="size-3.5" />}>
                        {tierOf(t.path) === 3 ? "Add it yourself" : "Add it"}
                      </Button>
                    )}
                    <button type="button" onClick={() => setNotApplicable(t.path, true)} disabled={busy} className="text-xs text-subtle hover:text-ink hover:underline">
                      {t.path === "company.mainAddress" ? "Not applicable (no head office)" : "Not applicable"}
                    </button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </Card>

      {waiting.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-dashed p-4 text-sm lg:col-span-3">
          <Badge tone="purple">Waiting for AI</Badge>
          <span className="text-muted">Your screenshots should fill:</span>
          <span className="font-medium">{waiting.map(fieldName).join(", ")}</span>
        </Card>
      )}

      {/* Content Kit preview */}
      <Card className="p-6 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <SectionLabel>Content Kit preview</SectionLabel>
            <h3 className="mt-1 font-bold">Here&apos;s what Flo can make with your knowledge</h3>
          </div>
          <Badge tone="purple">AI preview · example only</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <PreviewTile icon={<MessageSquare className="size-4" />} label="Social post" text={preview.socialPost} />
          <PreviewTile icon={<Mail className="size-4" />} label="Email subject" text={preview.emailSubject} />
          <PreviewTile icon={<FileText className="size-4" />} label="Blog idea" text={preview.blogIdea} />
        </div>
        <p className="mt-3 text-[11px] text-subtle">These are template examples built from your knowledge, not real AI output. Use Enrich with AI (top right) for real suggestions.</p>
      </Card>
    </div>
  );
}

function PreviewTile({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-page p-4">
      <p className="flex items-center gap-2 text-xs font-semibold text-primary">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-sm">{text}</p>
    </div>
  );
}
