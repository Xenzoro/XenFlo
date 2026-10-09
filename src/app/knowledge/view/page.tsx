import { Suspense } from "react";
import type { Metadata } from "next";
import { SavedWorkspace } from "@/components/view/SavedWorkspace";
import { ListSkeleton } from "@/components/view/ListSkeleton";

export const metadata: Metadata = { title: "Saved knowledge | XenFlo" };

export default function SavedKnowledgePage() {
  return (
    // Suspense is required because the page reads its view from the URL with useSearchParams
    <Suspense fallback={<ListSkeleton mode="card" />}>
      <SavedWorkspace />
    </Suspense>
  );
}
