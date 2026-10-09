import { Suspense } from "react";
import type { Metadata } from "next";
import { KnowledgeProvider } from "@/context/KnowledgeContext";
import { KnowledgeWorkspace } from "@/components/knowledge/KnowledgeWorkspace";

export const metadata: Metadata = { title: "Knowledge | XenFlo" };

export default function KnowledgePage() {
  return (
    <KnowledgeProvider>
      {/* Suspense is required because the workspace reads ?id= with useSearchParams */}
      <Suspense>
        <KnowledgeWorkspace />
      </Suspense>
    </KnowledgeProvider>
  );
}
