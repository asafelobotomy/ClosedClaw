# Extension Template

This is a boilerplate template for creating new ClosedClaw extensions (plugins, channels, providers, etc.).

## Quick Start

1. **Copy this template**:
   ```bash
   cp -r extensions/.template extensions/my-ext extension-name
   ```

2. **Update `package.json`**:
   - Change `name` to `@closedclaw/my-extension-name`
   - Update the `description`
   - Add any specific dependencies

3. **Update `ClosedClaw.plugin.json`**:
   - Change `id` to your extension ID
   - Update the metadata

4. **Implement your extension** in `src/index.ts`

5. **Add tests** in `tests/`

6. **Update this README** with your extension's documentation

## Filesystem After Copy

```
extensions/my-extension-name/
├── package.json              # NPM package configuration
├── ClosedClaw.plugin.json   # Plugin manifest
├── README.md                # This file (update with your docs)
├── CHANGELOG.md             # Version history
├── src/
│   └── index.ts             # Main entry point
└── tests/
    └── index.test.ts        # Basic tests
```

## What to Implement

### 1. Channel Extension

If creating a new messaging channel:

- Implement `ChannelPlugin` interface
- Register via `api.registerChannel()`
- Add send/receive functionality
- Handle authentication/pairing

See `extensions/telegram/` or `extensions/discord/` for examples.

### 2. Tool Extension

If adding new agent tools:

- Create tool factory functions
- Register via `api.registerTool()`
- Add parameter validation
- Include usage examples

See `src/agents/tools/` for examples.

### 3. Provider Extension

If adding a new AI model provider:

- Implement provider interface
- Register via `api.registerProvider()`
- Handle authentication
- Support streaming

See `extensions/copilot-proxy/` for examples.

### 4. Hook Extension

If extending core functionality via hooks:

- Register hooks with `api.registerHook()`
- Choose appropriate priority
- Handle errors gracefully

See `src/hooks/bundled/` for examples.

## Configuration Schema

Update `ClosedClaw.plugin.json` to define user-configurable settings:

```json
{
  "configSchema": {
    "type": "object",
    "properties": {
      "enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable this extension"
      },
      "apiKey": {
        "type": "string",
        "description": "API key for the service"
      }
    }
  },
  "uiHints": {
    "apiKey": {
      "sensitive": true,
      "label": "API Key"
    }
  }
}
```

## Testing

```bash
# Run extension tests
pnpm test -- extensions/my-extension-name/

# Run with coverage
pnpm test:coverage -- extensions/my-extension-name/
```

## Publishing

Once your extension is ready:

1. Update version in `package.json` and `ClosedClaw.plugin.json`
2. Update `CHANGELOG.md`
3. Test thoroughly
4. Publish to npm:
   ```bash
   cd extensions/my-extension-name
   npm publish --access public
   ```

## Resources

- [Plugin System Overview](../../docs/plugin.md)
- [Creating Extensions Guide](../../docs/plugins/creating-extensions.md) *(coming soon)*
- [Example Extensions](../)
- [Discord Community](https://discord.gg/clawd)

## License

MIT - See [LICENSE](../../LICENSE)
