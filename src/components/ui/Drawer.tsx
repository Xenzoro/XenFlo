"use client";

/** Side panel that slides in from the right (full width on phones). Esc or the backdrop closes it. */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { SectionLabel } from "./Card";
import { useDialog } from "./useDialog";

export function Drawer({
  open,
  onClose,
  label,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label?: string;
  title: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useDialog(open, panel);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[65]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
          <motion.aside
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="absolute inset-y-0 right-0 flex w-full flex-col bg-card shadow-2xl outline-none sm:max-w-md"
          >
            <header className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div className="min-w-0">
                {label && <SectionLabel>{label}</SectionLabel>}
                <h2 className="truncate text-lg font-bold">{title}</h2>
              </div>
              <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-subtle hover:bg-page hover:text-ink">
                <X className="size-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
