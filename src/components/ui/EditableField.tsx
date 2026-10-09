"use client";

/*
  One editable value, bound to the knowledge base by dot path.
  Shows the value (or a dashed "+ Add" pill when empty); click to edit inline.
  Enter or clicking away saves, Esc cancels. Saving marks the field "User edited".
*/
import { useState } from "react";
import { Pencil } from "lucide-react";
import { useField, useKnowledge } from "@/context/KnowledgeContext";
import { cn } from "@/lib/utils/cn";
import { ConfidenceBadge, isAi } from "./Badge";
import { Input, TextArea } from "./Input";
import { AddPill } from "./Pill";

export interface EditableFieldProps<T> {
  path: string;
  label?: string;
  kind?: "text" | "textarea" | "number";
  /** Text in the empty pill, e.g. "year" shows "+ year" */
  emptyLabel?: string;
  placeholder?: string;
  /** Value -> text for the input (defaults to String) */
  format?: (value: T) => string;
  /** Text -> value to store (defaults to the trimmed text, or a number for kind="number") */
  parse?: (text: string) => T | null;
  /** Return an error message to block saving */
  validate?: (text: string) => string | null;
  /** Custom read-only rendering of the value */
  display?: (value: T) => React.ReactNode;
  className?: string;
  valueClassName?: string;
}

export function EditableField<T = string>({
  path,
  label,
  kind = "text",
  emptyLabel = "Add",
  placeholder,
  format = (v) => String(v),
  parse,
  validate,
  display,
  className,
  valueClassName,
}: EditableFieldProps<T>) {
  const f = useField<T>(path);
  const { setField, advanced, busy } = useKnowledge();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const value = f?.value ?? null;
  const badge = f && (advanced || isAi(f.confidence)) ? <ConfidenceBadge confidence={f.confidence} source={f.source} /> : null;

  function start() {
    if (busy) return;
    setDraft(value === null ? "" : format(value));
    setError(null);
    setEditing(true);
  }

  function save() {
    const text = draft.trim();
    const problem = text ? validate?.(text) : null;
    if (problem) return setError(problem);
    const next = parse ? parse(text) : kind === "number" ? (text ? Number(text) : null) : text || null;
    // Only write when something actually changed, so we don't mark untouched fields as edited
    if ((value === null ? "" : format(value)) !== text) setField(path, next);
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setEditing(false);
    // Enter saves; in a textarea Shift+Enter adds a new line instead
    if (e.key === "Enter" && !(kind === "textarea" && e.shiftKey)) {
      e.preventDefault();
      save();
    }
  }

  return (
    <div data-field={path} className={cn("min-w-0", className)}>
      {label && (
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs text-muted">{label}</span>
          {badge}
        </div>
      )}

      {editing ? (
        <div>
          {kind === "textarea" ? (
            <TextArea autoFocus rows={4} aria-label={label ?? emptyLabel} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={onKeyDown} />
          ) : (
            <Input
              autoFocus
              aria-label={label ?? emptyLabel}
              aria-invalid={!!error}
              type={kind === "number" ? "number" : "text"}
              value={draft}
              placeholder={placeholder}
              invalid={!!error}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={onKeyDown}
            />
          )}
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
      ) : value === null ? (
        <span className="inline-flex items-center gap-2">
          <AddPill label={emptyLabel} onClick={start} disabled={busy} />
          {!label && badge}
        </span>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          aria-label={label ? `${label}: ${format(value)}. Click to edit` : undefined}
          className={cn(
            "group -mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-page disabled:cursor-default",
            // No class-merging library, so the default size only applies when the caller doesn't set one
            valueClassName ?? "text-sm",
          )}
        >
          <span className="min-w-0 flex-1 whitespace-pre-line break-words">
            {display ? display(value) : format(value)}
            {!label && badge && <span className="ml-2 inline-block align-middle">{badge}</span>}
          </span>
          <Pencil className="mt-0.5 size-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}
    </div>
  );
}
