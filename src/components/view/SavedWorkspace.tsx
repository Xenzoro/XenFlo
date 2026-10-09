"use client";

/*
  /knowledge/view: every saved knowledge base, as cards, a table, or one at a time (Detailed).
  The whole view lives in the URL query (see src/lib/view/filters.ts), so any view can be
  shared or bookmarked. Actions live in useRecordActions; the list in useSavedList.
*/
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Library, Plus, SearchX } from "lucide-react";
import type { KnowledgeSummary } from "@/lib/db/types";
import { useNavGuard } from "@/context/NavGuardContext";
import { friendlyError } from "@/lib/api/messages";
import { parseView, toQuery, type ViewState } from "@/lib/view/filters";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, SectionLabel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmModal } from "@/components/ui/Modal";
import { Toast, type ToastData } from "@/components/ui/Toast";
import { FooterNote } from "@/components/knowledge/FooterNote";
import { BulkBar } from "./BulkBar";
import { DetailedView } from "./DetailedView";
import { KnowledgeCard } from "./KnowledgeCard";
import { KnowledgeTable } from "./KnowledgeTable";
import { ListSkeleton } from "./ListSkeleton";
import type { RecordHandlers } from "./RecordMenu";
import { ViewToolbar } from "./ViewToolbar";
import { VersionDrawer } from "./VersionDrawer";
import { useRecordActions } from "./useRecordActions";
import { useSavedList } from "./useSavedList";

