import { createJiti } from "jiti";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ClosedClawConfig } from "../config/config.js";
import type { GatewayRequestHandler } from "../gateway/server-methods/types.js";
import type {
  ClosedClawPluginDefinition,
  ClosedClawPluginModule,
  PluginDiagnostic,
  PluginLogger,
} from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveUserPath } from "../utils.js";
import { clearPluginCommands } from "./commands.js";
import {
  normalizePluginsConfig,
  resolveEnableState,
  resolveMemorySlotDecision,
  type NormalizedPluginsConfig,
} from "./config-state.js";
import { discoverClosedClawPlugins } from "./discovery.js";
import { initializeGlobalHookRunner } from "./hook-runner-global.js";
import { loadPluginManifestRegistry } from "./manifest-registry.js";
import { createPluginRegistry, type PluginRecord, type PluginRegistry } from "./registry.js";
import { setActivePluginRegistry } from "./runtime.js";
import { createPluginRuntime } from "./runtime/index.js";
import { validateJsonSchemaValue } from "./schema-validator.js";
import {
  clawtalkBeforeAgentStartHandler,
  clawtalkMessageSendingHandler,
  updateClawTalkHookConfig,
} from "../agents/clawtalk/clawtalk-hook.js";
import {
  scanSkillsDirectory,
  validatePermissions,
  loadClawsFile,
} from "../agents/clawtalk/claws-parser.js";
import {
  kernelShieldBeforeToolCallHandler,
  registerSkillForShield,
  updateKernelShieldConfig,
} from "../agents/clawtalk/kernel-shield-hook.js";

export type PluginLoadResult = PluginRegistry;

export type PluginLoadOptions = {
  config?: ClosedClawConfig;
  workspaceDir?: string;
  logger?: PluginLogger;
  coreGatewayHandlers?: Record<string, GatewayRequestHandler>;
  cache?: boolean;
  mode?: "full" | "validate";
};

const registryCache = new Map<string, PluginRegistry>();

const defaultLogger = () => createSubsystemLogger("plugins");

const resolvePluginSdkAlias = (): string | null => {
  try {
    const modulePath = fileURLToPath(import.meta.url);
    const isDistRuntime = modulePath.split(path.sep).includes("dist");
    const preferDist = process.env.VITEST || process.env.NODE_ENV === "test" || isDistRuntime;
    let cursor = path.dirname(modulePath);
    for (let i = 0; i < 6; i += 1) {
      const srcCandidate = path.join(cursor, "src", "plugin-sdk", "index.ts");
      const distCandidate = path.join(cursor, "dist", "plugin-sdk", "index.js");
      const orderedCandidates = preferDist
        ? [distCandidate, srcCandidate]
        : [srcCandidate, distCandidate];
      for (const candidate of orderedCandidates) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) {
        break;
      }
      cursor = parent;
    }
  } catch {
    // ignore
  }
  return null;
};

function buildCacheKey(params: {
  workspaceDir?: string;
  plugins: NormalizedPluginsConfig;
}): string {
  const workspaceKey = params.workspaceDir ? resolveUserPath(params.workspaceDir) : "";
  return `${workspaceKey}::${JSON.stringify(params.plugins)}`;
}

function validatePluginConfig(params: {
  schema?: Record<string, unknown>;
  cacheKey?: string;
  value?: unknown;
}): { ok: boolean; value?: Record<string, unknown>; errors?: string[] } {
  const schema = params.schema;
  if (!schema) {
    return { ok: true, value: params.value as Record<string, unknown> | undefined };
  }
  const cacheKey = params.cacheKey ?? JSON.stringify(schema);
  const result = validateJsonSchemaValue({
    schema,
    cacheKey,
    value: params.value ?? {},
  });
  if (result.ok) {
    return { ok: true, value: params.value as Record<string, unknown> | undefined };
  }
  return { ok: false, errors: result.errors };
}

