import type { ClosedClawPluginApi } from "../../src/plugins/types.js";
import { createLlmTaskTool } from "./src/llm-task-tool.js";

export default function register(api: ClosedClawPluginApi) {
  api.registerTool(createLlmTaskTool(api), { optional: true });
}
