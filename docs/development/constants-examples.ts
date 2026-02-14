/**
 * Practical Constants Usage Examples
 *
 * Real-world scenarios demonstrating how the constants library simplifies
 * common ClosedClaw development tasks.
 */

import {
  // Environment variables
  ENV_CLOSEDCLAW_GATEWAY_PORT,
  ENV_CLOSEDCLAW_GATEWAY_TOKEN,
  ENV_ANTHROPIC_API_KEY,

  // Default values
  DEFAULT_GATEWAY_PORT,

  // URL builders
  buildGatewayHttpUrl,
  buildGatewayRpcUrl,
  buildGatewayStatusUrl,

  // Platform detection
  isCI,
  isTest,
  isLiveTest,
  isWindows,
  getRunnerOS,

  // Network constants
  HTTP_TIMEOUT_DEFAULT_MS,
  HTTP_TIMEOUT_LONG_MS,
} from "@/config/constants";

// ============================================================================
// Example 1: Gateway Client Setup
// ============================================================================

export function createGatewayClient() {
  // Read gateway port from environment, fallback to default
  const port = parseInt(
    process.env[ENV_CLOSEDCLAW_GATEWAY_PORT] ?? String(DEFAULT_GATEWAY_PORT),
    10,
  );

  // Read optional gateway token
  const token = process.env[ENV_CLOSEDCLAW_GATEWAY_TOKEN];

  // Build URLs using centralized builders
  const baseUrl = buildGatewayHttpUrl(port);
  const rpcUrl = buildGatewayRpcUrl(port);
  const statusUrl = buildGatewayStatusUrl(port);

  // Use environment-aware timeout
  const timeout = isCI() ? HTTP_TIMEOUT_LONG_MS : HTTP_TIMEOUT_DEFAULT_MS;

  return {
    baseUrl,
    rpcUrl,
    statusUrl,
    token,
    timeout,
  };
}

// Usage:
// const client = createGatewayClient();
// console.log(`Connecting to ${client.rpcUrl} with ${client.timeout}ms timeout`);

// ============================================================================
// Example 2: Test Environment Configuration
// ============================================================================

export function getTestConfig() {
  // Environment detection
  const environment = {
    isTest: isTest(),
    isCI: isCI(),
    isLive: isLiveTest(),
    os: getRunnerOS(),
  };

  // Platform-specific settings
  const platformConfig = {
    shellPath: isWindows() ? "cmd.exe" : "/bin/bash",
    homeVar: isWindows() ? "USERPROFILE" : "HOME",
    pathSeparator: isWindows() ? ";" : ":",
  };

  // Gateway configuration for tests
  const gateway = {
    port: DEFAULT_GATEWAY_PORT,
    url: buildGatewayHttpUrl(),
    rpcUrl: buildGatewayRpcUrl(),
  };

  // API keys (mocked unless live test)
  const credentials = {
    anthropic: environment.isLive ? process.env[ENV_ANTHROPIC_API_KEY] : "sk-test-mock-key",
  };

  return {
    environment,
    platformConfig,
    gateway,
    credentials,
  };
}

// Usage in test:
// describe("integration tests", () => {
//   const config = getTestConfig();
//
//   beforeAll(() => {
//     if (config.environment.isCI) {
//       // CI-specific setup
//     }
//   });
// });

// ============================================================================
// Example 3: Multi-Environment Provider Configuration
// ============================================================================

export function getProviderConfig() {
  const env = {
    isCI: isCI(),
    isTest: isTest(),
    isLive: isLiveTest(),
  };

  // Different configurations based on environment
  if (env.isLive) {
    // Live tests: use real credentials
    return {
      anthropicKey: process.env[ENV_ANTHROPIC_API_KEY],
      timeout: HTTP_TIMEOUT_LONG_MS,
      retries: 3,
      mockMode: false,
    };
  }

  if (env.isCI) {
    // CI: strict timeouts, mocked providers
    return {
      anthropicKey: "sk-mock-ci-key",
      timeout: HTTP_TIMEOUT_DEFAULT_MS,
      retries: 1,
      mockMode: true,
    };
  }

  // Development: relaxed timeouts, mocked providers
  return {
    anthropicKey: "sk-mock-dev-key",
    timeout: HTTP_TIMEOUT_LONG_MS,
    retries: 3,
    mockMode: true,
  };
}

