"use client";

/*
  First-visit spotlight tour. The page dims, and one blue glowing highlight moves and
  resizes smoothly (a Framer Motion spring) from element to element, with a small card
  explaining each. Skip / Back / Next, progress dots, and keyboard support:
  Esc skips, ← and → move between steps.

  The dimming is a huge box-shadow around the highlight, so the highlighted element
  stays bright without being cloned or moved.
*/
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { TOUR_STEPS, type TourStep } from "./tourSteps";

const PAD = 8; // space between the element and the highlight ring
const CARD_W = 320;

type Rect = { top: number; left: number; width: number; height: number };

/** The element's box plus padding, clipped to the screen (wide scrolling rows can extend past it). */
function measure(el: Element): Rect {
  const r = el.getBoundingClientRect();
  const left = Math.max(4, r.left - PAD);
  const right = Math.min(window.innerWidth - 4, r.right + PAD);
  return { top: r.top - PAD, left, width: Math.max(0, right - left), height: r.height + PAD * 2 };
}

export function Tour({
  open,
  hasResults,
  onBeforeStep,
  onClose,
}: {
  open: boolean;
  /** Results on screen? Without them only the scrape bar step can be shown. */
  hasResults: boolean;
  /** Lets the page prepare a step (e.g. switch to the Overview tab for the gauge) */
  onBeforeStep: (step: TourStep) => void;
  /** Called when finished or skipped */
  onClose: () => void;
}) {
  const steps = TOUR_STEPS.filter((s) => hasResults || !s.needsResults);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Prepare the step, bring its element into view, then measure it
  useLayoutEffect(() => {
    if (!open || !step) return;
    onBeforeStep(step);
    let raf = 0;
    const update = () => {
      const el = document.querySelector(step.selector);
      if (el) setRect(measure(el));
    };
    const settle = window.setTimeout(() => {
      document.querySelector(step.selector)?.scrollIntoView({ block: "center", behavior: "smooth" });
      update();
    }, 60);
    // Keep the highlight glued to the element while the page scrolls or resizes
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.clearTimeout(settle);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, step, onBeforeStep]);

  const next = useCallback(() => (last ? onClose() : setIndex((i) => i + 1)), [last, onClose]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Keyboard: Esc skips, arrows move. Focus stays on the Next button.
  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === "Tab") {
        // keep focus inside the tour card
        const card = nextRef.current?.closest("[role=dialog]");
        const focusables = card ? Array.from(card.querySelectorAll<HTMLElement>("button:not([disabled])")) : [];
        if (focusables.length) {
          const i = focusables.indexOf(document.activeElement as HTMLElement);
          const to = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1) : (i + 1) % focusables.length;
          focusables[to].focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, next, back, onClose]);

  if (typeof document === "undefined") return null;

  // Card goes below the highlight, or above it when there's no room; always on screen
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(CARD_W, vw - 32);
  const below = rect ? rect.top + rect.height + 12 : vh / 2;
  const placeAbove = rect && below + 220 > vh && rect.top > 240;
  const cardTop = rect ? (placeAbove ? Math.max(16, rect.top - 12 - 200) : Math.min(below, vh - 230)) : vh / 2 - 100;
  const cardLeft = rect ? Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 16) : vw / 2 - cardW / 2;

  return createPortal(
    <AnimatePresence>
      {open && step && (
        <motion.div className="fixed inset-0 z-[80]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {/* The highlight: its giant shadow is the dimmed page */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute rounded-2xl ring-2 ring-primary"
            initial={false}
            animate={rect ?? { top: vh / 2, left: vw / 2, width: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            style={{ boxShadow: "0 0 0 9999px rgb(15 23 42 / 0.55), 0 0 28px 6px rgb(37 99 235 / 0.55)" }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            aria-describedby="tour-text"
            className="absolute rounded-2xl bg-card p-5 shadow-2xl"
            style={{ width: cardW }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, top: cardTop, left: cardLeft }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="size-3.5" /> Step {index + 1} of {steps.length}
            </p>
            <div aria-live="polite">
              <h2 id="tour-title" className="mt-1 font-bold">
                {step.title}
              </h2>
              <p id="tour-text" className="mt-1 text-sm text-muted">
                {step.text}
                {!hasResults && last && " Scrape a site to see the rest of the tour."}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              {/* Progress dots */}
              <div className="flex gap-1.5" aria-hidden>
                {steps.map((s, i) => (
                  <motion.span key={s.id} className={cn("h-1.5 rounded-full", i === index ? "bg-primary" : "bg-border")} animate={{ width: i === index ? 18 : 6 }} />
                ))}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Skip
                </Button>
                {index > 0 && (
                  <Button variant="secondary" size="sm" onClick={back}>
                    Back
                  </Button>
                )}
                <Button ref={nextRef} size="sm" onClick={next}>
                  {last ? "Done" : "Next"}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
