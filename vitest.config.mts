import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for server-side code (scraper, AI helpers). Mirrors the "@/..." path alias from tsconfig.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
