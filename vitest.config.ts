// Force UTC timezone so date-sensitive tests are deterministic across machines.
process.env.TZ = "UTC";

import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts", "src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirror the "@/" alias used by Next.js (tsconfig paths)
      "@": resolve(__dirname, "./src"),
    },
  },
});
