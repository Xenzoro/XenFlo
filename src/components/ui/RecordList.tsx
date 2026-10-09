"use client";

/*
  A list of object records (people, offerings, testimonials, FAQs...) shown as cards.
  Each card renders with `render`; the pencil swaps it for a RecordForm, × removes it.
  Adding opens an empty RecordForm built from `blank`.
  With `groupBy`, items that share a key show as one card (e.g. the same logo found in
  several places); removing that card removes every item in the group.
*/
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, X } from "lucide-react";
import type { Field } from "@/types/knowledge";
import { useKnowledge, useList } from "@/context/KnowledgeContext";
import { cn } from "@/lib/utils/cn";
import { isAi } from "./Badge";
import { AiValueTag } from "./AiValueTag";
import { Card } from "./Card";
import { AddPill } from "./Pill";
import { RecordForm, type FormField } from "./RecordForm";

export function RecordList<T extends object>({
  path,
  fields,
  blank,
  render,
  addLabel = "Add",
  emptyText,
  columns = 1,
  filter,
  groupBy,
}: {
  path: string;
  fields: FormField[];
  blank: T;
  /** `group` holds every value sharing this card's `groupBy` key (just [value] without grouping) */
  render: (value: T, group: T[]) => React.ReactNode;
  addLabel?: string;
  emptyText?: string;
  columns?: 1 | 2 | 3;
  /** Show only some items (e.g. team vs customers). Indexes still refer to the full list. */
  filter?: (value: T) => boolean;
  /** Items with the same key show once; the first one is the card that gets edited. */
  groupBy?: (value: T) => string;
}) {
  const all = useList<T>(path);
  const { addItem, updateItem, removeItem, dismissValue, advanced, busy } = useKnowledge();
  const [editing, setEditing] = useState<number | "new" | null>(null);

  // Keep each item's real index so edits and removes hit the right one after filtering
  const shown = all
    .map((item, index) => ({ item, index }))
    .filter((x): x is { item: Field<T> & { value: T }; index: number } => x.item.value !== null && (!filter || filter(x.item.value)));

  // Group by key: each group remembers all its indexes so one remove clears the whole group.
  const groups = new Map<string, { item: Field<T> & { value: T }; index: number; members: number[]; values: T[] }>();
  shown.forEach(({ item, index }) => {
    const key = groupBy ? groupBy(item.value) : String(index);
    const group = groups.get(key);
    if (group) {
      group.members.push(index);
      group.values.push(item.value);
    } else groups.set(key, { item, index, members: [index], values: [item.value] });
  });
  const cards = [...groups.values()];
  // Highest index first, so removing one item doesn't shift the indexes of the rest.
  const removeGroup = (members: number[]) => [...members].sort((a, b) => b - a).forEach((i) => removeItem(path, i));

  const grid = columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "";

  return (
    <div data-field={path}>
      {cards.length === 0 && editing !== "new" && emptyText && <p className="mb-3 text-sm text-muted">{emptyText}</p>}
      <div className={cn("grid grid-cols-1 gap-3", grid)}>
        <AnimatePresence initial={false}>
          {cards.map(({ item, index, members, values }, i) => (
            <motion.div
              key={`${index}-${item.updatedAt}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.04 } }}
              exit={{ opacity: 0, scale: 0.97 }}
            >
              <Card className="group relative h-full p-4">
                {editing === index ? (
                  <RecordForm
                    fields={fields}
                    initial={item.value}
                    onCancel={() => setEditing(null)}
                    onSave={(v) => {
                      updateItem(path, index, v);
                      setEditing(null);
                    }}
                  />
                ) : (
                  <>
                    <div className="absolute right-2 top-2 flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                      <IconButton label="Edit" onClick={() => setEditing(index)} disabled={busy}>
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton label="Remove" onClick={() => removeGroup(members)} disabled={busy} danger>
                        <X className="size-3.5" />
                      </IconButton>
                    </div>
                    {render(item.value, values)}
                    {(advanced || isAi(item.confidence)) && (
                      <div className="mt-3">
                        <AiValueTag confidence={item.confidence} source={item.source} evidence={item.evidence} onRemove={() => dismissValue(path, index)} disabled={busy} />
                      </div>
                    )}
                  </>
                )}
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-3">
        {editing === "new" ? (
          <Card className="p-4">
            <RecordForm
              fields={fields}
              initial={blank}
              submitLabel="Add"
              onCancel={() => setEditing(null)}
              onSave={(v) => {
                addItem(path, v);
                setEditing(null);
              }}
            />
          </Card>
        ) : (
          <AddPill label={addLabel} onClick={() => setEditing("new")} disabled={busy} />
        )}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full bg-card p-1.5 text-subtle shadow-card disabled:hidden",
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-primary-soft hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
