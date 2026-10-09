"use client";

/*
  The /knowledge page: scrape bar -> progress -> results (tabs) or an error card.
  With ?id=<uuid> it opens a saved knowledge base for editing instead of scraping.
  Save / Dig deeper live in useKnowledgeActions; the knowledge base itself in KnowledgeContext.
*/
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useKnowledge } from "@/context/KnowledgeContext";
import { getKnowledge, scrapeUrl, type ApiError } from "@/lib/api/client";
import { BLOCKED_CODES } from "@/lib/api/messages";
import { emptyKnowledgeBase } from "@/lib/utils/knowledge";
import { Card, SectionLabel } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { FooterNote } from "./FooterNote";
import { BlockedPanel } from "./fallback/BlockedPanel";
import type { UploadResult } from "./fallback/UploadPanel";
import { KnowledgeResults } from "./KnowledgeResults";
import { ScrapeBar } from "./ScrapeBar";
import { ScrapeErrorCard } from "./ScrapeErrorCard";
import { ScrapeProgress } from "./ScrapeProgress";
import { useKnowledgeActions } from "./useKnowledgeActions";
import { Tour } from "@/components/tour/Tour";
import { TOUR_EVENT, isTourDone, markTourDone } from "@/components/tour/tourStorage";
import type { TourStep } from "@/components/tour/tourSteps";

// "opening" = loading a saved record from ?id=
type Status = "idle" | "loading" | "opening" | "error" | "done";

export function KnowledgeWorkspace() {
  const { kb, loadKb, markSaved, dirty, setTab } = useKnowledge();
  const openId = useSearchParams().get("id");
  const [status, setStatus] = useState<Status>(openId ? "opening" : "idle");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const actions = useKnowledgeActions({ linkToSaved: true });
  const opened = useRef<string | null>(null);

  // Open a saved record when the URL has ?id= (from "Open in editor" on the Saved page)
  useEffect(() => {
    if (!openId || opened.current === openId) return;
    opened.current = openId;
    setStatus("opening");
    getKnowledge(openId).then((res) => {
      if (res.error) {
        setError(res.error);
        setStatus("error");
        return;
      }
      markSaved(res.data);
      setUrl(res.data.url);
      setTab("overview");
      setStatus("done");
    });
  }, [openId, markSaved, setTab]);

  async function scrape(target: string, opts: { ownerConsent?: boolean } = {}) {
    if (dirty && !opts.ownerConsent && !window.confirm("Start a new scrape? Your unsaved changes will be lost.")) return;
    setUrl(target);
    setStatus("loading");
    setError(null);
    const res = await scrapeUrl(target, opts);
    if (res.error) {
      setError(res.error);
      setStatus("error");
      return;
    }
    loadKb(res.data);
    setTab("overview");
    setStatus("done");
  }

  /** Content pasted or uploaded from the blocked screen becomes the knowledge base. */
  function handleUploaded(result: UploadResult) {
    loadKb(result.knowledgeBase);
    setTab("overview");
    setStatus("done");
    actions.setToast({ tone: "success", title: "Knowledge base started", text: result.message });
  }

  /** "Add info manually": an empty knowledge base for this site, opened on the Company tab. */
  function startManual() {
    const blank = emptyKnowledgeBase(url || "https://uploaded.content/");
    blank.crawl.finishedAt = blank.crawl.startedAt;
    loadKb(blank);
    setTab("company");
    setStatus("done");
  }

  const showResults = status === "done" && kb;

  // Tour: opens by itself the first time results appear, or from "Take a tour" anytime
  const [touring, setTouring] = useState(false);
  useEffect(() => {
    const start = () => setTouring(true);
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, []);
  const hasResults = !!showResults; // a boolean, so edits to the KB don't re-run this
  useEffect(() => {
    if (!hasResults || isTourDone()) return;
    const t = window.setTimeout(() => setTouring(true), 700); // let the results animate in first
    return () => window.clearTimeout(t);
  }, [hasResults]);
  const endTour = useCallback(() => {
    markTourDone();
    setTouring(false);
  }, []);
  const prepareStep = useCallback((step: TourStep) => step.id === "health" && setTab("overview"), [setTab]);

  const blocked = status === "error" && error && BLOCKED_CODES.has(error.code);

  return (
    <div className="space-y-4">
      {!showResults && (
        <div className="pt-2">
          <SectionLabel>Knowledge</SectionLabel>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Build your knowledge base</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">Paste your website and Flo reads it for you: your story, offerings, brand, people and more. Then review and edit anything.</p>
        </div>
      )}

      {/* key: show the opened record's URL once it loads */}
      <ScrapeBar key={url} loading={status === "loading"} onScrape={scrape} initialUrl={url.replace(/^https?:\/\//, "").replace(/\/$/, "")} />

      <AnimatePresence mode="wait">
        {status === "idle" && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Sparkles className="size-6" />
              </span>
              <p className="mt-4 font-semibold">Your knowledge base will appear here</p>
              <p className="mt-1 max-w-sm text-xs text-muted">We read up to 15 pages, respect robots.txt, and label where every detail came from.</p>
            </Card>
          </motion.div>
        )}
        {status === "opening" && (
          <motion.div key="opening" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-10 w-2/3 rounded-full" />
            <Skeleton className="h-72 rounded-2xl" />
          </motion.div>
        )}
        {status === "loading" && <ScrapeProgress key="loading" url={url} />}
        {blocked && (
          <BlockedPanel
            key="blocked"
            error={error}
            url={url}
            onContinue={() => scrape(url, { ownerConsent: true })}
            onResult={handleUploaded}
            onManual={startManual}
          />
        )}
        {status === "error" && error && !blocked && <ScrapeErrorCard key="error" error={error} onRetry={url ? () => scrape(url) : undefined} />}
        {showResults && (
          <motion.div key="results" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <KnowledgeResults
              onSave={actions.save}
              saving={actions.saving}
              onDigDeeper={actions.dig}
              digging={actions.digging}
              onNotify={(text) => actions.setToast({ tone: "success", title: "Added your info", text })}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <FooterNote />
      <Toast toast={actions.toast} onClose={actions.closeToast} />
      <Tour open={touring} hasResults={hasResults} onBeforeStep={prepareStep} onClose={endTour} />
    </div>
  );
}
