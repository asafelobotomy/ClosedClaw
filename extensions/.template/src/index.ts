import type { ClosedClawPluginApi } from "closedclaw/plugin-sdk";

/**
 * ClosedClaw Extension Template
 * 
 * This is a minimal extension that demonstrates the plugin registration pattern.
 * Replace this with your extension's actual implementation.
 */

export function register(api: ClosedClawPluginApi) {
  // Get extension configuration
  const config = api.getConfig();
  const extensionConfig = config.plugins?.["extension-template"] ?? {};
  
  // Check if extension is enabled
  if (extensionConfig.enabled === false) {
    return;
  }

  // Example: Register a tool
  api.registerTool({
    factory: (ctx) => ({
      name: "example_tool",
      description: "An example tool provided by this extension",
      parameters: {
        input: {
          type: "string",
          description: "Input parameter",
          required: true,
        },
      },
      handler: async (params) => {
        const input = params.input as string;
        
        // Your tool logic here
        return {
          result: `Processed: ${input}`,
        };
      },
    }),
  });

  // Example: Register a hook
  api.registerHook({
    entry: "message:received",
    priority: 100, // Higher = earlier execution
    handler: async (ctx, next) => {
      // Pre-process logic here
      console.log("[extension-template] Message received:", ctx.message);
      
      // Call next hook in chain
      const result = await next();
      
      // Post-process logic here
      console.log("[extension-template] Message processed");
      
      return result;
    },
  });

  // Example: Register a CLI command
  api.registerCommand({
    name: "example",
    description: "An example CLI command from this extension",
    handler: async (args) => {
      console.log("Example command executed with args:", args);
    },
  });

  // Example: Register a channel (if this is a channel extension)
  // api.registerChannel({
  //   id: "example-channel",
  //   name: "Example Channel",
  //   send: async (message, destination) => {
  //     // Send logic
  //   },
  //   probe: async () => {
  //     // Health check logic
  //     return { status: "ok" };
  //   },
  // });

  // Example: Register a provider (if this is a provider extension)
  // api.registerProvider({
  //   id: "example-provider",
  //   name: "Example AI Provider",
  //   authenticate: async (credentials) => {
  //     // Auth logic
  //   },
  //   createStream: async (messages, options) => {
  //     // Streaming logic
  //   },
  // });

  console.log("[extension-template] Extension registered successfully");
}
