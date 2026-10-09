/**
 * Preview-mode suggestions: no AI call, built from templates using only facts already in
 * the knowledge base, and marked ai_mock ("AI preview" badge). Fields a template can't fill
 * honestly (writing style, ideal persona, art style) are not suggested at all.
 */
import type { KnowledgeBase } from "@/types/knowledge";
import type { Suggestion } from "@/types/enrichment";
import { mockContentPreview } from "./mockPreview";

const vals = <T>(list: { value: T | null }[]): T[] => list.flatMap((f) => (f.value === null ? [] : [f.value]));

export function mockSuggestions(kb: KnowledgeBase): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (path: string, label: string, value: unknown, list: boolean) => {
    if (list ? (value as unknown[]).length === 0 : !value) return;
    out.push({ path, label, value, list, confidence: "ai_mock", source: "ai:preview", basedOn: [] });
  };

  const name = kb.company.name.value || kb.companyName;
  const overview = kb.company.overview.value;
  // Pitch: the overview's first sentence, which the business wrote itself.
  const firstSentence = overview?.match(/^.+?[.!?](\s|$)/)?.[0].trim() ?? overview;
  if (firstSentence) add("company.pitch", "Pitch", firstSentence, false);

  const preview = mockContentPreview(kb);
  add("contentKit.emailSubjects", "Email subject ideas", [preview.emailSubject], true);
  add("contentKit.blogIdeas", "Blog ideas", vals(kb.insights.faqs).slice(0, 3).map((f) => `Answering your question: "${f.question.replace(/\?*$/, "?")}"`), true);
  add("contentKit.socialHooks", "Social hooks", [preview.socialPost.split(/(?<=[.?!])\s/)[0]], true);

  // Hashtags from the name, city and offering categories (all facts we already have).
  const tag = (s: string) => `#${s.replace(/[^a-z0-9]/gi, "")}`;
  const city = kb.company.mainAddress.value?.city;
  const categories = [...new Set(vals(kb.offerings).map((o) => o.category).filter((c): c is string => !!c))];
  const hashtags = [name, city, ...categories.slice(0, 3)].filter((s): s is string => !!s).map(tag).filter((t) => t.length > 2);
  add("contentKit.hashtags", "Hashtags", [...new Set(hashtags)], true);

  // Content pillars: the business's own differentiators and offering categories.
  add("contentKit.contentPillars", "Content pillars", [...categories, ...vals(kb.insights.differentiators)].slice(0, 4), true);
  return out;
}
