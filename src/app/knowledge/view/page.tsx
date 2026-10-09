import Link from "next/link";
import { Library } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

// Placeholder until the management page is built (Phase 5).
export default function SavedKnowledgePage() {
  return (
    <Card className="p-6">
      <EmptyState
        icon={<Library className="size-8" />}
        title="Saved knowledge bases are coming soon"
        text="Your knowledge base was saved to the database. The page to browse, search and edit saved records is next."
        action={
          <Link href="/knowledge" className="text-sm font-medium text-primary hover:underline">
            Back to Knowledge
          </Link>
        }
      />
    </Card>
  );
}
