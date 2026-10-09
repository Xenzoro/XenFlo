"use client";

/*
  Overview: a mini dashboard.
  - Knowledge Health gauge (the completeness score), styled like MoFlo's Brand Power
  - "Next to do" cards: the highest-value missing fields, each jumping to where you fill it in
  - Content Kit preview: mock examples of what Flo could write, clearly labeled
*/
import { motion } from "framer-motion";
import { ArrowRight, FileText, Mail, MessageSquare, PartyPopper } from "lucide-react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { SCORE_CHECKS } from "@/lib/scraper/score";
import { mockContentPreview } from "@/lib/ai/mockPreview";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionLabel } from "@/components/ui/Card";
import { Gauge } from "@/components/ui/Gauge";
import { FIELD_LABELS } from "../fieldLabels";

function healthLabel(score: number) {
  if (score >= 80) return { text: "Great", note: "Flo has plenty to work with." };
  if (score >= 50) return { text: "Good", note: "A few more details will make your content sharper." };
  return { text: "Needs work", note: "Add the basics below so Flo can sound like you." };
}

export function OverviewTab() {
  const { kb, jumpTo } = useKnowledge();
  if (!kb) return null;

  const { score, missing } = kb.completeness;
  const health = healthLabel(score);
  // Biggest point gains first
  const todos = SCORE_CHECKS.filter((c) => missing.includes(c.path))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  const preview = mockContentPreview(kb);

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
                  <Button variant="secondary" size="sm" className="self-start" onClick={() => jumpTo(t.path)} icon={<ArrowRight className="size-3.5" />}>
                    Add it
                  </Button>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </Card>

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
        <p className="mt-3 text-[11px] text-subtle">These are template examples built from your knowledge, not real AI output. Live AI writing arrives with enrichment.</p>
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
