"use client";

/*
  Holds the knowledge base being edited on /knowledge and every action that changes it.
  Components read fields by dot path ("company.yearFounded") and write through
  setField / addItem / updateItem / removeItem, which:
    1. stamp the value as user_edited (source "user", fresh updatedAt)
    2. recompute the completeness score so the Health gauge updates live
    3. mark the page dirty (unsaved changes)
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Field, KnowledgeBase } from "@/types/knowledge";
import { scoreCompleteness } from "@/lib/scraper/score";
import { field, missing } from "@/lib/utils/knowledge";
import { getAt, setAt } from "@/lib/utils/path";
import { useNavGuard } from "./NavGuardContext";

export type TabKey =
  | "overview"
  | "company"
  | "customers"
  | "brand"
  | "people"
  | "offerings"
  | "insights"
  | "contentKit"
  | "sources"
  | "json";

export const ADVANCED_TABS: TabKey[] = ["insights", "contentKit", "sources", "json"];

interface KnowledgeState {
  kb: KnowledgeBase | null;
  /** Replace the whole KB (after a scrape or dig deeper). `dirty` defaults to true: it isn't saved yet. */
  loadKb: (kb: KnowledgeBase | null, opts?: { dirty?: boolean }) => void;
  /** Supabase id and version once saved; null before the first save */
  saved: { id: string; version: number } | null;
  markSaved: (kb: KnowledgeBase) => void;
  dirty: boolean;
  advanced: boolean;
  setAdvanced: (on: boolean) => void;
  tab: TabKey;
  setTab: (tab: TabKey) => void;
  /** True while a save or dig deeper is running; editing is paused */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setField: (path: string, value: unknown) => void;
  addItem: (path: string, value: unknown) => void;
  updateItem: (path: string, index: number, value: unknown) => void;
  removeItem: (path: string, index: number) => void;
  /** Open the tab that holds `path`, scroll to it and flash it */
  jumpTo: (path: string) => void;
}

const KnowledgeContext = createContext<KnowledgeState | null>(null);

/** A value counts as empty when it's null, blank text, or NaN. */
function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && !value.trim()) || Number.isNaN(value);
}

/** Wrap a value the user typed. Clearing a field marks it missing again. */
function userField(value: unknown): Field<unknown> {
  return isEmpty(value) ? missing() : field(value, "user", "user_edited");
}

/** After any edit: rescore and keep the top-level companyName in sync. */
function finalize(kb: KnowledgeBase): KnowledgeBase {
  const companyName = kb.company.name.value ?? kb.companyName;
  return { ...kb, companyName, completeness: scoreCompleteness(kb), updatedAt: new Date().toISOString() };
}

/** Which tab shows a given field path (used by "Next to do" jump buttons). */
export function tabForPath(path: string): TabKey {
  const root = path.split(".")[0];
  if (root === "company" || root === "contact") return "company";
  if (root === "customers" || root === "brand" || root === "people" || root === "offerings" || root === "insights") return root;
  if (root === "contentKit") return "contentKit";
  return "overview";
}

/**
 * `initial` starts the provider with an already-saved knowledge base (the Detailed view
 * on /knowledge/view), so it begins in the "saved, no changes" state.
 */
export function KnowledgeProvider({ children, initial }: { children: React.ReactNode; initial?: KnowledgeBase }) {
  const [kb, setKb] = useState<KnowledgeBase | null>(initial ?? null);
  const [saved, setSaved] = useState<KnowledgeState["saved"]>(initial ? { id: initial.id, version: initial.version } : null);
  const [dirty, setDirty] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const [busy, setBusy] = useState(false);
  const { setBlocked } = useNavGuard();

  // Tell the app shell to warn before leaving while there are unsaved changes
  // (and stop warning once this page unmounts).
  useEffect(() => {
    setBlocked(dirty);
    return () => setBlocked(false);
  }, [dirty, setBlocked]);

  const loadKb = useCallback((next: KnowledgeBase | null, opts?: { dirty?: boolean }) => {
    setKb(next);
    setDirty(next ? (opts?.dirty ?? true) : false);
  }, []);

  const markSaved = useCallback((next: KnowledgeBase) => {
    setKb(next);
    setSaved({ id: next.id, version: next.version });
    setDirty(false);
  }, []);

  // All edits go through here: apply the change, rescore, mark dirty.
  const edit = useCallback((change: (kb: KnowledgeBase) => KnowledgeBase) => {
    setKb((prev) => (prev ? finalize(change(prev)) : prev));
    setDirty(true);
  }, []);

  const setFieldValue = useCallback((path: string, value: unknown) => edit((k) => setAt(k, path, userField(value))), [edit]);

  const addItem = useCallback(
    (path: string, value: unknown) => {
      if (isEmpty(value)) return;
      edit((k) => setAt(k, path, [...((getAt(k, path) as unknown[]) ?? []), field(value, "user", "user_edited")]));
    },
    [edit],
  );

  const updateItem = useCallback(
    (path: string, index: number, value: unknown) => {
      // Clearing a list item removes it instead of leaving an empty entry
      edit((k) => {
        const list = [...((getAt(k, path) as unknown[]) ?? [])];
        if (isEmpty(value)) list.splice(index, 1);
        else list[index] = field(value, "user", "user_edited");
        return setAt(k, path, list);
      });
    },
    [edit],
  );

  const removeItem = useCallback(
    (path: string, index: number) => edit((k) => setAt(k, path, ((getAt(k, path) as unknown[]) ?? []).filter((_, i) => i !== index))),
    [edit],
  );

  const jumpTo = useCallback((path: string) => {
    const target = tabForPath(path);
    if (ADVANCED_TABS.includes(target)) setAdvanced(true);
    setTab(target);
    // Wait for the tab to render, then scroll and flash the field (see .flash in globals.css)
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${path}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("flash");
      void el.offsetWidth; // restart the animation if it's already applied
      el.classList.add("flash");
    }, 350);
  }, []);

  const value = useMemo<KnowledgeState>(
    () => ({
      kb,
      loadKb,
      saved,
      markSaved,
      dirty,
      advanced,
      setAdvanced,
      tab,
      setTab,
      busy,
      setBusy,
      setField: setFieldValue,
      addItem,
      updateItem,
      removeItem,
      jumpTo,
    }),
    [kb, loadKb, saved, markSaved, dirty, advanced, tab, busy, setFieldValue, addItem, updateItem, removeItem, jumpTo],
  );

  return <KnowledgeContext.Provider value={value}>{children}</KnowledgeContext.Provider>;
}

export function useKnowledge(): KnowledgeState {
  const ctx = useContext(KnowledgeContext);
  if (!ctx) throw new Error("useKnowledge must be used inside KnowledgeProvider");
  return ctx;
}

/** Read one field from the current KB by path. */
export function useField<T>(path: string): Field<T> | undefined {
  const { kb } = useKnowledge();
  return kb ? (getAt(kb, path) as Field<T> | undefined) : undefined;
}

/** Read one list from the current KB by path. */
export function useList<T>(path: string): Field<T>[] {
  const { kb } = useKnowledge();
  return kb ? ((getAt(kb, path) as Field<T>[] | undefined) ?? []) : [];
}
