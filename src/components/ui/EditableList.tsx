"use client";

/*
  An editable list of simple values (strings, or objects shown as one line of text).
  "chips" shows pills (good for tags); "rows" shows one item per line (good for sentences).
  Click an item to edit it, × to remove it, dashed "+ Add" to add one.
*/
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useKnowledge, useList } from "@/context/KnowledgeContext";
import { cn } from "@/lib/utils/cn";
import { isAi } from "./Badge";
import { AiValueTag } from "./AiValueTag";
import { Input } from "./Input";
import { AddPill } from "./Pill";

export interface EditableListProps<T> {
  path: string;
  label?: string;
  variant?: "chips" | "rows";
  addLabel?: string;
  placeholder?: string;
  format?: (value: T) => string;
  /** Text -> item. `previous` is the item being edited, so object fields not shown can be kept. */
  parse?: (text: string, previous?: T) => T | null;
  validate?: (text: string) => string | null;
  /** Custom rendering of an item (the text is still what gets edited) */
  render?: (value: T) => React.ReactNode;
  /** Show only some items (e.g. the first 3 colors). Indexes still refer to the full list. */
  filter?: (value: T, index: number) => boolean;
  /** Hide the "+ Add" pill (when another list on the same path owns adding) */
  canAdd?: boolean;
}

export function EditableList<T = string>({
  path,
  label,
  variant = "chips",
  addLabel = "Add",
  placeholder,
  format = (v) => String(v),
  parse = (text) => text as unknown as T,
  validate,
  render,
  filter,
  canAdd = true,
}: EditableListProps<T>) {
  const items = useList<T>(path);
  const { addItem, updateItem, removeItem, dismissValue, advanced, busy } = useKnowledge();
  // Index being edited, "new" while adding, null when idle
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function start(target: number | "new") {
    if (busy) return;
    const current = target === "new" ? null : items[target]?.value;
    setDraft(current != null ? format(current) : "");
    setError(null);
    setEditing(target);
  }

  function save() {
    const text = draft.trim();
    const problem = text ? validate?.(text) : null;
    if (problem) return setError(problem);
    if (editing === "new") {
      if (text) addItem(path, parse(text));
    } else if (editing !== null) {
      const previous = items[editing]?.value ?? undefined;
      if (previous === undefined || format(previous) !== text) updateItem(path, editing, text ? parse(text, previous) : null);
    }
    setEditing(null);
  }

  const editor = (
    <div className={variant === "chips" ? "w-56 max-w-full" : "w-full"}>
      <Input
        autoFocus
        value={draft}
        placeholder={placeholder}
        invalid={!!error}
        className="h-8 text-xs"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(null);
        }}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );

  return (
    <div data-field={path} className="min-w-0">
      {label && <p className="mb-1.5 text-xs text-muted">{label}</p>}
      <ul className={cn(variant === "chips" ? "flex flex-wrap items-center gap-2" : "space-y-1.5")}>
        <AnimatePresence initial={false}>
          {items.map((item, i) =>
            item.value === null || (filter && !filter(item.value, i)) ? null : (
              <motion.li
                key={`${i}-${format(item.value)}`}
                // Staggered entrance: each item appears ~40ms after the previous one
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.04 } }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(variant === "rows" ? "w-full" : "max-w-full")}
              >
                {editing === i ? (
                  editor
                ) : (
                  <Item
                    variant={variant}
                    onEdit={() => start(i)}
                    onRemove={() => removeItem(path, i)}
                    disabled={busy}
                    badge={
                      advanced || isAi(item.confidence) ? (
                        <AiValueTag confidence={item.confidence} source={item.source} evidence={item.evidence} onRemove={() => dismissValue(path, i)} disabled={busy} />
                      ) : null
                    }
                  >
                    {render ? render(item.value) : format(item.value)}
                  </Item>
                )}
              </motion.li>
            ),
          )}
        </AnimatePresence>
        {canAdd && (
          <li className={cn(variant === "rows" && "pt-1")}>
            {editing === "new" ? editor : <AddPill label={addLabel} onClick={() => start("new")} disabled={busy} />}
          </li>
        )}
      </ul>
    </div>
  );
}

/** One displayed item: click text to edit, × to remove. */
function Item({
  variant,
  onEdit,
  onRemove,
  disabled,
  badge,
  children,
}: {
  variant: "chips" | "rows";
  onEdit: () => void;
  onRemove: () => void;
  disabled: boolean;
  badge: React.ReactNode;
  children: React.ReactNode;
}) {
  const remove = (
    <button type="button" aria-label="Remove" onClick={onRemove} disabled={disabled} className="rounded-full p-0.5 text-subtle hover:bg-danger-soft hover:text-danger disabled:hidden">
      <X className="size-3" />
    </button>
  );
  if (variant === "chips") {
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1.5 text-xs font-medium">
        {/* min-w-0 lets long text truncate instead of stretching the chip past its container */}
        <button type="button" onClick={onEdit} disabled={disabled} className="min-w-0 truncate text-left disabled:cursor-default">
          {children}
        </button>
        {badge}
        {remove}
      </span>
    );
  }
  return (
    <div className="group flex items-start gap-2 rounded-lg px-2 py-1 text-sm hover:bg-page">
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
      <button type="button" onClick={onEdit} disabled={disabled} className="min-w-0 flex-1 break-words text-left disabled:cursor-default">
        {children}
      </button>
      {badge}
      <span className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100">{remove}</span>
    </div>
  );
}
