"use client";

/*
  Dropdown menu. Items stagger in: each slides down and fades in ~40ms after the previous.
  Rendered in a portal with fixed positioning so it isn't clipped by scrolling containers
  (like the table's horizontal scroll). Follows its trigger on scroll; closes on outside click or Esc.
*/
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a divider above this item */
  separated?: boolean;
  /** Marks the current choice (e.g. the active sort) */
  checked?: boolean;
}

const list = { open: { transition: { staggerChildren: 0.04 } }, closed: {} };
const item = { closed: { opacity: 0, y: -6 }, open: { opacity: 1, y: 0 } };

export function Menu({
  trigger,
  items,
  label,
  align = "right",
}: {
  /** Renders the button; spread the props onto it */
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu"; ref: React.Ref<HTMLButtonElement> }) => React.ReactNode;
  items: MenuItem[];
  label: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  // Place the menu under the trigger, flipping up if it would run off the bottom
  const place = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const height = items.length * 38 + 12;
    const top = r.bottom + height + 8 > window.innerHeight ? Math.max(8, r.top - height - 4) : r.bottom + 4;
    // Keep the whole menu on screen (it's min-w-48 = 192px until it has rendered)
    const width = menuRef.current?.offsetWidth ?? 192;
    const maxLeft = window.innerWidth - width - 8;
    if (align === "right") setPos({ top, right: Math.max(8, window.innerWidth - r.right) });
    else setPos({ top, left: Math.max(8, Math.min(r.left, maxLeft)) });
  }, [align, items.length]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const raf = requestAnimationFrame(place); // again once the real width is known
    return () => cancelAnimationFrame(raf);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Follow the trigger when anything scrolls (closing instead broke tapping a pill
    // inside a horizontal scroller on phones, since the tap itself scrolls it a little)
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return (
    <>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu", ref: triggerRef })}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.ul
                ref={menuRef}
                role="menu"
                aria-label={label}
                initial="closed"
                animate="open"
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                variants={list}
                style={{ position: "fixed", ...pos }}
                className="z-[60] min-w-48 rounded-2xl border border-border bg-card p-1.5 shadow-lg"
              >
                {items.map((it) => (
                  <motion.li key={it.label} variants={item} className={cn(it.separated && "mt-1 border-t border-border-soft pt-1")}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={it.disabled}
                      onClick={() => {
                        setOpen(false);
                        it.onSelect();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        it.danger ? "text-danger hover:bg-danger-soft" : it.checked ? "bg-primary-soft text-primary" : "hover:bg-page",
                      )}
                    >
                      <span className="flex size-4 items-center justify-center">{it.icon}</span>
                      {it.label}
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
