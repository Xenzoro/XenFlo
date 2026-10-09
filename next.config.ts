import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The enrich and menus routes read the prompt files at runtime; make sure Vercel bundles them.
  outputFileTracingIncludes: {
    "/api/enrich": ["./prompts/**/*.md"],
    "/api/menus": ["./prompts/**/*.md"],
  },
};

export default nextConfig;
