import { cn } from "@/lib/utils/cn";

/** Friendly placeholder for an empty section: icon, title, short text and an optional action. */
export function EmptyState({
  icon,
  title,
  text,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  text?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-8 text-center", className)}>
      {icon && <div className="mb-3 text-subtle">{icon}</div>}
      <p className="text-sm font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-xs text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
