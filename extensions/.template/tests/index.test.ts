import { describe, it, expect, beforeEach } from 'vitest';
import { register } from '../src/index';
import type { ClosedClawPluginApi } from 'closedclaw/plugin-sdk';

/**
 * Extension Template Tests
 * 
 * These are basic tests to ensure the extension registers correctly.
 * Add more tests based on your extension's specific functionality.
 */

describe('Extension Template', () => {
  let mockApi: ClosedClawPluginApi;
  let registeredTools: any[];
  let registeredHooks: any[];
  let registeredCommands: any[];

  beforeEach(() => {
    registeredTools = [];
    registeredHooks = [];
    registeredCommands = [];

    // Create a mock plugin API
    mockApi = {
      getConfig: () => ({
        plugins: {
          "extension-template": {
            enabled: true,
            setting1: "test-value",
          },
        },
      }),
      registerTool: (tool) => {
        registeredTools.push(tool);
      },
      registerHook: (hook) => {
        registeredHooks.push(hook);
      },
      registerCommand: (command) => {
        registeredCommands.push(command);
      },
      registerChannel: () => {},
      registerProvider: () => {},
      registerService: () => {},
      registerGatewayHandler: () => {},
      registerHttpRoute: () => {},
    } as any;
  });

  it('should register successfully', () => {
    expect(() => register(mockApi)).not.toThrow();
  });

  it('should register a tool', () => {
    register(mockApi);
    expect(registeredTools).toHaveLength(1);
    
    const tool = registeredTools[0];
    expect(tool).toBeDefined();
    expect(tool.factory).toBeTypeOf('function');
  });

  it('should register a hook', () => {
    register(mockApi);
    expect(registeredHooks).toHaveLength(1);
    
    const hook = registeredHooks[0];
    expect(hook).toBeDefined();
    expect(hook.entry).toBe('message:received');
    expect(hook.priority).toBe(100);
    expect(hook.handler).toBeTypeOf('function');
  });

  it('should register a CLI command', () => {
    register(mockApi);
    expect(registeredCommands).toHaveLength(1);
    
    const command = registeredCommands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('example');
    expect(command.handler).toBeTypeOf('function');
  });

  it('should not register if disabled in config', () => {
    mockApi.getConfig = () => ({
      plugins: {
        "extension-template": {
          enabled: false,
        },
      },
    });

    register(mockApi);
    
    // Should not register anything when disabled
    expect(registeredTools).toHaveLength(0);
    expect(registeredHooks).toHaveLength(0);
    expect(registeredCommands).toHaveLength(0);
  });

  it('should handle missing config gracefully', () => {
    mockApi.getConfig = () => ({});

    // Should not throw even without config
    expect(() => register(mockApi)).not.toThrow();
    
    // Should still register with defaults
    expect(registeredTools).toHaveLength(1);
  });

  describe('example_tool', () => {
    it('should process input correctly', async () => {
      register(mockApi);
      
      const tool = registeredTools[0];
      const toolInstance = tool.factory({});
      
      const result = await toolInstance.handler({ input: 'test' });
      expect(result.result).toBe('Processed: test');
    });

    it('should require input parameter', () => {
      register(mockApi);
      
      const tool = registeredTools[0];
      const toolInstance = tool.factory({});
      
      expect(toolInstance.parameters.input.required).toBe(true);
    });
  });

  describe('message:received hook', () => {
    it('should call next in hook chain', async () => {
      register(mockApi);
      
      const hook = registeredHooks[0];
      const mockNext = vi.fn().mockResolvedValue('result');
      const ctx = { message: 'test message' };
      
      const result = await hook.handler(ctx, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe('result');
    });
  });
});