function resolvePluginModuleExport(moduleExport: unknown): {
  definition?: ClosedClawPluginDefinition;
  register?: ClosedClawPluginDefinition["register"];
} {
  const resolved =
    moduleExport &&
    typeof moduleExport === "object" &&
    "default" in (moduleExport as Record<string, unknown>)
      ? (moduleExport as { default: unknown }).default
      : moduleExport;
  if (typeof resolved === "function") {
    return {
      register: resolved as ClosedClawPluginDefinition["register"],
    };
  }
  if (resolved && typeof resolved === "object") {
    const def = resolved as ClosedClawPluginDefinition;
    const register = def.register ?? def.activate;
    return { definition: def, register };
  }
  return {};
}

function createPluginRecord(params: {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  source: string;
  origin: PluginRecord["origin"];
  workspaceDir?: string;
  enabled: boolean;
  configSchema: boolean;
}): PluginRecord {
  return {
    id: params.id,
    name: params.name ?? params.id,
    description: params.description,
    version: params.version,
    source: params.source,
    origin: params.origin,
    workspaceDir: params.workspaceDir,
    enabled: params.enabled,
    status: params.enabled ? "loaded" : "disabled",
    toolNames: [],
    hookNames: [],
    channelIds: [],
    providerIds: [],
    gatewayMethods: [],
    cliCommands: [],
    services: [],
    commands: [],
    httpHandlers: 0,
    hookCount: 0,
    configSchema: params.configSchema,
    configUiHints: undefined,
    configJsonSchema: undefined,
  };
}

function pushDiagnostics(diagnostics: PluginDiagnostic[], append: PluginDiagnostic[]) {
  diagnostics.push(...append);
}

