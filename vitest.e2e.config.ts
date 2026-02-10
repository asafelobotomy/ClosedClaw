import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const cpuCount = os.cpus().length;
const e2eWorkers = isCI ? 2 : Math.min(4, Math.max(1, Math.floor(cpuCount * 0.25)));

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
    maxWorkers: e2eWorkers,
    include: ["test/**/*.e2e.test.ts", "src/**/*.e2e.test.ts"],
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
