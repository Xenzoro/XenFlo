"use client";

/** A record's logo on a light tile, or a building icon when there's none (or it fails to load). */
import { useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function RecordLogo({ url, name, className }: { url: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-page", className)}>
      {url && !broken ? (
        // The faint drop-shadow outlines white logos so they don't vanish on the light tile
        // eslint-disable-next-line @next/next/no-img-element -- logos come from any domain
        <img
          src={url}
          alt={`${name} logo`}
          className="max-h-[70%] max-w-[80%] object-contain [filter:drop-shadow(0_0_1px_rgb(0_0_0/0.45))]"
          onError={() => setBroken(true)}
          loading="lazy"
        />
      ) : (
        <Building2 className="size-1/2 text-subtle" />
      )}
    </span>
  );
}
