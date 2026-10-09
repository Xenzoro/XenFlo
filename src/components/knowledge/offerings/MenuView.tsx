"use client";

/*
  Menu view of the offerings (Phase 10), for restaurants, cafes and shops:
  brand/location groups (collapsible, with item count, address and price range), then categories,
  then items with name, description, price and a small source label ("from Sakana Sushi menu PDF").
  AI-read items keep their badge with "Wrong? Remove". Search filters across every group.
*/
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, MapPin, Pencil, Search, X } from "lucide-react";
import type { Field, Offering } from "@/types/knowledge";
import { useKnowledge } from "@/context/KnowledgeContext";
import { groupOfferings, type OfferingGroup } from "@/lib/scraper/menus/group";
import { offeringSourceLabel } from "@/lib/utils/offerings";
import { isAi } from "@/components/ui/Badge";
import { AiValueTag } from "@/components/ui/AiValueTag";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { AddPill } from "@/components/ui/Pill";
import { RecordForm } from "@/components/ui/RecordForm";
import { cn } from "@/lib/utils/cn";
import { BLANK_OFFERING, OFFERING_FIELDS, priceRange } from "./fields";

const groupKey = (g: OfferingGroup) => (g.name ?? "").toLowerCase();

export function MenuView() {
  const { kb, addItem, busy } = useKnowledge();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const groups = useMemo(() => groupOfferings(kb?.offerings ?? []), [kb?.offerings]);
  // Groups the owner opened or closed by hand. Otherwise: with many brands only the first starts open,
  // so the page stays scannable on a phone (and brands added later by "Read menus" follow the same rule).
  const [manual, setManual] = useState<Map<string, boolean>>(new Map());

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => (q ? filterGroups(groups, q) : groups), [groups, q]);
  const isOpenAt = (key: string, i: number) => manual.get(key) ?? (groups.length <= 3 || i === 0);
  const toggle = (key: string, i: number) => setManual((prev) => new Map(prev).set(key, !isOpenAt(key, i)));

  return (
    <div data-field="offerings" className="space-y-3">
      {groups.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items, sections or brands" aria-label="Search offerings" className="pl-9" />
        </div>
      )}
      {q && filtered.length === 0 && <p className="text-sm text-muted">Nothing matches “{query}”.</p>}

      {filtered.map((g, i) => {
        const key = groupKey(g);
        const isOpen = !!q || isOpenAt(key, i);
        const range = priceRange(g.priceMin, g.priceMax);
        return (
          <Card key={key || "_all"} className="overflow-hidden">
            <button type="button" onClick={() => toggle(key, i)} aria-expanded={isOpen} className="flex w-full items-start gap-3 p-4 text-left hover:bg-page/60">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{g.name ?? (groups.length > 1 ? "Other items" : "Menu")}</p>
                {g.location && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">{g.location}</span>
                  </p>
                )}
              </div>
              <Badge>{g.count} item{g.count === 1 ? "" : "s"}</Badge>
              {range && <span className="hidden text-xs text-muted sm:inline">{range}</span>}
              <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-subtle transition-transform", isOpen && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="space-y-4 border-t border-border-soft px-4 pb-4 pt-3">
                    {g.categories.map((c) => (
                      <section key={c.name ?? "_none"}>
                        {c.name && (
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                            {c.name} <span className="font-normal text-subtle">· {c.items.length}</span>
                          </p>
                        )}
                        <ul className="divide-y divide-border-soft">
                          {c.items.map(({ field, index }) => (
                            <MenuRow key={`${index}-${field.updatedAt}`} field={field} index={index} />
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        );
      })}

      {adding ? (
        <Card className="p-4">
          <RecordForm
            fields={OFFERING_FIELDS}
            initial={BLANK_OFFERING}
            submitLabel="Add"
            onCancel={() => setAdding(false)}
            onSave={(v) => {
              addItem("offerings", v);
              setAdding(false);
            }}
          />
        </Card>
      ) : (
        <AddPill label="item" onClick={() => setAdding(true)} disabled={busy} />
      )}
    </div>
  );
}

function MenuRow({ field, index }: { field: Field<Offering>; index: number }) {
  const { updateItem, removeItem, dismissValue, advanced, busy } = useKnowledge();
  const [editing, setEditing] = useState(false);
  const o = field.value!;
  const source = offeringSourceLabel(field);
  const ai = isAi(field.confidence);

  if (editing) {
    return (
      <li className="py-3">
        <RecordForm
          fields={OFFERING_FIELDS}
          initial={o}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            updateItem("offerings", index, v);
            setEditing(false);
          }}
        />
      </li>
    );
  }
  return (
    <li className="group flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{o.name}</p>
        {o.description && <p className="mt-0.5 text-xs text-muted">{o.description}</p>}
        {(source || ai || advanced) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
            {source && <span>{source}</span>}
            {(ai || advanced) && (
              // AI items: "Wrong? Remove" takes the item out and remembers it, so a re-read won't add it back
              <AiValueTag confidence={field.confidence} source={field.source} evidence={field.evidence} onRemove={() => dismissValue("offerings", index)} disabled={busy} />
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        <span className="pt-0.5 text-sm font-semibold">{o.priceText ?? ""}</span>
        <div className="flex gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
          <button type="button" aria-label={`Edit ${o.name}`} onClick={() => setEditing(true)} disabled={busy} className="rounded-full p-1 text-subtle hover:bg-primary-soft hover:text-primary disabled:hidden">
            <Pencil className="size-3.5" />
          </button>
          <button type="button" aria-label={`Remove ${o.name}`} onClick={() => removeItem("offerings", index)} disabled={busy} className="rounded-full p-1 text-subtle hover:bg-danger-soft hover:text-danger disabled:hidden">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

/** Keep groups, categories and items that match the search (a brand or section name match keeps all its items). */
function filterGroups(groups: OfferingGroup[], q: string): OfferingGroup[] {
  const has = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q);
  return groups.flatMap((g) => {
    if (has(g.name) || has(g.location)) return [g];
    const categories = g.categories.flatMap((c) => {
      if (has(c.name)) return [c];
      const items = c.items.filter(({ field }) => has(field.value?.name) || has(field.value?.description));
      return items.length ? [{ ...c, items }] : [];
    });
    const count = categories.reduce((n, c) => n + c.items.length, 0);
    return count ? [{ ...g, categories, count }] : [];
  });
}
