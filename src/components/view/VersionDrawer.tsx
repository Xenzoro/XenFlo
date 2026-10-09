"use client";

/*
  Version history for one record. Each save is a version; "View" shows a quick summary
  of that snapshot, "Restore" saves it again as the newest version (history is never rewritten).
*/
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { KnowledgeBase } from "@/types/knowledge";
import type { KnowledgeSummary, VersionSummary } from "@/lib/db/types";
import { getVersion, listVersions, type ApiError } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/messages";
import { formatDateTime } from "@/lib/utils/time";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ConfirmModal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";

export function VersionDrawer({
  record,
  onClose,
  onRestore,
}: {
  record: KnowledgeSummary | null;
  onClose: () => void;
  /** Restores and resolves to the new current KB (or null on failure) */
  onRestore: (id: string, version: number, currentVersion: number) => Promise<KnowledgeBase | null>;
}) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [previews, setPreviews] = useState<Record<number, KnowledgeBase>>({});
  const [confirm, setConfirm] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async (id: string) => {
    setVersions(null);
    setError(null);
    const res = await listVersions(id);
    if (res.error) setError(res.error);
    else setVersions(res.data);
  }, []);

  useEffect(() => {
    if (!record) return;
    setOpen(null);
    setPreviews({});
    load(record.id);
  }, [record, load]);

  async function toggle(v: number) {
    if (!record) return;
    setOpen((cur) => (cur === v ? null : v));
    if (previews[v]) return;
    const res = await getVersion(record.id, v);
    if (res.data) setPreviews((p) => ({ ...p, [v]: res.data! }));
  }

  async function restore() {
    if (!record || confirm === null || !versions) return;
    setRestoring(true);
    const result = await onRestore(record.id, confirm, versions[0].version);
    setRestoring(false);
    setConfirm(null);
    if (result) load(record.id);
  }

  const current = versions?.[0]?.version;

  return (
    <>
      <Drawer open={!!record} onClose={onClose} label="Version history" title={record?.companyName ?? ""}>
        {error && <p className="text-sm text-danger">{friendlyError(error.code).title}</p>}
        {!versions && !error && (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        )}
        {versions && (
          <ol className="relative space-y-3 border-l-2 border-border-soft pl-5">
            {versions.map((v, i) => (
              <motion.li key={v.version} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.04 } }} className="relative">
                {/* timeline dot */}
                <span className={`absolute -left-[27px] top-4 size-3 rounded-full border-2 border-card ${v.version === current ? "bg-primary" : "bg-border"}`} />
                <div className="rounded-2xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        Version {v.version}
                        {v.version === current && <Badge tone="blue">Current</Badge>}
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(v.createdAt)}</p>
                      {v.note && <p className="mt-1 text-xs">{v.note}</p>}
                    </div>
                    <Badge tone={v.completeness >= 80 ? "green" : v.completeness >= 50 ? "blue" : "amber"}>Health {v.completeness}</Badge>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => toggle(v.version)} icon={<ChevronDown className={`size-3.5 transition-transform ${open === v.version ? "rotate-180" : ""}`} />}>
                      {open === v.version ? "Hide" : "View"}
                    </Button>
                    {v.version !== current && (
                      <Button size="sm" variant="secondary" onClick={() => setConfirm(v.version)} icon={<RotateCcw className="size-3.5" />}>
                        Restore
                      </Button>
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {open === v.version && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <VersionPreview kb={previews[v.version]} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.li>
            ))}
          </ol>
        )}
      </Drawer>

      <ConfirmModal
        open={confirm !== null}
        title={`Restore version ${confirm}?`}
        text={`Its content will be saved as a new version ${current ? current + 1 : ""}. Your current version stays in the history, so nothing is lost.`}
        confirmLabel="Restore"
        busy={restoring}
        onConfirm={restore}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

/** Quick facts about a snapshot, with the raw JSON one click away. */
function VersionPreview({ kb }: { kb: KnowledgeBase | undefined }) {
  const [json, setJson] = useState(false);
  if (!kb) return <Skeleton className="mt-3 h-20" />;
  const facts = [
    ["Name", kb.companyName],
    ["Industry", kb.company.industry.value ?? "—"],
    ["Pages crawled", kb.crawl.pages.length],
    ["Offerings", kb.offerings.length],
    ["Team", kb.people.filter((p) => p.value?.type === "team").length],
    ["Testimonials", kb.insights.testimonials.length],
  ];
  return (
    <div className="mt-3 rounded-xl bg-page p-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {facts.map(([k, v]) => (
          <div key={k as string} className="min-w-0">
            <dt className="text-subtle">{k}</dt>
            <dd className="truncate font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={() => setJson(!json)} className="mt-3 text-xs font-medium text-primary hover:underline">
        {json ? "Hide JSON" : "Show JSON"}
      </button>
      {json && <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-ink p-3 text-[10px] leading-4 text-gray-100">{JSON.stringify(kb, null, 2)}</pre>}
    </div>
  );
}
