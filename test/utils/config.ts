/**
 * Config Test Utilities
 * 
 * Helper functions for creating and manipulating test configurations.
 */

import type { ClosedClawConfig } from '../../src/config/config.js';

/**
 * Create a minimal valid test config
 */
export function createTestConfig(overrides: Partial<ClosedClawConfig> = {}): ClosedClawConfig {
  return {
    agents: {
      main: {
        model: 'claude-3.5-sonnet',
        systemPrompt: 'You are a test assistant.',
      },
    },
    channels: {},
    plugins: {},
    security: {
      encryption: {
        enabled: false, // Disabled for tests
      },
    },
    ...overrides,
  } as ClosedClawConfig;
}

/**
 * Create a config with specific agent configuration
 */
export function createTestAgentConfig(
  agentId: string,
  config: Partial<ClosedClawConfig['agents'][string]> = {}
): ClosedClawConfig {
  return createTestConfig({
    agents: {
      [agentId]: {
        model: 'claude-3.5-sonnet',
        systemPrompt: `Test agent: ${agentId}`,
        ...config,
      },
    },
  });
}

/**
 * Create a config with specific channel configuration
 */
export function createTestChannelConfig(
  channelId: string,
  config: any = {}
): ClosedClawConfig {
  return createTestConfig({
    channels: {
      [channelId]: {
        enabled: true,
        ...config,
      },
    },
  });
}

/**
 * Create a config with security features enabled
 */
export function createTestSecurityConfig(
  features: {
    encryption?: boolean;
    signing?: boolean;
    audit?: boolean;
    keychain?: boolean;
  } = {}
): ClosedClawConfig {
  return createTestConfig({
    security: {
      encryption: {
        enabled: features.encryption ?? false,
      },
      signing: features.signing
        ? {
            requireSignature: true,
            minTrustLevel: 'full',
          }
        : undefined,
      audit: features.audit
        ? {
            enabled: true,
          }
        : undefined,
      keychain: features.keychain
        ? {
            backend: 'auto',
          }
        : undefined,
    },
  });
}
