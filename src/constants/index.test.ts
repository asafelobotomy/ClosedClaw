/**
 * Tests for centralized constants library.
 *
 * Validates:
 * - Security constants meet OWASP/NIST guidelines
 * - Type safety and immutability
 * - Value correctness
 * - No regressions from migration
 */

import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  LIMITS,
  NETWORK,
  PATHS,
  SECURITY,
  resolveGatewayLockDir,
  resolveSubdir,
} from "./index.js";

describe("SECURITY constants", () => {
  describe("encryption", () => {
    it("should use secure encryption algorithm", () => {
      expect(SECURITY.ENCRYPTION.ALGORITHM).toBe("xchacha20-poly1305");
    });

    it("should use OWASP-recommended KDF", () => {
      expect(SECURITY.ENCRYPTION.KDF).toBe("argon2id");
    });

    it("should meet OWASP Argon2id minimums", () => {
      const { memory, iterations, parallelism, keyLength } = SECURITY.ENCRYPTION.KDF_PARAMS;

      // OWASP 2022: minimum 46 MB memory, 1 iteration for interactive
      // We exceed this with 64 MB and 3 iterations
      expect(memory).toBeGreaterThanOrEqual(46 * 1024); // 46 MB in KiB
      expect(iterations).toBeGreaterThanOrEqual(1);
      expect(parallelism).toBeGreaterThanOrEqual(1);
      expect(keyLength).toBe(32); // 256-bit key for XChaCha20
    });

    it("should default to opt-in encryption", () => {
      expect(SECURITY.ENCRYPTION.DEFAULT_CONFIG.enabled).toBe(false);
    });

    it("should be type-safe (compile-time immutability)", () => {
      // TypeScript enforces immutability via `as const`
      // Runtime mutation is still possible but TypeScript prevents it
      const _algorithm: "xchacha20-poly1305" = SECURITY.ENCRYPTION.ALGORITHM;
      expect(_algorithm).toBe("xchacha20-poly1305");
    });
  });

  describe("passphrase", () => {
    it("should enforce minimum passphrase length", () => {
      // NIST recommends 8+, we require 12+
      expect(SECURITY.PASSPHRASE.MIN_LENGTH).toBeGreaterThanOrEqual(12);
    });

    it("should require character diversity", () => {
      expect(SECURITY.PASSPHRASE.REQUIRED_CHAR_TYPES).toBeGreaterThanOrEqual(3);
    });

    it("should have weak pattern detection", () => {
      expect(SECURITY.PASSPHRASE.WEAK_PATTERNS).toContain("password");
      expect(SECURITY.PASSPHRASE.WEAK_PATTERNS).toContain("closedclaw");
      expect(SECURITY.PASSPHRASE.WEAK_PATTERNS).toContain("qwerty");
      expect(SECURITY.PASSPHRASE.WEAK_PATTERNS.length).toBeGreaterThan(5);
    });

    it("should enforce secure file permissions", () => {
      expect(SECURITY.PASSPHRASE.FILE_MODE).toBe(0o600); // Owner read/write only
    });

    it("should use correct environment variable", () => {
      expect(SECURITY.PASSPHRASE.ENV_VAR).toBe("ClosedClaw_PASSPHRASE");
    });
  });

  describe("sandbox", () => {
    it("should default to mandatory sandboxing", () => {
      expect(SECURITY.SANDBOX.MODE).toBe("all");
    });

    it("should have reasonable timeout", () => {
      expect(SECURITY.SANDBOX.TIMEOUT_SEC).toBe(300); // 5 minutes
      expect(SECURITY.SANDBOX.TIMEOUT_SEC).toBeGreaterThan(30); // Allow complex operations
      expect(SECURITY.SANDBOX.TIMEOUT_SEC).toBeLessThan(3600); // Prevent runaway processes
    });

    it("should have reasonable memory limit", () => {
      expect(SECURITY.SANDBOX.MEMORY_MB).toBe(512);
      expect(SECURITY.SANDBOX.MEMORY_MB).toBeGreaterThan(64); // Allow non-trivial work
      expect(SECURITY.SANDBOX.MEMORY_MB).toBeLessThan(4096); // Prevent DoS
    });

    it("should include safe read-only binaries", () => {
      expect(SECURITY.SANDBOX.SAFE_BINS).toContain("jq");
      expect(SECURITY.SANDBOX.SAFE_BINS).toContain("grep");
      // Should not include dangerous binaries
      expect(SECURITY.SANDBOX.SAFE_BINS).not.toContain("rm");
      expect(SECURITY.SANDBOX.SAFE_BINS).not.toContain("curl");
    });
  });

  describe("auth", () => {
    it("should warn about OAuth expiration 24 hours in advance", () => {
      expect(SECURITY.AUTH.OAUTH_WARN_MS).toBe(24 * 60 * 60 * 1000);
    });

    it("should have reasonable handshake timeout", () => {
      expect(SECURITY.AUTH.HANDSHAKE_TIMEOUT_MS).toBe(10_000); // 10 seconds
    });
  });
});

