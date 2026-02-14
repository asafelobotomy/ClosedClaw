---
name: config-migrator
description: Help with config schema changes and migrations in ClosedClaw. Use when updating config types, syncing Zod schemas, creating migrations, or handling breaking config changes. Covers type definitions, validation, and legacy migration patterns.
---

# Config Migrator

This skill helps you safely modify ClosedClaw's configuration schema, sync type definitions with Zod validators, and create migration paths for breaking changes.

## When to Use

- Adding new config fields
- Modifying existing config structure
- Creating breaking config changes
- Syncing TypeScript types with Zod schemas
- Writing migration logic for legacy configs
- Updating config documentation

## Prerequisites

- Understanding of TypeScript types and Zod validation
- Familiarity with JSON5 syntax
- Knowledge of `src/config/` structure

## Configuration Architecture

### File Structure

```
src/config/
├── config.ts              # Main exports
├── io.ts                  # Config loading/saving
├── types.ts               # Base config types
├── types.agents.ts        # Agent-specific config
├── types.channels.ts      # Channel-specific config
├── types.gateway.ts       # Gateway-specific config
├── types.models.ts        # Model provider config
├── zod-schema.ts          # Zod validation schemas
├── legacy-migrate.ts      # Migration logic
├── defaults.ts            # Default value application
├── validation.ts          # Config validation
├── env-substitution.ts    # Environment variable handling
└── includes.ts            # Config file includes
```

### Config Flow

```
User edits config.json5
    ↓
loadConfig() reads file (io.ts)
    ↓
resolveConfigIncludes() handles $include (includes.ts)
    ↓
resolveConfigEnvVars() substitutes ${ENV_VAR} (env-substitution.ts)
    ↓
migrateLegacyConfig() updates old formats (legacy-migrate.ts)
    ↓
validateConfigObject() checks against Zod (validation.ts)
    ↓
applyDefaults() fills missing values (defaults.ts)
    ↓
Config ready for use
```

## Common Tasks

### Task 1: Add New Config Field

#### Step 1: Update TypeScript Types

```typescript
// src/config/types.agents.ts (or appropriate types file)

export type AgentConfig = {
  // ... existing fields

  // New field
  newFeature?: {
    enabled: boolean;
    threshold?: number;
    mode?: "fast" | "accurate";
  };
};
```

#### Step 2: Update Zod Schema

```typescript
// src/config/zod-schema.ts

const agentConfigSchema = z.object({
  // ... existing schemas

  newFeature: z
    .object({
      enabled: z.boolean(),
      threshold: z.number().min(0).max(100).optional(),
      mode: z.enum(["fast", "accurate"]).optional(),
    })
    .optional(),
});
```

#### Step 3: Add Default Values

```typescript
// src/config/defaults.ts

export function applyAgentDefaults(config: ClosedClawConfig): void {
  // ... existing defaults

  if (config.agents?.main?.newFeature === undefined) {
    config.agents.main.newFeature = {
      enabled: true,
      threshold: 50,
      mode: "fast",
    };
  }
}
```

#### Step 4: Document in Config

```json5
// Example in config.json5 comments or docs
{
  agents: {
    main: {
      // New feature configuration
      newFeature: {
        enabled: true, // Enable new feature
        threshold: 50, // Threshold value (0-100)
        mode: "fast", // Mode: "fast" or "accurate"
      },
    },
  },
}
```

### Task 2: Create Breaking Change Migration

#### Step 1: Identify Breaking Change

Example: Renaming `oldField` to `newField`

#### Step 2: Add Migration Logic

```typescript
// src/config/legacy-migrate.ts

export function migrateLegacyConfig(config: unknown): {
  config: unknown;
  issues: LegacyConfigIssue[];
} {
  const issues: LegacyConfigIssue[] = [];

  // ... existing migrations

  // Migrate oldField to newField
  if (isObject(config) && isObject(config.agents)) {
    const agents = config.agents as Record<string, unknown>;

    for (const [agentId, agentConfig] of Object.entries(agents)) {
      if (isObject(agentConfig) && "oldField" in agentConfig) {
        // Move to new name
        const value = agentConfig.oldField;
        delete agentConfig.oldField;
        agentConfig.newField = value;

        // Record issue
        issues.push({
          level: "warning",
          message: `Agent "${agentId}": renamed "oldField" to "newField"`,
          fix: "automatic",
          path: ["agents", agentId, "oldField"],
        });
      }
    }
  }

  return { config, issues };
}
```

#### Step 3: Update Version Detection

