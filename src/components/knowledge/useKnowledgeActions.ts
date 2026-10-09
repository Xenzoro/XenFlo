"use client";

/*
  Save and Dig deeper for whatever knowledge base is in KnowledgeContext, plus the toast
  that reports how they went. Shared by /knowledge and the Detailed view on /knowledge/view.
*/
import { useCallback, useState } from "react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { digDeeper, saveKnowledge } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/messages";
import type { ToastData } from "@/components/ui/Toast";
import type { KnowledgeBase } from "@/types/knowledge";

export function useKnowledgeActions(opts: { linkToSaved?: boolean; onSaved?: (kb: KnowledgeBase) => void } = {}) {
  const { kb, saved, loadKb, markSaved, setBusy } = useKnowledge();
  const [saving, setSaving] = useState(false);
  const [digging, setDigging] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  const showError = (code: string) => {
    const f = friendlyError(code);
    setToast({ tone: "error", title: f.title, text: f.text });
  };

  async function save() {
    if (!kb) return;
    setSaving(true);
    setBusy(true); // pause editing while the request runs
    const res = await saveKnowledge(kb, saved);
    setSaving(false);
    setBusy(false);
    if (res.error) return showError(res.error.code);
    markSaved(res.data);
    opts.onSaved?.(res.data);
    setToast({
      tone: "success",
      title: `Saved ${res.data.companyName} (version ${res.data.version})`,
      text: "Your knowledge base is stored and ready for Flo.",
      link: opts.linkToSaved ? { href: `/knowledge/view?mode=detailed&id=${res.data.id}`, label: "View saved knowledge base →" } : undefined,
    });
  }

  async function dig() {
    if (!kb) return;
    setDigging(true);
    setBusy(true); // pause editing so nothing typed during the crawl gets overwritten
    const before = { pages: kb.crawl.pages.length, score: kb.completeness.score };
    const res = await digDeeper(kb);
    setDigging(false);
    setBusy(false);
    if (res.error) return showError(res.error.code);
    loadKb(res.data); // unsaved until the user saves
    const added = res.data.crawl.pages.length - before.pages;
    setToast({
      tone: "success",
      title: added ? `Read ${added} more ${added === 1 ? "page" : "pages"}` : "No new pages to read",
      text: `Knowledge Health ${before.score} → ${res.data.completeness.score}`,
    });
  }

  return { save, dig, saving, digging, toast, setToast, closeToast };
}
