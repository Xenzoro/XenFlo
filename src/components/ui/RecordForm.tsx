"use client";

/*
  A small form for editing one object (a person, an offering, a testimonial...).
  Fields are described as data, so one component serves every record type.
  Values are edited as text and converted back on save:
    "number" -> number or null, "list" -> string[] (one per line or comma), blank text -> null.
*/
import { useState } from "react";
import { Button } from "./Button";
import { Input, TextArea } from "./Input";

export interface FormField {
  key: string;
  label: string;
  kind?: "text" | "textarea" | "number" | "select" | "list";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}

type Rec = Record<string, unknown>;

function toText(value: unknown, kind: FormField["kind"]): string {
  if (value == null) return "";
  if (kind === "list" && Array.isArray(value)) return value.join("\n");
  return String(value);
}

function fromText(text: string, kind: FormField["kind"]): unknown {
  const t = text.trim();
  if (kind === "list") return t.split(/\n|,(?=\s)/).map((s) => s.trim()).filter(Boolean);
  if (kind === "number") return t && !Number.isNaN(Number(t)) ? Number(t) : null;
  return t || null;
}

export function RecordForm<T extends object>({
  fields,
  initial,
  onSave,
  onCancel,
  submitLabel = "Save",
}: {
  fields: FormField[];
  initial: T;
  onSave: (value: T) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, toText((initial as Rec)[f.key], f.kind)])),
  );
  const missingRequired = fields.some((f) => f.required && !values[f.key]?.trim());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missingRequired) return;
    // Start from the original so keys that aren't in the form are kept
    const out: Rec = { ...(initial as Rec) };
    for (const f of fields) out[f.key] = fromText(values[f.key] ?? "", f.kind);
    onSave(out as T);
  }

  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <form onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onCancel()} className="space-y-3">
      {fields.map((f, i) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-xs text-muted">
            {f.label}
            {f.required && <span className="text-danger"> *</span>}
            {f.kind === "list" && <span className="text-subtle"> (one per line)</span>}
          </span>
          {f.kind === "textarea" || f.kind === "list" ? (
            <TextArea rows={3} autoFocus={i === 0} value={values[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
          ) : f.kind === "select" ? (
            <select
              value={values[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:shadow-glow"
            >
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <Input
              autoFocus={i === 0}
              type={f.kind === "number" ? "number" : "text"}
              step="any"
              value={values[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
        </label>
      ))}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={missingRequired}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
