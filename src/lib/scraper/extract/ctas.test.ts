import { describe, expect, it } from "vitest";
import { emptyKnowledgeBase } from "@/lib/utils/knowledge";
import { extractPage } from "./index";

const SITE = "https://www.harborbakery.example";

describe("extractCtas", () => {
  it("skips file downloads but keeps real calls to action", () => {
    const kb = emptyKnowledgeBase(SITE);
    const html = `<html><body><main>
      <a class="btn" href="/files/Harbor%20Bakery%20press%20kit.zip">Download press kit</a>
      <a class="btn" href="/files/catering.pdf">Get the PDF</a>
      <a class="btn" href="/media/logo" download>Download our logo</a>
      <a class="btn" href="/book">Book now</a>
    </main></body></html>`;
    extractPage(html, `${SITE}/press`, "press", kb);
    expect(kb.customers.ctas.map((c) => c.value?.text)).toEqual(["Book now"]);
  });
});
