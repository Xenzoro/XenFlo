import type { CrawlLogEntry } from "@/types/knowledge";
import { cn } from "@/lib/utils/cn";

/** The scraper's step-by-step log. Warnings are amber, errors red, "Looking for:" lines blue. */
export function CrawlLog({ log, className }: { log: CrawlLogEntry[]; className?: string }) {
  return (
    <ol className={cn("max-h-72 space-y-1 overflow-y-auto rounded-xl bg-page p-3 font-mono text-[11px] leading-5", className)}>
      {log.map((entry, i) => {
        const lookingFor = entry.message.startsWith("Looking for");
        return (
          <li
            key={i}
            className={cn(
              "flex gap-2",
              entry.level === "error" ? "text-danger" : entry.level === "warn" ? "text-warning" : lookingFor ? "font-semibold text-primary" : "text-muted",
            )}
          >
            <span className="shrink-0 text-subtle">{new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <span className="break-all">{entry.message}</span>
          </li>
        );
      })}
    </ol>
  );
}
