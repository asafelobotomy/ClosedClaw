import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "ClosedClaw/plugin-sdk": path.join(repoRoot, "src", "plugin-sdk", "index.ts"),
      "@": path.join(repoRoot, "src"),
      "@test": path.join(repoRoot, "test"),
    },
  },
  test: {
    pool: "forks",
    maxWorkers: 1,
    include: ["src/**/*.live.test.ts"],
    setupFiles: ["test/setup.ts"],
    exclude: [
      "dist/**",
      "apps/macos/**",
      "apps/macos/.build/**",
      "**/vendor/**",
      "dist/ClosedClaw.app/**",
    ],
  },
});