export function SavedWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = useMemo(() => parseView(params), [params]);
  const { confirmLeave } = useNavGuard();

  const [reloadKey, setReloadKey] = useState(0);
  // Bumped only when the open Detailed record changed elsewhere (restore, re-scrape)
  const [detailToken, setDetailToken] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const { items, error, loading, industries, allTotal } = useSavedList(view, reloadKey);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastData | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const [toDelete, setToDelete] = useState<KnowledgeSummary[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toRescrape, setToRescrape] = useState<KnowledgeSummary | null>(null);
  const [historyFor, setHistoryFor] = useState<KnowledgeSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const actions = useRecordActions({ reload, toast: setToast });

  const detailId = view.mode === "detailed" ? view.id || items?.[0]?.id || "" : "";

  /** Change the view by rewriting the URL. Asks first if the Detailed editor has unsaved changes. */
  const setView = useCallback(
    (patch: Partial<ViewState>) => {
      const next = { ...view, ...patch };
      const leavingRecord = view.mode === "detailed" && (next.mode !== "detailed" || (patch.id !== undefined && patch.id !== detailId));
      if (leavingRecord && !confirmLeave()) return;
      router.replace(`${pathname}${toQuery(next)}`, { scroll: false });
    },
    [view, detailId, confirmLeave, router, pathname],
  );

  // Selections only make sense for records currently shown
  const visibleSelected = useMemo(() => (items ?? []).filter((i) => selected.has(i.id)), [items, selected]);

  const handlers: RecordHandlers = {
    onOpen: (s) => confirmLeave() && router.push(`/knowledge?id=${s.id}`),
    onDetails: (s) => setView({ mode: "detailed", id: s.id }),
    onHistory: setHistoryFor,
    onDuplicate: actions.duplicate,
    onRescrape: setToRescrape,
    onExport: (s) => actions.exportJson([s]),
    onDelete: (s) => setToDelete([s]),
  };

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const done = await actions.remove(toDelete);
    setDeleting(false);
    setToDelete(null);
    setSelected((prev) => new Set([...prev].filter((id) => !done.includes(id))));
    if (done.includes(detailId)) setView({ id: "" });
  }

  async function confirmRescrape() {
    const target = toRescrape;
    setToRescrape(null);
    if (!target) return;
    await actions.rescrape(target);
    if (target.id === detailId) setDetailToken((t) => t + 1);
  }

  async function bulkExport() {
    setExporting(true);
    await actions.exportJson(visibleSelected);
    setExporting(false);
  }

  const select = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const selectAll = (on: boolean) => setSelected(on ? new Set((items ?? []).map((i) => i.id)) : new Set());

  const nothingSaved = allTotal === 0;
  const noMatches = !nothingSaved && items?.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <SectionLabel>Saved</SectionLabel>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Your knowledge bases</h1>
          <p className="mt-1 text-sm text-muted">
            {items ? `${items.length} ${items.length === 1 ? "record" : "records"}${allTotal !== null && items.length !== allTotal ? ` of ${allTotal}` : ""}` : "Loading…"}
          </p>
        </div>
        <Link href="/knowledge" onClick={(e) => !confirmLeave() && e.preventDefault()} className={buttonClass()}>
          <Plus className="size-4" /> New knowledge base
        </Link>
      </div>

      {!nothingSaved && <ViewToolbar view={view} setView={setView} industries={industries} />}

      {view.mode !== "detailed" && (
        <BulkBar
          count={visibleSelected.length}
          total={items?.length ?? 0}
          onSelectAll={() => selectAll(true)}
          onExport={bulkExport}
          onDelete={() => setToDelete(visibleSelected)}
          onClear={() => selectAll(false)}
          exporting={exporting}
        />
      )}

      {error ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertTriangle className="size-8 text-danger" />
          <div>
            <p className="font-semibold">{friendlyError(error.code).title}</p>
            <p className="mt-1 text-sm text-muted">{friendlyError(error.code).text}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={reload}>
            Try again
          </Button>
        </Card>
      ) : !items || (loading && items.length === 0 && !noMatches) ? (
        <ListSkeleton mode={view.mode} />
      ) : nothingSaved ? (
        <Card className="p-6">
          <EmptyState
            icon={<Library className="size-10" />}
            title="No saved knowledge bases yet"
            text="Scrape your website on the Knowledge page, review what Flo found, and save it. It will show up here."
            action={
              <Link href="/knowledge" className={buttonClass()}>
                <Plus className="size-4" /> Build your first knowledge base
              </Link>
            }
          />
        </Card>
      ) : noMatches ? (
        <Card className="p-6">
          <EmptyState
            icon={<SearchX className="size-10" />}
            title="No knowledge bases match"
            text="Try a different search or clear the filters."
            action={
              <Button variant="secondary" size="sm" onClick={() => setView({ q: "", industry: "", score: "all", date: "any" })}>
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : view.mode === "card" ? (
        <div className={`grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
          <AnimatePresence mode="popLayout">
            {items.map((r, i) => (
              <KnowledgeCard
                key={r.id}
                record={r}
                index={i}
                selected={selected.has(r.id)}
                onSelect={(on) => select(r.id, on)}
                busy={actions.busyIds.has(r.id)}
                handlers={handlers}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : view.mode === "table" ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: loading ? 0.6 : 1 }}>
          <KnowledgeTable
            items={items}
            selected={selected}
            onSelect={select}
            onSelectAll={selectAll}
            sort={view.sort}
            onSort={(sort) => setView({ sort })}
            busyIds={actions.busyIds}
            handlers={handlers}
          />
        </motion.div>
      ) : (
        detailId && (
          <DetailedView
            id={detailId}
            items={items}
            reloadToken={detailToken}
            onPick={(id) => setView({ id })}
            onOpenEditor={(id) => confirmLeave() && router.push(`/knowledge?id=${id}`)}
            onSaved={reload}
          />
        )
      )}

      <FooterNote />

      <ConfirmModal
        open={!!toDelete}
        danger
        title={toDelete && toDelete.length > 1 ? `Delete ${toDelete.length} knowledge bases?` : `Delete ${toDelete?.[0]?.companyName ?? ""}?`}
        text={
          <>
            {toDelete && toDelete.length > 1 && <span className="mb-2 block font-medium text-ink">{toDelete.map((d) => d.companyName).join(", ")}</span>}
            This removes {toDelete && toDelete.length > 1 ? "them" : "it"} and all saved versions. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />

      <ConfirmModal
        open={!!toRescrape}
        title={`Re-scrape ${toRescrape?.companyName ?? ""}?`}
        text="We'll read the website again and save the result as a new version. Anything you edited by hand is kept, and the current version stays in the history."
        confirmLabel="Re-scrape"
        onConfirm={confirmRescrape}
        onClose={() => setToRescrape(null)}
      />

      <VersionDrawer
        record={historyFor}
        onClose={() => setHistoryFor(null)}
        onRestore={async (id, version, current) => {
          const kb = await actions.restore(id, version, current);
          if (kb && id === detailId) setDetailToken((t) => t + 1);
          return kb;
        }}
      />

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