```typescript
// src/config/version.ts

export function detectConfigVersion(config: unknown): string {
  // Add detection for old format
  if (isObject(config) && isObject(config.agents)) {
    const agents = config.agents as Record<string, unknown>;
    if (Object.values(agents).some((a) => isObject(a) && "oldField" in a)) {
      return "2025.12.0"; // Version before change
    }
  }

  return "latest";
}
```

#### Step 4: Test Migration

```typescript
// src/config/legacy-migrate.test.ts

describe("migrateLegacyConfig", () => {
  it("migrates oldField to newField", () => {
    const oldConfig = {
      agents: {
        main: {
          oldField: "value",
        },
      },
    };

    const { config, issues } = migrateLegacyConfig(oldConfig);

    expect(config).toMatchObject({
      agents: {
        main: {
          newField: "value",
        },
      },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/renamed.*oldField.*newField/);
  });
});
```

### Task 3: Sync Types with Zod Schema

The most common mistake is updating types but not Zod schemas, or vice versa.

#### Workflow

1. **Update TypeScript type first**:

   ```typescript
   // src/config/types.agents.ts
   export type AgentConfig = {
     newField: string;
   };
   ```

2. **Update Zod schema immediately**:

   ```typescript
   // src/config/zod-schema.ts
   const agentConfigSchema = z.object({
     newField: z.string(),
   });
   ```

3. **Run tests to catch mismatches**:

   ```bash
   pnpm test -- src/config/
   ```

4. **Use type guards for runtime safety**:
   ```typescript
   function isValidAgentConfig(value: unknown): value is AgentConfig {
     return agentConfigSchema.safeParse(value).success;
   }
   ```

### Task 4: Handle Environment Variables

Config supports `${ENV_VAR}` substitution:

```json5
// config.json5
{
  telegram: {
    botToken: "${TELEGRAM_BOT_TOKEN}",
  },
}
```

#### Error Handling

```typescript
// src/config/env-substitution.ts

// Throws MissingEnvVarError if not found
resolveConfigEnvVars(config);

// In your code
try {
  const config = loadConfig();
} catch (error) {
  if (error instanceof MissingEnvVarError) {
    console.error(`Missing env var: ${error.varName}`);
    // Provide helpful message
  }
}
```

### Task 5: Config Includes

Support for splitting config across files:

```json5
// config.json5
{
  $include: ["./agents.json5", "./channels.json5"],
  gateway: {
    /* ... */
  },
}
```

#### Error Handling

```typescript
// src/config/includes.ts

// Handles CircularIncludeError and ConfigIncludeError
try {
  const config = resolveConfigIncludes(baseConfig, configPath);
} catch (error) {
  if (error instanceof CircularIncludeError) {
    console.error("Circular include detected:", error.cycle);
  }
}
```

## Schema Design Patterns

### Optional vs Required Fields

```typescript
// Required field
type Config = {
  requiredField: string;
};

const schema = z.object({
  requiredField: z.string(),
});

// Optional field (two patterns)
type Config = {
  optionalField?: string;
};

const schema = z.object({
  optionalField: z.string().optional(),
  // OR
  optionalField: z.optional(z.string()),
});
```

### Enums and Unions

```typescript
// String literal union
type Mode = "fast" | "accurate" | "balanced";

const modeSchema = z.enum(["fast", "accurate", "balanced"]);

// Discriminated union
type Result = { success: true; data: string } | { success: false; error: string };

const resultSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: z.string() }),
  z.object({ success: z.literal(false), error: z.string() }),
]);
```

### Nested Objects

```typescript
type Config = {
  feature: {
    enabled: boolean;
    options: {
      timeout: number;
      retries: number;
    };
  };
};

const configSchema = z.object({
  feature: z.object({
    enabled: z.boolean(),
    options: z.object({
      timeout: z.number().positive(),
      retries: z.number().min(0).max(5),
    }),
  }),
});
```

### Arrays and Records

```typescript
// Array of strings
type Config = {
  tags: string[];
};

const schema = z.object({
  tags: z.array(z.string()),
});

// Record (object with dynamic keys)
type Config = {
  agents: Record<string, AgentConfig>;
};

const schema = z.object({
  agents: z.record(z.string(), agentConfigSchema),
});
```

## Validation Patterns

### Custom Validation

```typescript
const schema = z.object({
  port: z.number().min(1024, "Port must be >= 1024").max(65535, "Port must be <= 65535"),

  url: z
    .string()
    .url("Must be valid URL")
    .refine((url) => url.startsWith("https://"), "Must use HTTPS"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain uppercase letter")
    .regex(/[0-9]/, "Must contain number"),
});
```

### Conditional Validation

