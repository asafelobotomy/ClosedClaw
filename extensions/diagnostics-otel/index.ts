import type { ClosedClawPluginApi } from "ClosedClaw/plugin-sdk";
import { emptyPluginConfigSchema } from "ClosedClaw/plugin-sdk";
import { createDiagnosticsOtelService } from "./src/service.js";

const plugin = {
  id: "diagnostics-otel",
  name: "Diagnostics OpenTelemetry",
  description: "Export diagnostics events to OpenTelemetry",
  configSchema: emptyPluginConfigSchema(),
  register(api: ClosedClawPluginApi) {
    api.registerService(createDiagnosticsOtelService());
  },
};

export default plugin;
