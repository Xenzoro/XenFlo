"use client";

/*
  Shows a font name written in that font. We try to load it from Google Fonts by
  adding a <link> tag once per family; if it isn't a Google font the browser just
  falls back to the default font, which is fine.
*/
import { useEffect } from "react";

const loaded = new Set<string>();

export function FontPreview({ family }: { family: string }) {
  useEffect(() => {
    if (loaded.has(family)) return;
    loaded.add(family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;
    document.head.appendChild(link);
  }, [family]);

  return (
    <span className="flex items-baseline gap-3" style={{ fontFamily: `"${family}", sans-serif` }}>
      <span className="text-base">{family}</span>
      <span className="text-xs text-muted">Aa Bb Cc 123</span>
    </span>
  );
}
