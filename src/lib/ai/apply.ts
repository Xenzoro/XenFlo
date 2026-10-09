/**
 * Pure knowledge base updates for AI suggestions, used by KnowledgeContext (and tested directly).
 *
 * applySuggestionsTo: accepted suggestions keep ai_live / ai_mock / inferred (not user_edited), so
 *   they show their badge with the evidence in its tooltip. List suggestions add new items; scalar
 *   ones replace the field; offering categories update only the category.
 * dismissIn: "Wrong? Remove". Clears the value (or list item) and records it in kb.dismissed, so
 *   filterByTier drops it from the next enrichment run. The same record can serve re-scrapes later.
 */
import type { Field, KnowledgeBase, Offering } from "@/types/knowledge";
import type { Suggestion } from "@/types/enrichment";
import { field, missing } from "@/lib/utils/knowledge";
import { getAt, setAt } from "@/lib/utils/path";
import { valueKey } from "./field-tiers";
import { offeringKey } from "./menus";

export function applySuggestionsTo(kb: KnowledgeBase, suggestions: Suggestion[]): KnowledgeBase {
  return suggestions.reduce((acc, s) => {
    const withEvidence = <T>(f: Field<T>): Field<T> => (s.basedOn.length ? { ...f, evidence: s.basedOn } : f);
    if (s.offering) {
      const o = acc.offerings[s.offering.index];
      if (!o?.value) return acc;
      const value = { ...o.value, category: String(s.value), categoryConfidence: s.confidence, categoryEvidence: s.basedOn };
      return setAt(acc, `offerings.${s.offering.index}`, { ...o, value });
    }
    if (!s.list) return setAt(acc, s.path, withEvidence(field(s.value, s.source, s.confidence)));
    const list = (getAt(acc, s.path) as Field<unknown>[]) ?? [];
    const have = new Set(list.map((f) => String(f.value).toLowerCase()));
    const added = (s.value as string[]).filter((v) => !have.has(v.toLowerCase())).map((v) => withEvidence(field(v, s.source, s.confidence)));
    return setAt(acc, s.path, [...list, ...added]);
  }, kb);
}

export function dismissIn(kb: KnowledgeBase, path: string, index?: number): KnowledgeBase {
  const at = new Date().toISOString();
  const remember = (acc: KnowledgeBase, p: string, key: string): KnowledgeBase => ({ ...acc, dismissed: [...(acc.dismissed ?? []), { path: p, key, at }] });

  // Offering category: clear just the category; remembered by offering name + category
  const offering = path.match(/^offerings\.(\d+)\.category$/);
  if (offering) {
    const o = kb.offerings[Number(offering[1])];
    if (!o?.value) return kb;
    const { categoryConfidence: _c, categoryEvidence: _e, ...rest } = o.value;
    void _c;
    void _e;
    const next = setAt(kb, `offerings.${offering[1]}`, { ...o, value: { ...rest, category: null } });
    return remember(next, "offerings.*.category", valueKey(`${o.value.name}=>${o.value.category}`));
  }
  if (index === undefined) {
    const f = getAt(kb, path) as Field<unknown> | undefined;
    if (!f || f.value === null) return kb;
    return remember(setAt(kb, path, missing()), path, valueKey(f.value));
  }
  const list = (getAt(kb, path) as Field<unknown>[]) ?? [];
  const item = list[index];
  if (!item) return kb;
  // Offerings are remembered by brand + name, so "Read menus with AI" won't add a removed item back
  if (path === "offerings") {
    const o = item.value as Offering | null;
    if (o) return remember(setAt(kb, path, list.filter((_, i) => i !== index)), path, offeringKey(o.name, o.group));
  }
  return remember(setAt(kb, path, list.filter((_, i) => i !== index)), path, valueKey(item.value));
}
