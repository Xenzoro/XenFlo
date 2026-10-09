"use client";

/** Bar above the tabs: company name, live score, Advanced view toggle, Enrich with AI and Save. */
import { useEffect, useState } from "react";
import { Save, Sparkles } from "lucide-react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { ENRICH_EVENT, EnrichModal } from "./ai/EnrichModal";

export function ResultsHeader({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  const { kb, dirty, saved, advanced, setAdvanced, busy } = useKnowledge();
  const [enriching, setEnriching] = useState(false);
  // "Fill with AI" on a Next to do card opens the same modal
  useEffect(() => {
    const open = () => setEnriching(true);
    window.addEventListener(ENRICH_EVENT, open);
    return () => window.removeEventListener(ENRICH_EVENT, open);
  }, []);
  if (!kb) return null;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-bold">{kb.companyName || "Your business"}</h1>
          <Badge tone={kb.completeness.score >= 80 ? "green" : kb.completeness.score >= 50 ? "blue" : "amber"}>Health {kb.completeness.score}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {saved ? `Saved · version ${saved.version}` : "Not saved yet"}
          {dirty && saved && " · unsaved changes"}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <span data-tour="advanced" className="rounded-full">
          <Toggle checked={advanced} onChange={setAdvanced} label="Advanced view" />
        </span>
        {/* Only ever runs from this button: enrichment costs money, so never automatically */}
        <Button variant="secondary" onClick={() => setEnriching(true)} disabled={busy} icon={<Sparkles className="size-4" />}>
          <span className="hidden sm:inline">Enrich with AI</span>
          <span className="sm:hidden">AI</span>
        </Button>
        <span data-tour="save" className="rounded-full">
          <Button onClick={onSave} loading={saving} disabled={busy || (!dirty && !!saved)} icon={<Save className="size-4" />}>
            {saved && !dirty ? "Saved" : "Save"}
          </Button>
        </span>
      </div>
      <EnrichModal open={enriching} onClose={() => setEnriching(false)} />
    </Card>
  );
}