export function loadClosedClawPlugins(options: PluginLoadOptions = {}): PluginRegistry {
  const cfg = options.config ?? {};
  const logger = options.logger ?? defaultLogger();
  const validateOnly = options.mode === "validate";
  const normalized = normalizePluginsConfig(cfg.plugins);
  const cacheKey = buildCacheKey({
    workspaceDir: options.workspaceDir,
    plugins: normalized,
  });
  const cacheEnabled = options.cache !== false;
  if (cacheEnabled) {
    const cached = registryCache.get(cacheKey);
    if (cached) {
      setActivePluginRegistry(cached, cacheKey);
      return cached;
    }
  }

  // Clear previously registered plugin commands before reloading
  clearPluginCommands();

  const runtime = createPluginRuntime();
  const { registry, createApi } = createPluginRegistry({
    logger,
    runtime,
    coreGatewayHandlers: options.coreGatewayHandlers as Record<string, GatewayRequestHandler>,
  });

  const discovery = discoverClosedClawPlugins({
    workspaceDir: options.workspaceDir,
    extraPaths: normalized.loadPaths,
  });
  const manifestRegistry = loadPluginManifestRegistry({
    config: cfg,
    workspaceDir: options.workspaceDir,
    cache: options.cache,
    candidates: discovery.candidates,
    diagnostics: discovery.diagnostics,
  });
  pushDiagnostics(registry.diagnostics, manifestRegistry.diagnostics);

  const pluginSdkAlias = resolvePluginSdkAlias();
  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
    extensions: [".ts", ".tsx", ".mts", ".cts", ".mtsx", ".ctsx", ".js", ".mjs", ".cjs", ".json"],
    ...(pluginSdkAlias
      ? {
          alias: { "ClosedClaw/plugin-sdk": pluginSdkAlias },
        }
      : {}),
  });

  const manifestByRoot = new Map(
    manifestRegistry.plugins.map((record) => [record.rootDir, record]),
  );

  const seenIds = new Map<string, PluginRecord["origin"]>();
  const memorySlot = normalized.slots.memory;
  let selectedMemoryPluginId: string | null = null;
  let memorySlotMatched = false;

  for (const candidate of discovery.candidates) {
    const manifestRecord = manifestByRoot.get(candidate.rootDir);
    if (!manifestRecord) {
      continue;
    }
    const pluginId = manifestRecord.id;
    const existingOrigin = seenIds.get(pluginId);
    if (existingOrigin) {
      const record = createPluginRecord({
        id: pluginId,
        name: manifestRecord.name ?? pluginId,
        description: manifestRecord.description,
        version: manifestRecord.version,
        source: candidate.source,
        origin: candidate.origin,
        workspaceDir: candidate.workspaceDir,
        enabled: false,
        configSchema: Boolean(manifestRecord.configSchema),
      });
      record.status = "disabled";
      record.error = `overridden by ${existingOrigin} plugin`;
      registry.plugins.push(record);
      continue;
    }

    const enableState = resolveEnableState(pluginId, candidate.origin, normalized);
    const entry = normalized.entries[pluginId];
    const record = createPluginRecord({
      id: pluginId,
      name: manifestRecord.name ?? pluginId,
      description: manifestRecord.description,
      version: manifestRecord.version,
      source: candidate.source,
      origin: candidate.origin,
      workspaceDir: candidate.workspaceDir,
      enabled: enableState.enabled,
      configSchema: Boolean(manifestRecord.configSchema),
    });
    record.kind = manifestRecord.kind;
    record.configUiHints = manifestRecord.configUiHints;
    record.configJsonSchema = manifestRecord.configSchema;

    if (!enableState.enabled) {
      record.status = "disabled";
      record.error = enableState.reason;
      registry.plugins.push(record);
      seenIds.set(pluginId, candidate.origin);
      continue;
    }

    if (!manifestRecord.configSchema) {
      record.status = "error";
      record.error = "missing config schema";
      registry.plugins.push(record);
      seenIds.set(pluginId, candidate.origin);
      registry.diagnostics.push({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: record.error,
      });
      continue;
    }

    let mod: ClosedClawPluginModule | null = null;
    try {
      mod = jiti(candidate.source) as ClosedClawPluginModule;
    } catch (err) {
      logger.error(`[plugins] ${record.id} failed to load from ${record.source}: ${String(err)}`);
      record.status = "error";
      record.error = String(err);
      registry.plugins.push(record);
      seenIds.set(pluginId, candidate.origin);
      registry.diagnostics.push({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `failed to load plugin: ${String(err)}`,
      });
      continue;
    }

    const resolved = resolvePluginModuleExport(mod);
    const definition = resolved.definition;
    const register = resolved.register;

    if (definition?.id && definition.id !== record.id) {
      registry.diagnostics.push({
        level: "warn",
        pluginId: record.id,
        source: record.source,
        message: `plugin id mismatch (config uses "${record.id}", export uses "${definition.id}")`,
      });
    }

    record.name = definition?.name ?? record.name;
    record.description = definition?.description ?? record.description;
    record.version = definition?.version ?? record.version;
    const manifestKind = record.kind as string | undefined;
    const exportKind = definition?.kind as string | undefined;
    if (manifestKind && exportKind && exportKind !== manifestKind) {
      registry.diagnostics.push({
        level: "warn",
        pluginId: record.id,
        source: record.source,
        message: `plugin kind mismatch (manifest uses "${manifestKind}", export uses "${exportKind}")`,
      });
    }
    record.kind = definition?.kind ?? record.kind;

    if (record.kind === "memory" && memorySlot === record.id) {
      memorySlotMatched = true;
    }

    const memoryDecision = resolveMemorySlotDecision({
      id: record.id,
      kind: record.kind,
      slot: memorySlot,
      selectedId: selectedMemoryPluginId,
    });

    if (!memoryDecision.enabled) {
      record.enabled = false;
      record.status = "disabled";
      record.error = memoryDecision.reason;
      registry.plugins.push(record);
      seenIds.set(pluginId, candidate.origin);
      continue;
    }

    if (memoryDecision.selected && record.kind === "memory") {
      selectedMemoryPluginId = record.id;
    }

    const validatedConfig = validatePluginConfig({
      schema: manifestRecord.configSchema,
      cacheKey: manifestRecord.schemaCacheKey,
      value: entry?.config,
    });

    if (!validatedConfig.ok) {
      logger.error(`[plugins] ${record.id} invalid config: ${validatedConfig.errors?.join(", ")}`);
      record.status = "error";
      record.error = `invalid config: ${validatedConfig.errors?.join(", ")}`;
      registry.plugins.push(record);
      seenIds.set(pluginId, candidate.origin);
      registry.diagnostics.push({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: record.error,
      });
      continue;
    }

    if (validateOnly) {
      registry.plugins.push(record);
      seenIds.set(pluginId, candidate.origin);
      continue;
    }

    if (typeof register !== "function") {
      logger.error(`[plugins] ${record.id} missing register/activate export`);
      record.status = "error";
      record.error = "plugin export missing register/activate";
      registry.plugins.push(record);
      seenIds.set(pluginId, candidate.origin);
      registry.diagnostics.push({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: record.error,
      });
      continue;
    }

    const api = createApi(record, {
      config: cfg,
      pluginConfig: validatedConfig.value,
    });

    try {
      const result = register(api);
      if (result && typeof result.then === "function") {
        registry.diagnostics.push({
          level: "warn",
          pluginId: record.id,
          source: record.source,
          message: "plugin register returned a promise; async registration is ignored",
        });
      }
      registry.plugins.push(record);
      seenIds.set(pluginId, candidate.origin);
    } catch (err) {
      logger.error(
        `[plugins] ${record.id} failed during register from ${record.source}: ${String(err)}`,
      );
      record.status = "error";
      record.error = String(err);
      registry.plugins.push(record);
      seenIds.set(pluginId, candidate.origin);
      registry.diagnostics.push({
        level: "error",
        pluginId: record.id,
        source: record.source,
        message: `plugin failed during register: ${String(err)}`,
      });
    }
  }

  if (typeof memorySlot === "string" && !memorySlotMatched) {
    registry.diagnostics.push({
      level: "warn",
      message: `memory slot plugin not found or not marked as memory: ${memorySlot}`,
    });
  }

  if (cacheEnabled) {
    registryCache.set(cacheKey, registry);
  }
  setActivePluginRegistry(registry, cacheKey);

  // Register the built-in ClawTalk before_agent_start hook if enabled in any agent config.
  registerClawTalkHookIfEnabled(registry, cfg);

  // Register the Kernel Shield before_tool_call hook if enabled in security config.
  registerKernelShieldHookIfEnabled(registry, cfg);

  // Load .claws skill files (async, non-blocking for startup).
  void loadClawTalkSkillFiles(cfg);

  initializeGlobalHookRunner(registry);
  return registry;
}

