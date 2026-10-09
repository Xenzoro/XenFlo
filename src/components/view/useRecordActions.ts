"use client";

/*
  Everything you can do to saved records from the Saved page: duplicate, re-scrape,
  export, delete and restore a version. Each reports back through a toast and asks
  the page to reload its list. `busyIds` lets cards and rows show a spinner.
*/
import { useState } from "react";
import type { KnowledgeBase } from "@/types/knowledge";
import type { KnowledgeSummary } from "@/lib/db/types";
import { deleteKnowledge, getKnowledge, getVersion, saveKnowledge, scrapeUrl } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/messages";
import { field } from "@/lib/utils/knowledge";
import { downloadJson, hostOf } from "@/lib/utils/download";
import { keepUserEdits } from "@/lib/utils/overlay";
import type { ToastData } from "@/components/ui/Toast";

export function useRecordActions({ reload, toast }: { reload: () => void; toast: (t: ToastData) => void }) {
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const setBusy = (id: string, on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const fail = (code: string) => {
    const f = friendlyError(code);
    toast({ tone: "error", title: f.title, text: f.text });
  };

  /** Save a copy as a brand-new record named "X (copy)". */
  async function duplicate(s: KnowledgeSummary) {
    setBusy(s.id, true);
    const res = await getKnowledge(s.id);
    if (res.error) {
      setBusy(s.id, false);
      return fail(res.error.code);
    }
    const name = `${s.companyName} (copy)`;
    const copy: KnowledgeBase = { ...res.data, companyName: name, company: { ...res.data.company, name: field(name, "user", "user_edited") } };
    const saved = await saveKnowledge(copy, null, `Duplicated from ${s.companyName}`);
    setBusy(s.id, false);
    if (saved.error) return fail(saved.error.code);
    toast({ tone: "success", title: `Created ${name}`, link: { href: `/knowledge/view?mode=detailed&id=${saved.data.id}`, label: "Open the copy →" } });
    reload();
  }

  /** Fresh crawl of the same site, keeping the owner's edits, saved as the next version. */
  async function rescrape(s: KnowledgeSummary) {
    setBusy(s.id, true);
    const prev = await getKnowledge(s.id);
    if (prev.error) {
      setBusy(s.id, false);
      return fail(prev.error.code);
    }
    const fresh = await scrapeUrl(prev.data.url);
    if (fresh.error) {
      setBusy(s.id, false);
      return fail(fresh.error.code);
    }
    const merged = keepUserEdits(fresh.data, prev.data);
    const saved = await saveKnowledge(merged, { id: s.id, version: prev.data.version }, "Re-scraped");
    setBusy(s.id, false);
    if (saved.error) return fail(saved.error.code);
    toast({
      tone: "success",
      title: `Re-scraped ${saved.data.companyName}`,
      text: `Knowledge Health ${prev.data.completeness.score} → ${saved.data.completeness.score} · now version ${saved.data.version}`,
    });
    reload();
  }

  /** Download one record, or several as one file. */
  async function exportJson(list: KnowledgeSummary[]) {
    list.forEach((s) => setBusy(s.id, true));
    const results = await Promise.all(list.map((s) => getKnowledge(s.id)));
    list.forEach((s) => setBusy(s.id, false));
    const failed = results.find((r) => r.error);
    if (failed?.error) return fail(failed.error.code);
    const kbs = results.map((r) => r.data!);
    if (kbs.length === 1) {
      downloadJson(`${hostOf(kbs[0].url)}-knowledge-v${kbs[0].version}`, kbs[0]);
    } else {
      const day = new Date().toISOString().slice(0, 10);
      downloadJson(`knowledge-export-${day}`, { exportedAt: new Date().toISOString(), count: kbs.length, knowledgeBases: kbs });
    }
    toast({ tone: "success", title: kbs.length === 1 ? "Exported JSON" : `Exported ${kbs.length} knowledge bases` });
  }

  /** Delete one or more; returns the ids that were actually deleted. */
  async function remove(list: KnowledgeSummary[]): Promise<string[]> {
    const done: string[] = [];
    let lastError: string | null = null;
    // One at a time keeps it simple and makes partial failures easy to report
    for (const s of list) {
      const res = await deleteKnowledge(s.id);
      if (res.error) lastError = res.error.code;
      else done.push(s.id);
    }
    if (lastError) {
      const f = friendlyError(lastError);
      toast({ tone: "error", title: `Deleted ${done.length} of ${list.length}`, text: f.text });
    } else {
      toast({ tone: "success", title: list.length === 1 ? `Deleted ${list[0].companyName}` : `Deleted ${done.length} knowledge bases` });
    }
    reload();
    return done;
  }

  /** Save an old version's snapshot as the newest version. */
  async function restore(id: string, version: number, currentVersion: number): Promise<KnowledgeBase | null> {
    const snap = await getVersion(id, version);
    if (snap.error) {
      fail(snap.error.code);
      return null;
    }
    const saved = await saveKnowledge(snap.data, { id, version: currentVersion }, `Restored from version ${version}`);
    if (saved.error) {
      fail(saved.error.code);
      return null;
    }
    toast({ tone: "success", title: `Restored version ${version}`, text: `Saved as version ${saved.data.version}. Nothing was deleted.` });
    reload();
    return saved.data;
  }

  return { busyIds, duplicate, rescrape, exportJson, remove, restore };
}
