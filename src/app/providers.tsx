"use client";

import { MotionConfig } from "framer-motion";

/** App-wide client providers. reducedMotion="user" turns off movement for people who ask their OS to reduce motion. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
