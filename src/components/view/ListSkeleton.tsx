import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

/** Placeholder cards or rows shaped like the real content, shown while the list loads. */
export function ListSkeleton({ mode }: { mode: "card" | "table" | "detailed" }) {
  if (mode === "table") {
    return (
      <Card className="divide-y divide-border-soft" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="size-4" />
            <Skeleton className="size-9" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </Card>
    );
  }
  if (mode === "detailed") {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-10 w-2/3 rounded-full" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} className="space-y-4 p-5">
          <Skeleton className="size-4" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-12" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="size-16 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}
