import { cn } from "@/lib/utils/cn";

/** Gray pulsing placeholder shown while content loads. Size it with className. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-border-soft", className)} />;
}
