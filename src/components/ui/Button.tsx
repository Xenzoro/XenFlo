import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  // Disabled primary buttons turn light blue, like MoFlo
  primary: "bg-primary text-white hover:bg-primary-hover disabled:bg-primary-light",
  secondary: "border border-border bg-card text-ink hover:bg-page disabled:text-subtle",
  ghost: "text-muted hover:bg-page hover:text-ink disabled:text-subtle",
  danger: "text-danger hover:bg-danger-soft disabled:text-subtle",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button */
  loading?: boolean;
  icon?: React.ReactNode;
}

/** Button classes, so a link can look like a button (a <button> inside an <a> isn't valid HTML). */
export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-full font-medium transition-colors disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

/** Pill-shaped button. */
export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button type="button" disabled={disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
