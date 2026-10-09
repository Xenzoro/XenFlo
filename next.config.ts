import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The enrich route reads the prompt files at runtime; make sure Vercel bundles them.
  outputFileTracingIncludes: {
    "/api/enrich": ["./prompts/**/*.md"],
  },
};

export default nextConfig;
