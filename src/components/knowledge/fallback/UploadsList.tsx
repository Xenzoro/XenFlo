"use client";

/** Everything the user pasted or uploaded, with screenshot thumbnails (loaded through short-lived signed URLs). */
import { useEffect, useState } from "react";
import { FileCode, FileText, ImageIcon } from "lucide-react";
import type { UploadRecord } from "@/types/knowledge";
import { signedUploadUrl } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils/time";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { fieldName } from "../fieldLabels";

function Thumb({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    signedUploadUrl(path).then((res) => live && (res.data ? setUrl(res.data) : setFailed(true)));
    return () => {
      live = false;
    };
  }, [path]);
  // Fixed 64px box so nothing shifts when the image arrives
  if (failed) return <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-page text-subtle"><ImageIcon className="size-5" /></span>;
  if (!url) return <Skeleton className="size-16 shrink-0" />;
  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL
  return <img src={url} alt={`Screenshot ${name}`} className="size-16 shrink-0 rounded-lg bg-page object-cover" />;
}

export function UploadsList({ uploads }: { uploads: UploadRecord[] }) {
  if (!uploads.length) return <p className="text-sm text-muted">Nothing uploaded or pasted.</p>;
  return (
    <ul className="space-y-2">
      {uploads.map((u) => (
        <li key={u.id} className="flex items-center gap-3 rounded-2xl border border-border-soft p-2">
          {u.kind === "screenshot" && u.path ? (
            <Thumb path={u.path} name={u.name} />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              {u.kind === "html" ? <FileCode className="size-6" /> : <FileText className="size-6" />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{u.name}</p>
            <p className="text-xs text-muted">
              {u.kind === "screenshot" ? "Screenshot" : u.kind === "html" ? "HTML file" : "Text"} ·{" "}
              {u.kind === "screenshot" ? `${(u.size / 1024).toFixed(0)} KB` : `${u.size.toLocaleString()} characters`} · {formatDateTime(u.uploadedAt)}
            </p>
            {u.needsAiFields.length > 0 && (
              <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                <Badge tone="purple">Waiting for AI</Badge>
                {u.needsAiFields.map(fieldName).join(", ")}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
