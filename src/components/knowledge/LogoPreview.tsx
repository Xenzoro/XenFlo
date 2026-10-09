"use client";

/**
 * A logo on a checkerboard. White or light logos are detected and shown on a
 * dark background so they stay visible; the small toggle lets the user flip it.
 */
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** The preview background a logo needs. */
type Backdrop = "light" | "dark";

// File names and alt text that usually mean a white logo ("logo-white.png", "Reversed logo").
const LIGHT_HINT = /white|light|reverse|inverse|negative|knockout/i;

/**
 * Pick the background a logo needs: dark for white or light logos, light otherwise.
 * Reads the pixels when the host allows it (CORS); otherwise falls back to the file name.
 */
function useLogoBackdrop(url: string, alt: string | null): Backdrop {
  const hint: Backdrop = LIGHT_HINT.test(`${url} ${alt ?? ""}`) ? "dark" : "light";
  const [measured, setMeasured] = useState<{ url: string; backdrop: Backdrop } | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous"; // without this the canvas is "tainted" and can't be read
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const g = canvas.getContext("2d");
        if (!g) return;
        g.drawImage(img, 0, 0, size, size);
        const { data } = g.getImageData(0, 0, size, size);
        let lum = 0;
        let opaque = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 40) continue; // transparent pixel
          lum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
          opaque++;
        }
        const transparentShare = 1 - opaque / (size * size);
        // Light only if the visible pixels are bright AND the image has see-through areas;
        // a logo already sitting on its own white box looks fine on a light background.
        const lightLogo = opaque > 0 && lum / opaque > 0.8 && transparentShare > 0.1;
        if (!cancelled) setMeasured({ url, backdrop: lightLogo ? "dark" : "light" });
      } catch {
        // Cross-origin image without CORS headers: keep the file name hint.
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return measured?.url === url ? measured.backdrop : hint;
}

export function LogoPreview({ url, alt }: { url: string; alt: string | null }) {
  const detected = useLogoBackdrop(url, alt);
  // Once the user picks a background, their choice wins over detection.
  const [chosen, setChosen] = useState<Backdrop | null>(null);
  const backdrop = chosen ?? detected;
  const dark = backdrop === "dark";

  return (
    <div
      className={cn(
        "relative flex h-24 items-center justify-center rounded-xl bg-[length:16px_16px] p-3 transition-colors",
        // Checkerboard so transparent logos stay visible
        dark
          ? "bg-[repeating-conic-gradient(#1f2937_0%_25%,#273244_0%_50%)]"
          : "bg-[repeating-conic-gradient(#f1f3f6_0%_25%,#fff_0%_50%)]",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote logos from any domain */}
      <img src={url} alt={alt ?? "Logo"} className="max-h-full max-w-full object-contain" loading="lazy" />
      <div className="absolute bottom-1.5 right-1.5 flex rounded-full border border-border bg-white/90 p-0.5 shadow-sm">
        {(["light", "dark"] as const).map((option) => {
          const active = backdrop === option;
          const Icon = option === "light" ? Sun : Moon;
          const label = option === "light" ? "Light background" : "Dark background";
          return (
            <button
              key={option}
              type="button"
              onClick={() => setChosen(option)}
              aria-pressed={active}
              aria-label={label}
              title={label}
              className={cn(
                "flex size-5 items-center justify-center rounded-full transition-colors",
                active ? "bg-primary text-white" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="size-3" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
