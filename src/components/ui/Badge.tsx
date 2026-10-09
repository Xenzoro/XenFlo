import type { Confidence } from "@/types/knowledge";
import { cn } from "@/lib/utils/cn";

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "purple";

const TONES: Record<Tone, string> = {
  gray: "bg-page text-muted border-border",
  blue: "bg-primary-soft text-primary border-primary/20",
  green: "bg-success-soft text-success border-success/20",
  amber: "bg-warning-soft text-warning border-warning/20",
  red: "bg-danger-soft text-danger border-danger/20",
  purple: "bg-violet-50 text-violet-600 border-violet-200",
};

/** Tiny rounded label. */
export function Badge({ tone = "gray", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// How each confidence level is shown to the user.
const CONFIDENCE: Record<Confidence, { label: string; tone: Tone }> = {
  scraped: { label: "Scraped", tone: "green" },
  inferred: { label: "Inferred", tone: "amber" },
  ai_mock: { label: "AI preview", tone: "purple" },
  ai_live: { label: "AI", tone: "purple" },
  user_edited: { label: "User edited", tone: "blue" },
  missing: { label: "Missing", tone: "gray" },
};

export { isAi } from "@/lib/utils/fields";

/** Badge saying where a value came from. Shown on every field in Advanced view, and on AI values always. */
export function ConfidenceBadge({ confidence, source, evidence }: { confidence: Confidence; source?: string | null; evidence?: string[] }) {
  const { label, tone } = CONFIDENCE[confidence];
  // Tooltip: what the value is based on (AI evidence), or where it was read
  const title = evidence?.length ? `Based on:\n${evidence.map((e) => `• ${e}`).join("\n")}` : source ? `Source: ${source}` : undefined;
  return (
    <span title={title}>
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}
