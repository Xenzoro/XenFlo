"use client";

/** A small notification that floats in at the bottom and hides itself after a few seconds. */
import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

export interface ToastData {
  tone: "success" | "error";
  title: string;
  text?: string;
  link?: { href: string; label: string };
}

export function Toast({ toast, onClose }: { toast: ToastData | null; onClose: () => void }) {
  // Auto-dismiss; errors stay a little longer so they can be read
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onClose, toast.tone === "error" ? 9000 : 6000);
    return () => window.clearTimeout(t);
  }, [toast, onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 sm:bottom-6">
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg"
          >
            {toast.tone === "success" ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <AlertCircle className="size-5 shrink-0 text-danger" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.text && <p className="mt-0.5 text-xs text-muted">{toast.text}</p>}
              {toast.link && (
                <Link href={toast.link.href} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                  {toast.link.label}
                </Link>
              )}
            </div>
            <button type="button" aria-label="Dismiss" onClick={onClose} className="text-subtle hover:text-ink">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
