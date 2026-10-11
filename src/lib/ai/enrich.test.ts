import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyKnowledgeBase, field } from "@/lib/utils/knowledge";
import type { Suggestion } from "@/types/enrichment";
import { LIMITS } from "./config";
import type { TextOutput } from "./schemas";

// The text call answers instantly with nothing usable; it records the timeout it was given.
const state = { timeouts: [] as number[], slowDb: false };
const never = () => new Promise<never>(() => {});
vi.mock("@/lib/db/ai", () => ({
  getCachedEnrichment: async () => null,
  putCachedEnrichment: async () => (state.slowDb ? never() : undefined),
  takeAiQuota: async () => true,
  aiQuotaRemaining: async () => (state.slowDb ? never() : 5),
}));
vi.mock("./openai", () => ({
  callOpenAi: async (opts: { timeoutMs?: number }) => {
    state.timeouts.push(opts.timeoutMs ?? -1);
    const scalar = { value: null, confidence: "low", evidence: [], reason: null };
    const many = { values: [], confidence: "low", evidence: [], reason: null };
    const data: Record<string, unknown> = Object.fromEntries(
      ["industry", "businessModel", "companyRole", "industryOutlook", "pitch", "writingStyle", "idealPersona"].map((k) => [k, scalar]),
    );
    for (const k of ["industryGroupings", "serviceLocations", "targetBuyers", "customerNeeds", "channels", "funnels", "contentThemes", "positioningSignals", "communityValues", "seasonalMessaging", "contentPillars", "socialHooks", "hashtags", "emailSubjects", "blogIdeas"]) data[k] = many;
    return { data: { ...data, voiceGuide: scalar, offeringCategories: [] } as unknown as TextOutput, usage: { input: 1, output: 1 } };
  },
}));

const { enrich, guard, matchOfferings } = await import("./enrich");

describe("enrich route deadline", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("AI_PASSCODE", "test-passcode");
    state.timeouts = [];
    state.slowDb = false;
  });

  it("gives the text call 55 s when the request just arrived", async () => {
    await enrich(emptyKnowledgeBase("https://example.com/"), { startedAt: Date.now() });
    expect(state.timeouts[0]).toBeLessThanOrEqual(LIMITS.textTimeoutMs);
    expect(state.timeouts[0]).toBeGreaterThan(LIMITS.textTimeoutMs - 1_000);
  });

  it("cuts the text call short so the route still answers within 60 s", async () => {
    // 10 s already spent (images, cache, quota): the call may only run to the deadline
    const startedAt = Date.now() - 10_000;
    await enrich(emptyKnowledgeBase("https://example.com/"), { startedAt });
    const callEnds = 10_000 + state.timeouts[0];
    expect(callEnds).toBeLessThanOrEqual(LIMITS.routeBudgetMs - LIMITS.afterCallsMs);
    expect(LIMITS.routeBudgetMs).toBeLessThan(60_000);
  });

  it("doesn't wait on a slow database after the calls", async () => {
    state.slowDb = true;
    const started = Date.now();
    const out = await enrich(emptyKnowledgeBase("https://example.com/"), { startedAt: started });
    expect(Date.now() - started).toBeLessThanOrEqual(LIMITS.afterCallsMs + 500);
    expect(out.remainingToday).toBeNull();
  });
});

describe("matchOfferings", () => {
  // Dragon: every brand's menu has an "ALL DAY AYCE"
  const offerings = [
    { index: 140, name: "ALL DAY AYCE" },
    { index: 247, name: "ALL DAY AYCE" },
    { index: 249, name: "Lunch AYCE" },
    { index: 508, name: "ALL DAY AYCE" },
  ];
  const answer = (offering: string, category = "All-you-can-eat") => ({ offering, category });

  it("gives a repeated name to the next offering with that name not used yet", () => {
    const out = matchOfferings([answer("ALL DAY AYCE"), answer("all day ayce "), answer("Lunch AYCE"), answer("ALL DAY AYCE")], offerings);
    expect(out.map((m) => m.offering.index)).toEqual([140, 247, 249, 508]);
  });

  it("never gives one offering two answers", () => {
    const out = matchOfferings([answer("Lunch AYCE", "Lunch"), answer("Lunch AYCE", "Lunch special")], offerings);
    expect(out).toHaveLength(1);
    expect(out[0].answer.category).toBe("Lunch");
  });

  it("drops names that weren't sent", () => {
    expect(matchOfferings([answer("Mystery roll")], offerings)).toEqual([]);
  });
});

describe("guard: suggestions that change nothing", () => {
  const suggest = (path: string, value: string | string[]): Suggestion => ({
    path,
    label: path,
    value,
    list: Array.isArray(value),
    confidence: "ai_live",
    source: "ai:test",
    basedOn: ["p1"],
  });
  const kb = () => {
    const k = emptyKnowledgeBase("https://example.com/");
    k.company.industry = field("Restaurant group", "https://example.com/", "ai_live");
    k.customers.channels = [field("Online ordering", "https://example.com/", "scraped"), field("Dine-in", null, "ai_live")];
    return k;
  };

  it("drops a value equal to the current one, ignoring case, spaces and punctuation", () => {
    for (const same of ["Restaurant group", "restaurant group", "  Restaurant   group. "]) {
      expect(guard(kb(), [suggest("company.industry", same)])).toEqual([]);
    }
  });

  it("keeps a value that really is different", () => {
    expect(guard(kb(), [suggest("company.industry", "Restaurant groups and bars")])).toHaveLength(1);
  });

  it("keeps a suggestion for an empty field", () => {
    expect(guard(kb(), [suggest("company.businessModel", "B2C, local")])).toHaveLength(1);
  });

  it("keeps only the new items of a list suggestion", () => {
    const out = guard(kb(), [suggest("customers.channels", ["online ordering", "Dine in", "Catering", "catering."])]);
    expect(out).toHaveLength(1);
    expect(out[0].value).toEqual(["Catering"]);
  });

  it("drops a list suggestion with nothing new", () => {
    expect(guard(kb(), [suggest("customers.channels", ["Online Ordering!", "dine-in"])])).toEqual([]);
  });
});
