"use client";

/** Raw JSON (advanced): the exact knowledge base object, with copy and download. */
import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Card";

export function RawJsonTab() {
  const { kb } = useKnowledge();
  const [copied, setCopied] = useState(false);
  if (!kb) return null;
  const json = JSON.stringify(kb, null, 2);

  async function copy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${new URL(kb!.url).hostname.replace(/^www\./, "")}-knowledge.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <SectionCard
      title="Raw JSON"
      subtitle={`${(json.length / 1024).toFixed(1)} KB · the exact data that gets saved`}
      action={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={copy} icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="secondary" size="sm" onClick={download} icon={<Download className="size-3.5" />}>
            Download
          </Button>
        </div>
      }
    >
      <pre className="max-h-[70vh] overflow-auto rounded-xl bg-ink p-4 text-[11px] leading-5 text-gray-100">{json}</pre>
    </SectionCard>
  );
}
