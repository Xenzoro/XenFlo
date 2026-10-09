import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

/** Text input with MoFlo styling. `invalid` turns the border red. */
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none transition-shadow placeholder:text-subtle focus:shadow-glow",
          invalid ? "border-danger focus:border-danger" : "border-border focus:border-primary",
          className,
        )}
        {...rest}
      />
    );
  },
);

/** Multi-line version of Input. */
export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none transition-shadow placeholder:text-subtle focus:border-primary focus:shadow-glow",
          className,
        )}
        {...rest}
      />
    );
  },
);
