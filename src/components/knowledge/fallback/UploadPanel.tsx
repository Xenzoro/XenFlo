"use client";

/*
  The upload fallback: paste text, upload a .txt/.html file, or upload screenshots.
  Text and files go through POST /api/extract (the same extractors as a scrape);
  screenshots are stored privately and wait for vision AI.

  The parent owns the consent checkbox (`consented`), so one box can cover both this
  panel and "Continue scraping" on the blocked screen. Every action stays disabled until it's ticked.
*/
import { useEffect, useRef, useState } from "react";
import { FileText, ImagePlus, Upload, X } from "lucide-react";
import type { KnowledgeBase } from "@/types/knowledge";
import { extractContent, uploadScreenshot } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/messages";
import { emptyKnowledgeBase } from "@/lib/utils/knowledge";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { SCREENSHOT_KINDS, fieldsFor, type ScreenshotKind } from "./screenshotKinds";

type Mode = "paste" | "file" | "screenshots";
const MAX_TEXT = 200_000;
const MAX_FILE_BYTES = 200 * 1024;

export interface UploadResult {
  knowledgeBase: KnowledgeBase;
  /** Short message for the toast */
  message: string;
}

export function UploadPanel({
  consented,
  url,
  base,
  onResult,
}: {
  consented: boolean;
  /** Site the content belongs to (new knowledge base) */
  url?: string;
  /** Add into this knowledge base instead ("Add info yourself") */
  base?: KnowledgeBase;
  onResult: (result: UploadResult) => void;
}) {
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [shots, setShots] = useState<{ file: File; preview: string; kind: ScreenshotKind }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const shotInput = useRef<HTMLInputElement>(null);

  // Free preview URLs when screenshots are removed or the panel closes
  const previews = useRef<string[]>([]);
  useEffect(() => {
    previews.current = shots.map((s) => s.preview);
  }, [shots]);
  useEffect(() => () => previews.current.forEach((p) => URL.revokeObjectURL(p)), []);

  const fail = (code: string, message?: string) => setError(message ?? `${friendlyError(code).title}. ${friendlyError(code).text}`);

  async function submitText(kind: "text" | "html", content: string, name: string, method: "checkbox_paste" | "checkbox_upload") {
    setBusy(true);
    setError(null);
    const res = await extractContent({ kind, content, name, url: base ? undefined : url, knowledgeBase: base, method });
    setBusy(false);
    if (res.error) return fail(res.error.code);
    const before = base?.completeness.score ?? 0;
    onResult({ knowledgeBase: res.data, message: `Read ${name}. Knowledge Health ${before} → ${res.data.completeness.score}` });
  }

  async function submitFile() {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return fail("TOO_LARGE", "That file is over 200 KB. Try pasting the important parts instead.");
    const isHtml = /\.html?$/i.test(file.name) || file.type === "text/html";
    await submitText(isHtml ? "html" : "text", await file.text(), file.name, "checkbox_upload");
  }

  async function submitShots() {
    setBusy(true);
    setError(null);
    const kb: KnowledgeBase = structuredClone(base ?? emptyKnowledgeBase(url || "https://uploaded.content/"));
    let aiAvailable = false;
    for (const shot of shots) {
      const res = await uploadScreenshot(shot.file, fieldsFor(shot.kind));
      if (res.error) {
        setBusy(false);
        return fail(res.error.code);
      }
      aiAvailable = res.data.aiAvailable;
      kb.uploads = [...(kb.uploads ?? []), res.data.upload];
      kb.crawl.log.push({ at: new Date().toISOString(), level: "info", message: `Stored screenshot ${res.data.upload.name}` });
    }
    kb.consent = { confirmed: true, timestamp: new Date().toISOString(), method: "checkbox_upload" };
    if (!base) kb.crawl.finishedAt = kb.crawl.startedAt;
    setBusy(false);
    setShots([]);
    onResult({
      knowledgeBase: kb,
      message: aiAvailable
        ? `Stored ${shots.length} screenshot${shots.length === 1 ? "" : "s"}. Use Enrich with AI to have Flo read them.`
        : `Stored ${shots.length} screenshot${shots.length === 1 ? "" : "s"}. Flo can't read screenshots yet because AI isn't set up, so paste the text instead.`,
    });
  }

  function addShots(list: FileList | null) {
    const images = Array.from(list ?? []).filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
    if (list && images.length < list.length) fail("UNSUPPORTED_FILE");
    setShots((prev) => [...prev, ...images.map((f) => ({ file: f, preview: URL.createObjectURL(f), kind: "other" as ScreenshotKind }))].slice(0, 10));
  }

  const locked = !consented || busy;

  return (
    <div className="space-y-4">
      <Tabs
        label="How to add content"
        layoutId="upload-tab-pill"
        active={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        items={[
          { key: "paste", label: "Paste text" },
          { key: "file", label: "Upload file" },
          { key: "screenshots", label: "Screenshots" },
        ]}
      />

      {mode === "paste" && (
        <div className="space-y-2">
          <label htmlFor="paste-text" className="text-xs text-muted">
            Paste text from your website, menu, flyer or About page. Headings like &quot;Services&quot;, &quot;FAQ&quot; or &quot;Reviews&quot; help us sort it.
          </label>
          <TextArea id="paste-text" rows={8} value={text} maxLength={MAX_TEXT} onChange={(e) => setText(e.target.value)} placeholder={"Your Business Name\n\nWhat you do, in a sentence or two...\n\nServices\nHaircut - $30. Wash and style included."} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs tabular-nums text-subtle">{text.length.toLocaleString()} / 200,000</span>
            <Button onClick={() => submitText("text", text, "pasted-text", "checkbox_paste")} disabled={locked || text.trim().length < 20} loading={busy} icon={<FileText className="size-4" />}>
              {base ? "Add to knowledge base" : "Build from text"}
            </Button>
          </div>
        </div>
      )}

      {mode === "file" && (
        <div className="space-y-3">
          <input ref={fileInput} type="file" accept=".txt,.html,.htm,text/plain,text/html" className="sr-only" aria-label="Choose a .txt or .html file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            disabled={!consented}
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-8 text-sm text-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="size-6" />
            {file ? (
              <span className="font-medium text-ink">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </span>
            ) : (
              <span>Choose a .txt or .html file (up to 200 KB)</span>
            )}
          </button>
          <div className="flex justify-end">
            <Button onClick={submitFile} disabled={locked || !file} loading={busy} icon={<FileText className="size-4" />}>
              {base ? "Add to knowledge base" : "Build from file"}
            </Button>
          </div>
        </div>
      )}

      {mode === "screenshots" && (
        <div className="space-y-3">
          <input ref={shotInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" aria-label="Choose screenshots" onChange={(e) => addShots(e.target.files)} />
          <button
            type="button"
            disabled={!consented}
            onClick={() => shotInput.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-sm text-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="size-6" />
            <span>Add screenshots (PNG, JPG or WebP, up to 5 MB each)</span>
          </button>
          {shots.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {shots.map((s, i) => (
                <li key={s.preview} className="flex gap-3 rounded-2xl border border-border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob: URL) */}
                  <img src={s.preview} alt={`Preview of ${s.file.name}`} className="size-16 shrink-0 rounded-lg bg-page object-cover" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-xs font-medium">{s.file.name}</p>
                    <label className="block text-[11px] text-muted">
                      What does it show?
                      <select
                        value={s.kind}
                        onChange={(e) => setShots((prev) => prev.map((x, j) => (j === i ? { ...x, kind: e.target.value as ScreenshotKind } : x)))}
                        className="mt-0.5 h-8 w-full rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-primary"
                      >
                        {SCREENSHOT_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${s.file.name}`}
                    onClick={() => {
                      URL.revokeObjectURL(s.preview);
                      setShots((prev) => prev.filter((_, j) => j !== i));
                    }}
                    className="self-start rounded-full p-1 text-subtle hover:bg-danger-soft hover:text-danger"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">Screenshots are stored privately. Reading them needs AI; pasting the text works right away.</p>
          <div className="flex justify-end">
            <Button onClick={submitShots} disabled={locked || shots.length === 0} loading={busy} icon={<Upload className="size-4" />}>
              Upload {shots.length || ""} screenshot{shots.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {!consented && <p className="text-xs text-subtle">Tick the permission box above to continue.</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
