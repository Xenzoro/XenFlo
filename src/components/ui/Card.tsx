import { cn } from "@/lib/utils/cn";

/** White rounded card with a soft border and shadow. The basic MoFlo surface. */
export function Card({
  className,
  selected,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { selected?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card shadow-card",
        // Selected or flagged cards get a blue outline
        selected ? "border-primary ring-2 ring-primary/20" : "border-border",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Small uppercase gray label, like MoFlo's "LAST 7 DAYS". */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-semibold uppercase tracking-wider text-subtle", className)}>{children}</p>;
}

/** A card with an uppercase title, a small gray subtitle and optional right-side action. */
export function SectionCard({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}