describe("PATHS constants", () => {
  it("should have correct state directory name", () => {
    expect(PATHS.STATE.DIRNAME).toBe(".closedclaw");
  });

  it("should have correct config filename", () => {
    expect(PATHS.CONFIG.FILENAME).toBe("config.json5");
  });

  it("should have standard subdirectories", () => {
    expect(PATHS.SUBDIRS.SESSIONS).toBe("sessions");
    expect(PATHS.SUBDIRS.CREDENTIALS).toBe("credentials");
    expect(PATHS.SUBDIRS.CRON).toBe("cron");
  });

  it("should have correct agent workspace filenames", () => {
    expect(PATHS.AGENT.AGENTS).toBe("AGENTS.md");
    expect(PATHS.AGENT.SOUL).toBe("SOUL.md");
    expect(PATHS.AGENT.TOOLS).toBe("TOOLS.md");
  });

  describe("resolveSubdir", () => {
    it("should resolve subdirectory path", () => {
      const result = resolveSubdir("/home/user/.closedclaw", "SESSIONS");
      expect(result).toBe("/home/user/.closedclaw/sessions");
    });
  });

  describe("resolveGatewayLockDir", () => {
    it("should include lock suffix", () => {
      const result = resolveGatewayLockDir();
      expect(result).toContain("closedclaw");
    });

    it("should be in tmpdir", () => {
      const result = resolveGatewayLockDir();
      // Should be an absolute path in tmp directory
      expect(result).toMatch(/^\/.*tmp/i);
    });
  });
});

describe("LIMITS constants", () => {
  describe("timeouts", () => {
    it("should have reasonable network timeouts", () => {
      expect(LIMITS.TIMEOUT.LINK_TIMEOUT_MS).toBe(30_000);
      expect(LIMITS.TIMEOUT.INPUT_FILE_TIMEOUT_MS).toBe(10_000);
      expect(LIMITS.TIMEOUT.DEFAULT_TIMEOUT_MS).toBe(10_000);
    });
  });

  describe("media", () => {
    it("should have image processing limits", () => {
      expect(LIMITS.MEDIA.MAX_BYTES.image).toBe(10 * 1024 * 1024); // 10 MB
      expect(LIMITS.MEDIA.TIMEOUT_SECONDS.image).toBe(60);
    });

    it("should have audio processing limits", () => {
      expect(LIMITS.MEDIA.MAX_BYTES.audio).toBe(25 * 1024 * 1024); // 25 MB
      expect(LIMITS.MEDIA.TIMEOUT_SECONDS.audio).toBe(300); // 5 minutes
    });

    it("should have video processing limits", () => {
      expect(LIMITS.MEDIA.MAX_BYTES.video).toBe(70 * 1024 * 1024); // 70 MB
      expect(LIMITS.MEDIA.TIMEOUT_SECONDS.video).toBe(600); // 10 minutes
    });

    it("should have concurrency limit", () => {
      expect(LIMITS.MEDIA.CONCURRENCY).toBe(2);
      expect(LIMITS.MEDIA.CONCURRENCY).toBeGreaterThan(0);
    });
  });

  describe("gateway", () => {
    it("should have correct default port", () => {
      expect(LIMITS.GATEWAY.PORT).toBe(18789);
    });

    it("should have WebSocket slow threshold", () => {
      expect(LIMITS.GATEWAY.WS_SLOW_MS).toBe(50);
    });

    it("should have reconnect policy", () => {
      expect(LIMITS.GATEWAY.RECONNECT.initialDelayMs).toBe(1000);
      expect(LIMITS.GATEWAY.RECONNECT.maxDelayMs).toBe(30_000);
      expect(LIMITS.GATEWAY.RECONNECT.backoffMultiplier).toBe(1.5);
    });
  });
});

