"use client";

/*
  "Menus not read yet": menu PDFs and images the crawl found but couldn't turn into items without AI
  (picture menus, messy text) or couldn't read at all (too large, blocked). Each links to the file so
  the owner can check it, and the "Read menus with AI" button reads the next batch.
*/
import { useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon } from "lucide-react";
import type { MenuSource } from "@/types/knowledge";
import { Badge } from "@/components/ui/Badge";
import { Card, SectionLabel } from "@/components/ui/Card";
import { MENU_STATUS_LABEL, waitingForAi } from "@/lib/utils/offerings";
import { ReadMenusButton } from "./ReadMenusButton";

const SHOWN = 6;

export function PendingMenus({ sources }: { sources: MenuSource[] }) {
  const [all, setAll] = useState(false);
  const pending = sources.filter((s) => s.status !== "read" && s.status !== "read_ai");
  if (!pending.length) return null;
  const waiting = pending.filter(waitingForAi).length;
  const list = all ? pending : pending.slice(0, SHOWN);

  return (
    <Card className="border-dashed p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Menus not read yet</SectionLabel>
          <p className="mt-1 text-sm">
            {waiting > 0
              ? `We found ${waiting} menu${waiting === 1 ? "" : "s"} that ${waiting === 1 ? "is a picture or needs" : "are pictures or need"} sorting. AI can read them for you.`
              : "These menus couldn't be read automatically. Add the items yourself, or upload a screenshot."}
          </p>
        </div>
        <ReadMenusButton waiting={waiting} />
      </div>
      <ul className="mt-4 divide-y divide-border-soft">
        {list.map((s) => (
          <li key={s.url} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            {s.kind === "pdf" ? <FileText className="size-4 shrink-0 text-subtle" /> : <ImageIcon className="size-4 shrink-0 text-subtle" />}
            <span className="min-w-0 flex-1 truncate font-medium">
              {s.group ?? "Menu"}
              {s.label && s.label.toLowerCase() !== "menu" && <span className="font-normal text-muted"> · {s.label}</span>}
            </span>
            <Badge tone={waitingForAi(s) ? "purple" : "amber"}>{MENU_STATUS_LABEL[s.status]}</Badge>
            <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Open <ExternalLink className="size-3" />
            </a>
            {s.note && <p className="w-full pl-7 text-xs text-muted">{s.note}</p>}
          </li>
        ))}
      </ul>
      {pending.length > SHOWN && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-medium text-primary hover:underline">
          {all ? "Show fewer" : `Show all ${pending.length}`}
        </button>
      )}
    </Card>
  );
}
