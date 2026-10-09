"use client";

/*
  The results area: header (name, health, Advanced toggle, Save), crawl summary,
  tabs and the active tab. Used by /knowledge after a scrape and by the Detailed view.
*/
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ADVANCED_TABS, useKnowledge, type TabKey } from "@/context/KnowledgeContext";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { CrawlSummary } from "./CrawlSummary";
import { AddInfoModal } from "./fallback/AddInfoModal";
import { LowScoreBanner } from "./fallback/LowScoreBanner";
import { ResultsHeader } from "./ResultsHeader";
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

export function KnowledgeResults({
  onSave,
  saving,
  onDigDeeper,
  digging,
  onNotify,
}: {
  onSave: () => void;
  saving: boolean;
  onDigDeeper: () => void;
  digging: boolean;
  /** Report "Add info yourself" results (shown as a toast by the page) */
  onNotify: (message: string) => void;
}) {
  const { kb, advanced, tab, setTab } = useKnowledge();
  const [addingInfo, setAddingInfo] = useState(false);

  // Turning Advanced view off while on an advanced tab falls back to Overview
  useEffect(() => {
    if (!advanced && ADVANCED_TABS.includes(tab)) setTab("overview");
  }, [advanced, tab, setTab]);

  if (!kb) return null;

  return (
    <div className="space-y-4">
      <ResultsHeader onSave={onSave} saving={saving} />
      {kb.crawl.pages.length > 0 && <CrawlSummary kb={kb} />}
      <LowScoreBanner onDigDeeper={onDigDeeper} digging={digging} onAddInfo={() => setAddingInfo(true)} />
      <AddInfoModal open={addingInfo} onClose={() => setAddingInfo(false)} onDone={onNotify} />
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
          {tab === "sources" && <SourcesTab onDigDeeper={onDigDeeper} digging={digging} />}
          {tab === "json" && <RawJsonTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