/**
 * Register ClawTalk's built-in `before_agent_start` hook into the plugin registry
 * when ClawTalk is enabled anywhere in the config (agent-level or defaults-level).
 */
function registerClawTalkHookIfEnabled(
  registry: PluginRegistry,
  cfg: Partial<ClosedClawConfig>,
): void {
  // Check if any agent has clawtalk.enabled, or if there's a defaults-level setting.
  const agents = cfg.agents?.list ?? [];
  const anyEnabled = agents.some((a) => (a as Record<string, unknown>).clawtalk && ((a as Record<string, unknown>).clawtalk as Record<string, unknown>).enabled === true);

  if (!anyEnabled) {
    return;
  }

  // Find the first enabled agent's clawtalk config to seed initial settings.
  const firstClawtalk = agents
    .map((a) => (a as Record<string, unknown>).clawtalk as Record<string, unknown> | undefined)
    .find((ct) => ct?.enabled === true);

  if (firstClawtalk) {
    updateClawTalkHookConfig({
      enabled: true,
      escalationThreshold: typeof firstClawtalk.escalationThreshold === "number"
        ? firstClawtalk.escalationThreshold
        : undefined,
      escalationModel: typeof firstClawtalk.escalationModel === "string"
        ? firstClawtalk.escalationModel
        : undefined,
      compressionLevel: typeof firstClawtalk.compression === "string"
        ? (firstClawtalk.compression as "off" | "transport")
        : undefined,
    } as Partial<import("../agents/clawtalk/types.js").ClawTalkConfig>);
  }

  // Register into the typed hooks array so the hook runner picks it up.
  registry.typedHooks.push({
    pluginId: "closedclaw:clawtalk",
    hookName: "before_agent_start",
    handler: clawtalkBeforeAgentStartHandler,
    priority: 1000, // High priority: ClawTalk routing should run first
    source: "src/agents/clawtalk/clawtalk-hook.ts",
  });

  registry.typedHooks.push({
    pluginId: "closedclaw:clawtalk",
    hookName: "message_sending",
    handler: clawtalkMessageSendingHandler,
    priority: 1000,
    source: "src/agents/clawtalk/clawtalk-hook.ts",
  });
}

