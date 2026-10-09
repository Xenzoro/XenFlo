import type { Metadata } from "next";
import { KnowledgeProvider } from "@/context/KnowledgeContext";
import { KnowledgeWorkspace } from "@/components/knowledge/KnowledgeWorkspace";

export const metadata: Metadata = { title: "Knowledge | XenFlo" };

export default function KnowledgePage() {
  return (
    <KnowledgeProvider>
      <KnowledgeWorkspace />
    </KnowledgeProvider>
  );
}
