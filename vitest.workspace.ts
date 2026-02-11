import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "./vitest.unit.config.ts",
  "./vitest.extensions.config.ts",
  "./vitest.gateway.config.ts",
  "./vitest.e2e.config.ts",
  "./vitest.live.config.ts",
]);
