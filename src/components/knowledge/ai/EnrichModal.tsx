"use client";

/*
  "Enrich with AI": start (passcode or preview) -> progress -> review every suggestion.
  Nothing changes until the owner ticks suggestions and presses Apply. Accepted values keep
  their AI confidence, so they show an "AI" (or "AI preview") badge in the tabs.
*/
import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import type { Field, VoiceGuide } from "@/types/knowledge";
import type { EnrichResult, EnrichStatus, Suggestion } from "@/types/enrichment";
import { useKnowledge } from "@/context/KnowledgeContext";
import { enrichKnowledge, enrichStatus } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/messages";
import { getAt } from "@/lib/utils/path";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

const PASSCODE_KEY = "xenflo.aiPasscode";
/** Fired by "Fill with AI" buttons elsewhere (Next to do); ResultsHeader opens this modal. */
export const ENRICH_EVENT = "xenflo:enrich";
// sessionStorage can throw (private mode, blocked storage): treat that as "nothing saved".
const readPasscode = () => {
  try {
    return window.sessionStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
};
const savePasscode = (value: string) => {
  try {
    window.sessionStorage.setItem(PASSCODE_KEY, value);
  } catch {
    // not saved; the user types it again next time
  }
};

type Step = "start" | "running" | "review";

export function EnrichModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { kb, applySuggestions, jumpTo } = useKnowledge();
  const [step, setStep] = useState<Step>("start");
  const [status, setStatus] = useState<EnrichStatus | null>(null);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnrichResult | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [elapsed, setElapsed] = useState(0);

  // Fresh start every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep("start");
    setError(null);
    setResult(null);
    setPasscode(readPasscode());
    enrichStatus().then((res) => setStatus(res.error ? null : res.data));
  }, [open]);

  // Seconds counter while the AI calls run.
  useEffect(() => {
    if (step !== "running") return;
    const started = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [step]);

  async function run(preview: boolean) {
    if (!kb) return;
    setError(null);
    setStep("running");
    const res = await enrichKnowledge(kb, preview ? { preview: true } : { passcode: passcode.trim() });
    if (res.error) {
      setStep("start");
      setError(res.error.code === "INVALID_PASSCODE" ? "That passcode isn't right." : friendlyError(res.error.code).title);
      return;
    }
    if (!preview) savePasscode(passcode.trim());
    setResult(res.data);
    // Pre-tick list additions and empty fields; replacing something already there is opt-in.
    setChosen(new Set(res.data.suggestions.flatMap((s, i) => (s.list || isEmptyAt(kb, s) ? [i] : []))));
    setStep("review");
  }

  function apply() {
    if (!result) return;
    const accepted = result.suggestions.filter((_, i) => chosen.has(i));
    applySuggestions(accepted);
    onClose();
    if (accepted[0]) jumpTo(accepted[0].path); // show where the first one landed
  }

  const live = !!status?.liveAvailable;
  // Field suggestions first; per-offering category suggestions get their own group
  const indexed = (result?.suggestions ?? []).map((s, i) => ({ s, i }));
  const fields = indexed.filter((x) => !x.s.offering);
  const categories = indexed.filter((x) => x.s.offering);
  const toggle = (i: number, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(i);
      else next.delete(i);
      return next;
    });

  return (
    <Modal open={open} onClose={onClose} busy={step === "running"} labelledBy="enrich-title" wide>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h2 id="enrich-title" className="text-lg font-bold">
              Enrich with AI
            </h2>
            <p className="text-sm text-muted">Flo writes the fields that need judgment, using only the facts you already have.</p>
          </div>
        </div>
        {step !== "running" && (
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-subtle hover:bg-page hover:text-ink">
            <X className="size-4" />
          </button>
        )}
      </div>

      {step === "start" && (
        <div className="mt-5 space-y-4">
          <p className="text-sm">
            Flo reads your pages and suggests what a person would conclude from them: industry, business model, customers, channels, themes, your pitch,
            writing style and Content Kit. Only well-supported answers are suggested, and you review each one before anything changes.
          </p>
          {live ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(false);
              }}
              className="space-y-3"
            >
              <label className="block text-xs font-medium text-muted" htmlFor="ai-passcode">
                Demo passcode
              </label>
              <Input
                id="ai-passcode"
                type="password"
                autoComplete="off"
                value={passcode}
                invalid={!!error}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter the passcode to use live AI"
              />
              {error && <p className="text-xs text-danger">{error}</p>}
              <p className="text-xs text-subtle">
                Live AI ({status?.textModel}) · {status?.remainingToday ?? "?"} runs left today on this demo
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button type="button" onClick={() => run(true)} className="text-xs font-medium text-primary hover:underline">
                  No passcode? Use preview mode
                </button>
                <Button type="submit" disabled={!passcode.trim()} icon={<Sparkles className="size-4" />}>
                  Enrich with AI
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="rounded-xl bg-page p-3 text-xs text-muted">
                Live AI isn&apos;t set up here, so you&apos;ll get <strong>preview</strong> suggestions: templates built from your own facts, clearly labeled
                &ldquo;AI preview&rdquo;.
              </p>
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex justify-end">
                <Button onClick={() => run(true)} icon={<Sparkles className="size-4" />}>
                  Show preview suggestions
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "running" && (
        <div className="mt-6 space-y-3" role="status" aria-live="polite">
          {/* The two calls run at the same time, so both steps spin together. */}
          <ProgressRow text="Writing your pitch, style, ideal customer and Content Kit" />
          <ProgressRow text="Looking at your logo and images" />
          <p className="text-xs text-subtle">{elapsed}s · usually under 15 seconds</p>
        </div>
      )}

      {step === "review" && result && kb && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="purple">{result.mode === "live" ? "AI" : "AI preview"}</Badge>
            {result.mode === "live" && <span className="text-xs text-subtle">{result.models.text}{result.cached ? " · saved result, no new AI call" : ""}</span>}
          </div>
          {result.hint && <p className="mt-2 text-xs font-medium text-primary">{result.hint}</p>}
          {result.notes.length > 0 && (
            <div className="mt-3 space-y-1 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs">
              {result.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}

          {result.suggestions.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No new suggestions. Everything Flo could fill is already filled, or the facts weren&apos;t enough to go on.</p>
          ) : (
            <>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted">
                  {chosen.size} of {result.suggestions.length} selected
                </span>
                <span className="flex gap-3">
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => setChosen(new Set(result.suggestions.map((_, i) => i)))}>
                    Select all
                  </button>
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => setChosen(new Set())}>
                    None
                  </button>
                </span>
              </div>
              <SuggestionList items={fields} chosen={chosen} toggle={toggle} kb={kb} />
              {categories.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs">
                    {/* Replacing scraped categories is opt-in: none are ticked until the owner chooses */}
                    <span className="font-semibold uppercase tracking-wider text-subtle">Offering categories ({categories.length})</span>
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => setChosen((prev) => new Set([...prev, ...categories.map((c) => c.i)]))}
                    >
                      Select these
                    </button>
                  </div>
                  <SuggestionList items={categories} chosen={chosen} toggle={toggle} kb={kb} />
                </div>
              )}
            </>
          )}

          {result.notEnough.length > 0 && (
            <details className="mt-4 rounded-2xl border border-border p-3 text-xs">
              <summary className="cursor-pointer font-semibold">Not enough evidence ({result.notEnough.length})</summary>
              <p className="mt-1 text-subtle">These stay empty rather than guessed. Add them yourself if you know the answer.</p>
              <ul className="mt-2 space-y-1">
                {result.notEnough.map((n) => (
                  <li key={n.path}>
                    <span className="font-medium">{n.label}</span> <span className="text-subtle">({n.confidence} confidence)</span>: {n.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={chosen.size === 0} icon={<Check className="size-4" />}>
              Apply {chosen.size || ""} {chosen.size === 1 ? "suggestion" : "suggestions"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ProgressRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border p-3 text-sm">
      <Loader2 className="size-4 animate-spin text-primary" />
      {text}
    </div>
  );
}

function SuggestedValue({ s }: { s: Suggestion }) {
  if (s.list) {
    return (
      <span className="mt-1.5 flex flex-wrap gap-1.5">
        {(s.value as string[]).map((v) => (
          <span key={v} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs">
            + {v}
          </span>
        ))}
      </span>
    );
  }
  if (s.path === "contentKit.voiceGuide") {
    const g = s.value as VoiceGuide;
    return (
      <span className="mt-1 block space-y-0.5 text-sm">
        <span className="block">Words to use: {g.wordsToUse.join(", ") || "none"}</span>
        <span className="block">Words to avoid: {g.wordsToAvoid.join(", ") || "none"}</span>
        <span className="block">Do: {g.dos.join("; ") || "none"}</span>
        <span className="block">Don&apos;t: {g.donts.join("; ") || "none"}</span>
      </span>
    );
  }
  return <span className="mt-1 block text-sm">{String(s.value)}</span>;
}

type Kb = NonNullable<ReturnType<typeof useKnowledge>["kb"]>;

function SuggestionList({ items, chosen, toggle, kb }: { items: { s: Suggestion; i: number }[]; chosen: Set<number>; toggle: (i: number, on: boolean) => void; kb: Kb }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map(({ s, i }) => (
        <li key={`${s.path}-${i}`}>
          <label
            className={`flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors ${chosen.has(i) ? "border-primary bg-primary-soft/40" : "border-border hover:bg-page"}`}
          >
            <span className="pt-0.5">
              <Checkbox checked={chosen.has(i)} onChange={(on) => toggle(i, on)} label={`Use suggested ${s.label}`} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-subtle">{s.label}</span>
                {s.confidence === "inferred" && <Badge tone="amber">Inferred</Badge>}
              </span>
              <SuggestedValue s={s} />
              <CurrentValue kb={kb} s={s} />
              {s.basedOn.length > 0 && (
                <span className="mt-1.5 block text-[11px] text-subtle">
                  Based on: {s.basedOn.slice(0, 3).join(" · ")}
                  {s.basedOn.length > 3 && ` · +${s.basedOn.length - 3} more`}
                </span>
              )}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** What's there now, so the owner knows what a scalar suggestion would replace. */
function CurrentValue({ kb, s }: { kb: Kb; s: Suggestion }) {
  if (s.list || isEmptyAt(kb, s)) return null;
  const current = s.offering ? kb.offerings[s.offering.index]?.value?.category : (getAt(kb, s.path) as Field<unknown>).value;
  const text = typeof current === "string" ? current : JSON.stringify(current);
  return <span className="mt-1.5 block truncate text-xs text-subtle">Replaces: {text}</span>;
}

function isEmptyAt(kb: Kb, s: Suggestion): boolean {
  if (s.offering) return !kb.offerings[s.offering.index]?.value?.category;
  const at = getAt(kb, s.path) as Field<unknown> | Field<unknown>[] | undefined;
  if (Array.isArray(at)) return at.length === 0;
  return !at || at.value === null;
}
