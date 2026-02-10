/**
 * Session Test Utilities
 * 
 * Helper functions for creating and managing test sessions.
 */

import type { AgentSession } from '../../src/sessions/types.js';

/**
 * Create a test session key
 */
export function createTestSessionKey(
  channel: string,
  kind: 'dm' | 'group' | 'thread',
  peerId: string,
  agentId: string = 'main'
): string {
  return `agent:${agentId}:${channel}:${kind}:${peerId}`;
}

/**
 * Create a minimal test session
 */
export function createTestSession(
  sessionKey: string,
  overrides: Partial<AgentSession> = {}
): AgentSession {
  return {
    sessionKey,
    agentId: 'main',
    channel: 'test',
    kind: 'dm',
    peerId: 'test-peer',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as AgentSession;
}

/**
 * Create a session with message history
 */
export function createTestSessionWithMessages(
  sessionKey: string,
  messageCount: number = 5
): AgentSession {
  const messages = Array.from({ length: messageCount }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i + 1}`,
    timestamp: Date.now() - (messageCount - i) * 1000,
  }));

  return createTestSession(sessionKey, {
    messages: messages as any,
  });
}

/**
 * Parse a session key into its components
 */
export function parseTestSessionKey(sessionKey: string) {
  const parts = sessionKey.split(':');
  return {
    prefix: parts[0],
    agentId: parts[1],
    channel: parts[2],
    kind: parts[3] as 'dm' | 'group' | 'thread',
    peerId: parts[4],
  };
}
