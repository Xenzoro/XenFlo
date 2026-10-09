"use client";

/*
  Centered dialog: the page dims and the panel fades and floats up into place.
  Esc or clicking the backdrop closes it (unless `busy`, so a running action can't be abandoned).
*/
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

export function Modal({
  open,
  onClose,
  busy,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  labelledBy?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** "Are you sure?" dialog for destructive or slow actions. */
export function ConfirmModal({
  open,
  title,
  text,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  text: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} busy={busy} labelledBy="confirm-title">
      <div className="flex items-start gap-4">
        {danger && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <AlertTriangle className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 id="confirm-title" className="font-semibold">
            {title}
          </h2>
          <div className="mt-1 text-sm text-muted">{text}</div>
          {children}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onConfirm} loading={busy} className={danger ? "bg-danger hover:bg-red-700 disabled:bg-red-300" : undefined}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
