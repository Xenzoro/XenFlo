/**
 * One call to OpenAI's Responses API with plain fetch (no SDK dependency).
 * Strict JSON schema output, a timeout, and capped output tokens. Throws on any problem;
 * enrich.ts catches it and falls back to preview mode.
 */
import type { z } from "zod";
import { aiConfig, LIMITS } from "./config";
import { toOpenAiSchema } from "./schemas";

export type Content =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "low" | "high" }
  // A whole PDF (menus): OpenAI reads its text and looks at each page as an image
  | { type: "input_file"; filename: string; file_data: string };

export interface CallResult<T> {
  data: T;
  usage: { input: number; output: number };
}

export async function callOpenAi<T>(opts: {
  model: string;
  system: string;
  content: Content[];
  schema: z.ZodType<T>;
  schemaName: string;
  /** Defaults to LIMITS.outputTokens / LIMITS.timeoutMs */
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<CallResult<T>> {
  const key = aiConfig.apiKey;
  if (!key) throw new Error("No OpenAI key");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? LIMITS.timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        // No hidden reasoning: reasoning tokens count toward max_output_tokens, and these are
        // summarize-and-format tasks where the whole budget should go to the answer.
        reasoning: { effort: "none" },
        max_output_tokens: opts.maxOutputTokens ?? LIMITS.outputTokens,
        store: false,
        input: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.content },
        ],
        text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: toOpenAiSchema(opts.schema) } },
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${body?.error?.message ?? "request failed"}`);
    if (body?.status !== "completed") throw new Error(`OpenAI response ${body?.status ?? "unknown"} (${body?.incomplete_details?.reason ?? "no reason"})`);

    // The REST response has no output_text shortcut: find the message's text part.
    const text = (body.output ?? [])
      .flatMap((item: { type: string; content?: { type: string; text?: string }[] }) => (item.type === "message" ? (item.content ?? []) : []))
      .find((part: { type: string }) => part.type === "output_text")?.text;
    if (!text) throw new Error("OpenAI returned no text");

    // Validate even though the schema was enforced: never trust what comes back over the wire.
    const data = opts.schema.parse(JSON.parse(text));
    return { data, usage: { input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0 } };
  } finally {
    clearTimeout(timer);
  }
}