```typescript
const schema = z
  .object({
    enabled: z.boolean(),
    apiKey: z.string().optional(),
  })
  .refine((data) => !data.enabled || data.apiKey !== undefined, {
    message: "apiKey required when enabled is true",
    path: ["apiKey"],
  });
```

### Transform and Coerce

```typescript
// Coerce string to number
const schema = z.object({
  port: z.coerce.number(), // "8080" → 8080
});

// Transform value
const schema = z.object({
  tags: z.string().transform((s) => s.split(",")),
});
```

## Testing Strategies

### Unit Test Pattern

```typescript
// src/config/types.agents.test.ts

import { describe, it, expect } from "vitest";
import { ClosedClawSchema } from "./zod-schema.js";

describe("Agent config schema", () => {
  it("validates valid config", () => {
    const config = {
      agents: {
        main: {
          model: "claude-opus-4",
          thinking: "high",
        },
      },
    };

    const result = ClosedClawSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects invalid config", () => {
    const config = {
      agents: {
        main: {
          model: 123, // Should be string
        },
      },
    };

    const result = ClosedClawSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["agents", "main", "model"]);
    }
  });

  it("applies defaults", () => {
    const config = { agents: { main: {} } };
    const validated = ClosedClawSchema.parse(config);
    applyAgentDefaults(validated);

    expect(validated.agents.main.thinking).toBe("medium");
  });
});
```

### Migration Test Pattern

```typescript
// src/config/legacy-migrate.test.ts

describe("Config migration", () => {
  it("migrates v1 to v2", () => {
    const v1Config = {
      oldStructure: "value",
    };

    const { config, issues } = migrateLegacyConfig(v1Config);

    expect(config).toMatchObject({
      newStructure: "value",
    });

    expect(issues).toContainEqual(
      expect.objectContaining({
        level: "warning",
        message: expect.stringMatching(/migrated/i),
      }),
    );
  });
});
```

## Diagnostic Commands

```bash
# Run config diagnostics
closedclaw doctor

# Validate config manually
node --import tsx -e "
  import { loadConfig } from './src/config/config.js';
  try {
    const config = loadConfig();
    console.log('✓ Config valid');
  } catch (error) {
    console.error('✗ Config invalid:', error);
  }
"

# Check for unknown keys
closedclaw doctor | grep -i "unknown"

# Test migration
node --import tsx scripts/test-migration.ts

# Backup before changes
cp ~/.closedclaw/config.json5 ~/.closedclaw/config.backup.json5
```

## Common Pitfalls

### Pitfall 1: Type/Schema Mismatch

**Problem**: Types updated but Zod not, or vice versa

**Detection**:

```bash
pnpm test -- src/config/
pnpm build  # TypeScript will catch some issues
```

**Prevention**: Always update both in same commit

### Pitfall 2: Breaking Changes Without Migration

**Problem**: Old configs break after update

**Prevention**: Always add migration in `legacy-migrate.ts`

### Pitfall 3: Missing Defaults

**Problem**: Optional fields undefined at runtime

**Prevention**: Add defaults in `defaults.ts` for all optional fields

### Pitfall 4: Strict Validation Too Strict

**Problem**: Users can't add experimental fields

**Solution**: Document that unknown keys will fail, or add `passthrough()`:

```typescript
const schema = z
  .object({
    /* ... */
  })
  .passthrough();
```

## Checklist

- [ ] TypeScript types updated in `src/config/types.*.ts`
- [ ] Zod schema updated in `src/config/zod-schema.ts`
- [ ] Default values added in `src/config/defaults.ts`
- [ ] Migration logic added (if breaking change) in `src/config/legacy-migrate.ts`
- [ ] Tests written for new fields in `src/config/*.test.ts`
- [ ] Tests written for migration in `src/config/legacy-migrate.test.ts`
- [ ] Documentation updated in `docs/` if user-facing
- [ ] Example added to config comments or docs
- [ ] Run `pnpm test -- src/config/` successfully
- [ ] Run `closedclaw doctor` to verify
- [ ] Test loading old config after changes
- [ ] Test loading new config format
- [ ] Update CHANGELOG.md with breaking changes
- [ ] Consider announcing in Discord if major change

## Related Files

- `src/config/types.*.ts` - TypeScript type definitions
- `src/config/zod-schema.ts` - Zod validation schemas
- `src/config/legacy-migrate.ts` - Migration logic
- `src/config/defaults.ts` - Default value application
- `src/config/validation.ts` - Validation orchestration
- `src/config/io.ts` - Config loading/saving
- `docs/configuration.md` - User-facing config docs
