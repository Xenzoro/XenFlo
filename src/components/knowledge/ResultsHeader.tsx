"use client";

/** Bar above the tabs: company name, live score, Advanced view toggle and Save button. */
import { Save } from "lucide-react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";

export function ResultsHeader({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  const { kb, dirty, saved, advanced, setAdvanced, busy } = useKnowledge();
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
        <Toggle checked={advanced} onChange={setAdvanced} label="Advanced view" />
        <span data-tour="save">
          <Button onClick={onSave} loading={saving} disabled={busy || (!dirty && !!saved)} icon={<Save className="size-4" />}>
            {saved && !dirty ? "Saved" : "Save"}
          </Button>
        </span>
      </div>
    </Card>
  );
}