// Usage:
// const config = getProviderConfig();
// const provider = new AnthropicProvider({
//   apiKey: config.anthropicKey,
//   timeout: config.timeout,
// });

// ============================================================================
// Example 4: Platform-Aware Path Resolution
// ============================================================================

export function resolvePaths() {
  const homeVar = isWindows() ? "USERPROFILE" : "HOME";
  const homeDir = process.env[homeVar];

  if (!homeDir) {
    throw new Error(`${homeVar} environment variable not set`);
  }

  // Platform-aware path separator
  const pathSep = isWindows() ? "\\" : "/";

  // Build platform-appropriate paths
  const stateDir = `${homeDir}${pathSep}.closedclaw`;
  const configFile = `${stateDir}${pathSep}config.json5`;
  const credentialsDir = `${stateDir}${pathSep}credentials`;

  return {
    homeDir,
    stateDir,
    configFile,
    credentialsDir,
    pathSep,
  };
}

// Usage:
// const paths = resolvePaths();
// console.log(`Config: ${paths.configFile}`);

// ============================================================================
// Example 5: CI-Specific Gateway Startup
// ============================================================================

export async function startGatewayForCI() {
  if (!isCI()) {
    throw new Error("This function is only for CI environments");
  }

  const runnerOS = getRunnerOS();

  // Platform-specific CI optimizations
  const config = {
    port: DEFAULT_GATEWAY_PORT,
    host: "127.0.0.1",
    timeout: runnerOS === "Windows" ? HTTP_TIMEOUT_LONG_MS : HTTP_TIMEOUT_DEFAULT_MS,
    workers: runnerOS === "Windows" ? 1 : 2, // Windows CI is slower
    logLevel: "error" as const, // Reduce CI noise
  };

  console.log(`Starting gateway for ${runnerOS} CI...`);
  console.log(`URL: ${buildGatewayHttpUrl(config.port, config.host)}`);
  console.log(`Timeout: ${config.timeout}ms`);
  console.log(`Workers: ${config.workers}`);

  // Return config for further setup
  return config;
}

// Usage in CI:
// if (isCI()) {
//   const config = await startGatewayForCI();
//   // Start gateway with CI-specific settings
// }

// ============================================================================
// Example 6: Comprehensive Diagnostic Report
// ============================================================================

export function generateDiagnostics() {
  return {
    environment: {
      isCI: isCI(),
      isTest: isTest(),
      isLive: isLiveTest(),
      runnerOS: getRunnerOS(),
      platform: isWindows() ? "Windows" : isMacOS() ? "macOS" : "Linux",
    },
    gateway: {
      port: process.env[ENV_CLOSEDCLAW_GATEWAY_PORT] ?? String(DEFAULT_GATEWAY_PORT),
      httpUrl: buildGatewayHttpUrl(),
      rpcUrl: buildGatewayRpcUrl(),
      statusUrl: buildGatewayStatusUrl(),
      hasToken: Boolean(process.env[ENV_CLOSEDCLAW_GATEWAY_TOKEN]),
    },
    credentials: {
      hasAnthropicKey: Boolean(process.env[ENV_ANTHROPIC_API_KEY]),
    },
    network: {
      defaultTimeout: HTTP_TIMEOUT_DEFAULT_MS,
      longTimeout: HTTP_TIMEOUT_LONG_MS,
    },
  };
}

// Usage:
// const diagnostics = generateDiagnostics();
// console.log(JSON.stringify(diagnostics, null, 2));

// ============================================================================
// Summary
// ============================================================================

/**
 * Benefits Demonstrated:
 *
 * 1. Type Safety
 *    - Autocomplete for all constant names
 *    - Compile-time error detection
 *    - No typos in environment variable names
 *
 * 2. Consistency
 *    - Single source of truth for ports/URLs
 *    - Uniform URL formatting across codebase
 *    - Platform-aware defaults
 *
 * 3. Maintainability
 *    - Change port once, update everywhere
 *    - Easy to add new environment variables
 *    - Clear intent with named constants
 *
 * 4. Testing
 *    - Environment-aware test configuration
 *    - Platform-specific CI optimizations
 *    - Easy mock/live switching
 *
 * 5. Developer Experience
 *    - Self-documenting code
 *    - Reduced cognitive load
 *    - Faster onboarding
 */
