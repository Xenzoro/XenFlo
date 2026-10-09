"use client";

/** Content Kit (advanced): pillars, hooks, hashtags, subjects, blog ideas and a voice guide. */
import { useState } from "react";
import { Pencil } from "lucide-react";
import type { VoiceGuide } from "@/types/knowledge";
import { useField, useKnowledge } from "@/context/KnowledgeContext";
import { ConfidenceBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionCard } from "@/components/ui/Card";
import { EditableList } from "@/components/ui/EditableList";
import { AddPill } from "@/components/ui/Pill";
import { RecordForm } from "@/components/ui/RecordForm";

export function ContentKitTab() {
  return (
    <div className="space-y-4">
      <Card className="border-dashed p-4 text-xs text-muted">
        The Content Kit is mostly written by Enrich with AI (top right), and you approve every suggestion. Anything you add here is used by Flo right away.
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard title="Content pillars" subtitle="The 3 to 5 topics you post about">
          <EditableList path="contentKit.contentPillars" addLabel="pillar" />
        </SectionCard>
        <SectionCard title="Hashtags" subtitle="Tags you use on social">
          <EditableList path="contentKit.hashtags" addLabel="hashtag" placeholder="#yourbrand" parse={(t) => (t.startsWith("#") ? t : `#${t}`)} />
        </SectionCard>
        <SectionCard title="Social hooks" subtitle="Opening lines that grab attention">
          <EditableList path="contentKit.socialHooks" variant="rows" addLabel="hook" />
        </SectionCard>
        <SectionCard title="Email subject angles" subtitle="Subject lines that get opened">
          <EditableList path="contentKit.emailSubjects" variant="rows" addLabel="subject" />
        </SectionCard>
        <SectionCard title="Blog ideas" subtitle="Posts built from your FAQs and themes" className="md:col-span-2">
          <EditableList path="contentKit.blogIdeas" variant="rows" addLabel="blog idea" />
        </SectionCard>
        <VoiceGuideCard />
      </div>
    </div>
  );
}

const EMPTY_GUIDE: VoiceGuide = { wordsToUse: [], wordsToAvoid: [], dos: [], donts: [] };

const COLUMNS: { key: keyof VoiceGuide; label: string }[] = [
  { key: "wordsToUse", label: "Words to use" },
  { key: "wordsToAvoid", label: "Words to avoid" },
  { key: "dos", label: "Tone do's" },
  { key: "donts", label: "Tone don'ts" },
];

/** The voice guide is one field holding four lists, so it's edited as one small form. */
function VoiceGuideCard() {
  const f = useField<VoiceGuide>("contentKit.voiceGuide");
  const { setField, advanced, busy } = useKnowledge();
  const [editing, setEditing] = useState(false);
  const guide = f?.value;

  return (
    <SectionCard
      title="Voice guide"
      subtitle="How Flo should (and shouldn't) sound"
      className="md:col-span-2"
      action={
        <div className="flex items-center gap-2">
          {advanced && f && <ConfidenceBadge confidence={f.confidence} source={f.source} />}
          {guide && !editing && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(true)} icon={<Pencil className="size-3.5" />}>
              Edit
            </Button>
          )}
        </div>
      }
    >
      <div data-field="contentKit.voiceGuide">
        {editing ? (
          <RecordForm<VoiceGuide>
            fields={COLUMNS.map((c) => ({ key: c.key, label: c.label, kind: "list" }))}
            initial={guide ?? EMPTY_GUIDE}
            onCancel={() => setEditing(false)}
            onSave={(v) => {
              const empty = COLUMNS.every((c) => v[c.key].length === 0);
              setField("contentKit.voiceGuide", empty ? null : v);
              setEditing(false);
            }}
          />
        ) : guide ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {COLUMNS.map((c) => (
              <div key={c.key}>
                <p className="mb-1.5 text-xs text-muted">{c.label}</p>
                <ul className="space-y-1 text-sm">
                  {guide[c.key].length ? guide[c.key].map((w) => <li key={w}>{w}</li>) : <li className="text-subtle">None yet</li>}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <AddPill label="voice guide" onClick={() => setEditing(true)} disabled={busy} />
        )}
      </div>
    </SectionCard>
  );
}
