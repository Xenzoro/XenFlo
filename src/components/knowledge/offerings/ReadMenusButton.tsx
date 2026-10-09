"use client";

/*
  "Read menus with AI" (Phase 10): one button that fills the menus.
  Calls /api/menus with the live AI passcode (asked once per tab, shared with Enrich with AI),
  then adds the items it read straight into Offerings with their AI badge. Each run reads up to
  8 menu pages or images; the notes say how many are left for the next run.
*/
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { EnrichStatus } from "@/types/enrichment";
import { useKnowledge } from "@/context/KnowledgeContext";
import { enrichStatus, readMenus } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/messages";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { readPasscode, savePasscode } from "../ai/passcode";

/** `only`: read just these menus again with the current prompt (a brand's "Read again with AI"). */
export function ReadMenusButton({ waiting, only, label = "Read menus with AI", compact }: { waiting: number; only?: string[]; label?: string; compact?: boolean }) {
  const { kb, applyMenuResult, busy, setBusy } = useKnowledge();
  const [status, setStatus] = useState<EnrichStatus | null>(null);
  const [asking, setAsking] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  // The run didn't do what was asked (no live AI left, or a chosen menu wasn't read again): notes show as a warning
  const [warn, setWarn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    enrichStatus().then((res) => setStatus(res.error ? null : res.data));
  }, []);

  // Seconds counter while menus are read (up to ~45 s)
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [running]);

  async function run(code: string) {
    if (!kb) return;
    setError(null);
    setNotes([]);
    setRunning(true);
    setBusy(true);
    const res = await readMenus(kb, code, only ? { only, fresh: true } : {});
    setRunning(false);
    setBusy(false);
    if (res.error) {
      if (res.error.code === "INVALID_PASSCODE") {
        setAsking(true);
        setError("That passcode isn't right.");
      } else setError(friendlyError(res.error.code).title);
      return;
    }
    savePasscode(code);
    setAsking(false);
    applyMenuResult(res.data);
    setNotes(res.data.notes);
    setWarn(res.data.mode === "unavailable" || (!!only && (res.data.replaces?.length ?? 0) < only.length));
  }

  function start() {
    const saved = readPasscode();
    if (saved) void run(saved);
    else setAsking(true);
  }

  const live = !!status?.liveAvailable;

  return (
    <div className="space-y-2">
      {asking ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(passcode.trim());
          }}
        >
          <Input
            type="password"
            aria-label="Demo passcode"
            placeholder="Demo passcode for live AI"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-56"
            autoFocus
          />
          <Button type="submit" size="sm" disabled={!passcode.trim() || running} loading={running} icon={<Sparkles className="size-3.5" />}>
            Read menus
          </Button>
          <button type="button" className="text-xs text-subtle hover:text-ink hover:underline" onClick={() => setAsking(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <Button size="sm" variant={compact ? "secondary" : "primary"} onClick={start} disabled={!live || busy || waiting === 0} loading={running} icon={<Sparkles className="size-3.5" />}>
          {running ? `Reading… ${elapsed}s` : label}
        </Button>
      )}
      {!live && status && !compact && <p className="text-xs text-muted">Live AI isn&apos;t set up on this server, so picture menus can&apos;t be read here. You can add items yourself.</p>}
      {live && !compact && !running && notes.length === 0 && waiting > 0 && (
        <p className="text-[11px] text-subtle">
          Reads up to 8 menu pages per run (about $0.01 each) · {status?.remainingToday ?? "?"} live runs left today
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {notes.length > 0 && (
        <ul className={cn("space-y-0.5 text-xs", warn ? "rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning" : "text-muted")} role={warn ? "alert" : undefined}>
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
