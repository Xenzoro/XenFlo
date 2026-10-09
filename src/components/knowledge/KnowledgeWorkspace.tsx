"use client";

/*
  The /knowledge page: scrape bar -> progress -> results (tabs) or an error card.
  Owns the network actions (scrape, dig deeper, save) and the toast; everything
  about the knowledge base itself lives in KnowledgeContext.
*/
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { ADVANCED_TABS, useKnowledge, type TabKey } from "@/context/KnowledgeContext";
import { digDeeper, saveKnowledge, scrapeUrl, type ApiError } from "@/lib/api/client";
import { friendlyError } from "@/lib/api/messages";
import { Card, SectionLabel } from "@/components/ui/Card";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { Toast, type ToastData } from "@/components/ui/Toast";
import { CrawlSummary } from "./CrawlSummary";
import { FooterNote } from "./FooterNote";
import { ResultsHeader } from "./ResultsHeader";
import { ScrapeBar } from "./ScrapeBar";
import { ScrapeErrorCard } from "./ScrapeErrorCard";
import { ScrapeProgress } from "./ScrapeProgress";
import { BrandTab } from "./tabs/BrandTab";
import { CompanyTab } from "./tabs/CompanyTab";
import { ContentKitTab } from "./tabs/ContentKitTab";
import { CustomersTab } from "./tabs/CustomersTab";
import { InsightsTab } from "./tabs/InsightsTab";
import { OfferingsTab } from "./tabs/OfferingsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { PeopleTab } from "./tabs/PeopleTab";
import { RawJsonTab } from "./tabs/RawJsonTab";
import { SourcesTab } from "./tabs/SourcesTab";

const BASIC_TABS: TabItem<TabKey>[] = [
  { key: "overview", label: "Overview" },
  { key: "company", label: "Company" },
  { key: "customers", label: "Customers" },
  { key: "brand", label: "Brand" },
  { key: "people", label: "People" },
  { key: "offerings", label: "Offerings" },
];

const POWER_TABS: TabItem<TabKey>[] = [
  { key: "insights", label: "Insights" },
  { key: "contentKit", label: "Content Kit" },
  { key: "sources", label: "Sources" },
  { key: "json", label: "Raw JSON" },
];

type Status = "idle" | "loading" | "error" | "done";

export function KnowledgeWorkspace() {
  const { kb, loadKb, saved, markSaved, dirty, advanced, tab, setTab, setBusy } = useKnowledge();
  const [status, setStatus] = useState<Status>("idle");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [digging, setDigging] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  // Turning Advanced view off while on an advanced tab falls back to Overview
  useEffect(() => {
    if (!advanced && ADVANCED_TABS.includes(tab)) setTab("overview");
  }, [advanced, tab, setTab]);

  async function scrape(target: string) {
    if (dirty && !window.confirm("Start a new scrape? Your unsaved changes will be lost.")) return;
    setUrl(target);
    setStatus("loading");
    setError(null);
    const res = await scrapeUrl(target);
    if (res.error) {
      setError(res.error);
      setStatus("error");
      return;
    }
    loadKb(res.data);
    setTab("overview");
    setStatus("done");
  }

  async function dig() {
    if (!kb) return;
    setDigging(true);
    setBusy(true); // pause editing so nothing typed during the crawl gets overwritten
    const before = { pages: kb.crawl.pages.length, score: kb.completeness.score };
    const res = await digDeeper(kb);
    setDigging(false);
    setBusy(false);
    if (res.error) {
      const f = friendlyError(res.error.code);
      setToast({ tone: "error", title: f.title, text: f.text });
      return;
    }
    loadKb(res.data);
    const added = res.data.crawl.pages.length - before.pages;
    setToast({
      tone: "success",
      title: added ? `Read ${added} more ${added === 1 ? "page" : "pages"}` : "No new pages to read",
      text: `Knowledge Health ${before.score} → ${res.data.completeness.score}`,
    });
  }

  async function save() {
    if (!kb) return;
    setSaving(true);
    setBusy(true);
    const res = await saveKnowledge(kb, saved);
    setSaving(false);
    setBusy(false);
    if (res.error) {
      const f = friendlyError(res.error.code);
      setToast({ tone: "error", title: f.title, text: f.text });
      return;
    }
    markSaved(res.data);
    setToast({
      tone: "success",
      title: `Saved ${res.data.companyName} (version ${res.data.version})`,
      text: "Your knowledge base is stored and ready for Flo.",
      link: { href: `/knowledge/view?id=${res.data.id}`, label: "View saved knowledge base →" },
    });
  }

  const showResults = status === "done" && kb;

  return (
    <div className="space-y-4">
      {!showResults && (
        <div className="pt-2">
          <SectionLabel>Knowledge</SectionLabel>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Build your knowledge base</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">Paste your website and Flo reads it for you: your story, offerings, brand, people and more. Then review and edit anything.</p>
        </div>
      )}

      <ScrapeBar loading={status === "loading"} onScrape={scrape} initialUrl={url} />

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
        {status === "loading" && <ScrapeProgress key="loading" url={url} />}
        {status === "error" && error && <ScrapeErrorCard key="error" error={error} onRetry={() => scrape(url)} />}
        {showResults && (
          <motion.div key="results" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <ResultsHeader onSave={save} saving={saving} />
            <CrawlSummary kb={kb} />
            <div data-tour="tabs">
              <Tabs items={advanced ? [...BASIC_TABS, ...POWER_TABS] : BASIC_TABS} active={tab} onChange={setTab} />
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                {tab === "overview" && <OverviewTab />}
                {tab === "company" && <CompanyTab />}
                {tab === "customers" && <CustomersTab />}
                {tab === "brand" && <BrandTab />}
                {tab === "people" && <PeopleTab />}
                {tab === "offerings" && <OfferingsTab />}
                {tab === "insights" && <InsightsTab />}
                {tab === "contentKit" && <ContentKitTab />}
                {tab === "sources" && <SourcesTab onDigDeeper={dig} digging={digging} />}
                {tab === "json" && <RawJsonTab />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <FooterNote />
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