/**
 * Register the Kernel Shield `before_tool_call` hook when security.kernelShield
 * is enabled in the config. Uses priority 900 (below ClawTalk's 1000) so
 * shield evaluation runs early in the hook chain.
 */
function registerKernelShieldHookIfEnabled(
  registry: PluginRegistry,
  cfg: Partial<ClosedClawConfig>,
): void {
  const shieldCfg = (cfg as Record<string, unknown>).security as
    | { kernelShield?: Record<string, unknown> }
    | undefined;
  if (!shieldCfg?.kernelShield?.enabled) {
    return;
  }

  updateKernelShieldConfig(
    shieldCfg.kernelShield as Parameters<typeof updateKernelShieldConfig>[0],
  );

  registry.typedHooks.push({
    pluginId: "closedclaw:kernel-shield",
    hookName: "before_tool_call",
    handler: kernelShieldBeforeToolCallHandler,
    priority: 900,
    source: "src/agents/clawtalk/kernel-shield-hook.ts",
  });

  const logger = defaultLogger();
  const enforcement = shieldCfg.kernelShield.enforcement;
  const enforcementLabel =
    typeof enforcement === "string" ||
    typeof enforcement === "number" ||
    typeof enforcement === "boolean"
      ? String(enforcement)
      : "permissive";
  logger.info?.(
    `[kernel-shield] Hook registered (enforcement=${enforcementLabel})`,
  );
}

/**
 * Load .claws skill files from `~/.closedclaw/skills/` and validate permissions.
 *
 * Runs asynchronously after registry setup — skill file loading does not block
 * gateway startup. Warnings are logged but do not prevent operation.
 */
async function loadClawTalkSkillFiles(
  _cfg: Partial<ClosedClawConfig>,
): Promise<void> {
  const logger = defaultLogger();
  try {
    const summaries = await scanSkillsDirectory();
    if (summaries.length === 0) {
      logger.debug?.("[clawtalk] No .claws skill files found in ~/.closedclaw/skills/");
      return;
    }

    logger.info?.(`[clawtalk] Found ${summaries.length} skill file(s)`);

    // Load each file and validate permissions
    for (const summary of summaries) {
      try {
        const clawsFile = await loadClawsFile(summary.filePath);

        // Validate permissions — log warnings for dangerous capabilities
        const { warnings } = validatePermissions(clawsFile.manifest);
        for (const warning of warnings) {
          logger.warn?.(
            `[clawtalk] Skill "${clawsFile.manifest.id}" permission warning: ${warning}`,
          );
        }

        // Register skill with the Kernel Shield for enforcement
        registerSkillForShield(clawsFile);

        logger.debug?.(
          `[clawtalk] Loaded skill: ${clawsFile.manifest.id} v${clawsFile.manifest.version}`,
        );
      } catch (err) {
        logger.warn?.(
          `[clawtalk] Failed to load skill file ${summary.filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    logger.warn?.(
      `[clawtalk] Failed to scan skills directory: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
