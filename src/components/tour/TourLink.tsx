"use client";

/** "Take a tour" in the top bar (only on /knowledge, where the tour's elements live). */
import { usePathname } from "next/navigation";
import { Compass } from "lucide-react";
import { TOUR_EVENT } from "./tourStorage";

export function TourLink() {
  if (usePathname() !== "/knowledge") return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
    >
      <Compass className="size-4" />
      <span className="hidden sm:inline">Take a tour</span>
      <span className="sr-only sm:hidden">Take a tour</span>
    </button>
  );
}
