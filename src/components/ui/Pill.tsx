import { Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Rounded chip for tags and values. `active` turns it blue (used by filters). */
export function Pill({
  active,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium",
        active ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/** Dashed "+ Add" pill used for empty states ("+ year", "+ count", "+ Add"). */
export function AddPill({ label = "Add", onClick, disabled }: { label?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Add ${label}`}
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-3 py-1 text-xs font-medium text-primary transition-colors hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus className="size-3" />
      {label}
    </button>
  );
}
