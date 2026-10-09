"use client";

/** "Add info yourself": paste or upload more content into the knowledge base being edited. */
import { useState } from "react";
import { X } from "lucide-react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { Modal } from "@/components/ui/Modal";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { UploadPanel, type UploadResult } from "./UploadPanel";

export function AddInfoModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const { kb, loadKb } = useKnowledge();
  const [consented, setConsented] = useState(false);

  function handle(result: UploadResult) {
    loadKb(result.knowledgeBase); // merged result; unsaved until Save
    onDone(result.message);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="add-info-title" wide>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="add-info-title" className="text-lg font-bold">
            Add info yourself
          </h2>
          <p className="mt-0.5 text-sm text-muted">Paste text or upload files. We only fill empty fields, so nothing you already have changes.</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-subtle hover:bg-page hover:text-ink">
          <X className="size-5" />
        </button>
      </div>
      <div className="mt-4 space-y-4">
        <ConsentCheckbox checked={consented} onChange={setConsented} />
        {kb && <UploadPanel consented={consented} base={kb} onResult={handle} />}
      </div>
    </Modal>
  );
}
