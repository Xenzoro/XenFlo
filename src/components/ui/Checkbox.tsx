"use client";

import { useEffect, useRef } from "react";

/** Checkbox in the brand blue. `indeterminate` shows a dash (used by "select all" when only some are picked). */
export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // indeterminate can only be set from JavaScript, not as an HTML attribute
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="size-4 shrink-0 cursor-pointer rounded accent-primary"
    />
  );
}
