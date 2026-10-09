import Link from "next/link";
import { Sparkles } from "lucide-react";

/** Top bar with the app name, like MoFlo Cloud's header. */
export function TopBar() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur sm:px-6">
      <Link href="/knowledge" className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-white">
          <Sparkles className="size-4" />
        </span>
        <span className="text-lg font-bold tracking-tight">
          Xen<span className="text-primary">Flo</span>
        </span>
      </Link>
      <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted">Demo workspace</span>
    </header>
  );
}