describe("NETWORK constants", () => {
  describe("providers", () => {
    it("should use HTTPS for all provider URLs", () => {
      expect(NETWORK.PROVIDERS.GITHUB_COPILOT).toMatch(/^https:\/\//);
      expect(NETWORK.PROVIDERS.OPENAI).toMatch(/^https:\/\//);
      expect(NETWORK.PROVIDERS.GOOGLE_GEMINI).toMatch(/^https:\/\//);
      expect(NETWORK.PROVIDERS.DEEPGRAM).toMatch(/^https:\/\//);
    });

    it("should have correct OpenAI URL", () => {
      expect(NETWORK.PROVIDERS.OPENAI).toBe("https://api.openai.com/v1");
    });
  });

  describe("webhooks", () => {
    it("should have webhook paths starting with slash", () => {
      expect(NETWORK.WEBHOOKS.BLUEBUBBLES).toMatch(/^\//);
      expect(NETWORK.WEBHOOKS.GMAIL).toMatch(/^\//);
      expect(NETWORK.WEBHOOKS.HOOKS).toMatch(/^\//);
    });
  });

  describe("ports", () => {
    it("should have valid port numbers", () => {
      expect(NETWORK.PORTS.GATEWAY).toBeGreaterThan(1024); // Non-privileged
      expect(NETWORK.PORTS.GATEWAY).toBeLessThan(65535);
      expect(NETWORK.PORTS.GMAIL_PORT).toBeGreaterThan(1024);
      expect(NETWORK.PORTS.GMAIL_PORT).toBeLessThan(65535);
    });
  });

  describe("update", () => {
    it("should have correct default channels", () => {
      expect(NETWORK.UPDATE.PACKAGE_CHANNEL).toBe("stable");
      expect(NETWORK.UPDATE.GIT_CHANNEL).toBe("dev");
    });
  });
});

describe("CHANNELS constants", () => {
  describe("accounts", () => {
    it("should use 'default' as default account ID", () => {
      expect(CHANNELS.ACCOUNTS.DEFAULT).toBe("default");
      expect(CHANNELS.ACCOUNTS.MATRIX).toBe("default");
      expect(CHANNELS.ACCOUNTS.TWITCH).toBe("default");
    });
  });

  describe("session", () => {
    it("should have correct default agent ID", () => {
      expect(CHANNELS.SESSION.AGENT_ID).toBe("main");
    });

    it("should have correct main session key", () => {
      expect(CHANNELS.SESSION.MAIN_KEY).toBe("main");
    });
  });

  describe("voice", () => {
    it("should have Polly default voice", () => {
      expect(CHANNELS.VOICE.POLLY_DEFAULT).toBe("Polly.Joanna");
    });

    it("should have OpenAI voices list", () => {
      expect(CHANNELS.VOICE.OPENAI_VOICES).toContain("alloy");
      expect(CHANNELS.VOICE.OPENAI_VOICES).toContain("nova");
      expect(CHANNELS.VOICE.OPENAI_VOICES.length).toBeGreaterThan(4);
    });
  });

  describe("identity", () => {
    it("should have default assistant name", () => {
      expect(CHANNELS.IDENTITY.NAME).toBe("Assistant");
    });

    it("should have default avatar", () => {
      expect(CHANNELS.IDENTITY.AVATAR).toBe("A");
    });
  });

  describe("dm_policy", () => {
    it("should default to pairing", () => {
      expect(CHANNELS.DM_POLICY.DEFAULT).toBe("pairing");
    });
  });

  describe("daemon", () => {
    it("should use node runtime", () => {
      expect(CHANNELS.DAEMON.RUNTIME).toBe("node");
    });
  });

  describe("embeddings", () => {
    it("should have OpenAI embedding model", () => {
      expect(CHANNELS.EMBEDDINGS.OPENAI_MODEL).toBe("text-embedding-3-small");
    });

    it("should have Gemini embedding model", () => {
      expect(CHANNELS.EMBEDDINGS.GEMINI_MODEL).toBe("gemini-embedding-001");
    });
  });

  describe("browser", () => {
    it("should enable browser by default", () => {
      expect(CHANNELS.BROWSER.ENABLED).toBe(true);
    });

    it("should have correct profile name", () => {
      expect(CHANNELS.BROWSER.PROFILE_NAME).toBe("ClosedClaw");
    });

    it("should have valid hex color", () => {
      expect(CHANNELS.BROWSER.COLOR).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  describe("upstream", () => {
    it("should have correct remote name", () => {
      expect(CHANNELS.UPSTREAM.REMOTE).toBe("openclaw");
    });

    it("should have correct branch", () => {
      expect(CHANNELS.UPSTREAM.BRANCH).toBe("main");
    });

    it("should check daily", () => {
      expect(CHANNELS.UPSTREAM.CHECK_INTERVAL_HOURS).toBe(24);
    });
  });
});

describe("Type safety", () => {
  it("should enforce compile-time immutability for nested objects", () => {
    // TypeScript `as const` prevents mutation at compile-time
    // @ts-expect-error - Cannot assign to read-only property
    const _test1 = () => {
      SECURITY.ENCRYPTION.KDF_PARAMS.memory = 1024;
    };
    expect(_test1).toBeDefined();
  });

  it("should enforce compile-time immutability for arrays", () => {
    // TypeScript `as const` prevents array mutation at compile-time
    // @ts-expect-error - Cannot assign to read-only array
    const _test2 = () => {
      SECURITY.PASSPHRASE.WEAK_PATTERNS.push("new-pattern");
    };
    expect(_test2).toBeDefined();
  });

  it("should be properly typed for autocomplete", () => {
    // This would fail TypeScript compilation if types are wrong
    const _encryptionAlgorithm: "xchacha20-poly1305" = SECURITY.ENCRYPTION.ALGORITHM;
    const _kdf: "argon2id" = SECURITY.ENCRYPTION.KDF;
    const _mode: "all" = SECURITY.SANDBOX.MODE;
    const _channel: "stable" = NETWORK.UPDATE.PACKAGE_CHANNEL;

    // Silence unused variable warnings
    expect(_encryptionAlgorithm).toBeDefined();
    expect(_kdf).toBeDefined();
    expect(_mode).toBeDefined();
    expect(_channel).toBeDefined();
  });
});
