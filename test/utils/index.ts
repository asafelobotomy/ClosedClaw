/**
 * Test Utilities - Barrel Export
 * 
 * This file re-exports all test utilities from their organized locations.
 * Import from here instead of navigating deep paths:
 * 
 * ```typescript
 * import { createTempHome, findFreePort, createTestRegistry } from '@/test/utils';
 * ```
 */

// Helpers
export {createTestRegistry} from '../helpers/channel-plugins.js';
export * from '../helpers/envelope-timestamp.js';
export * from '../helpers/inbound-contract.js';
export * from '../helpers/normalize-text.js';
export * from '../helpers/paths.js';
export * from '../helpers/poll.js';
export { findFreePort, waitForPort } from '../helpers/ports.js';
export { createTempHome, withTempHome } from '../helpers/temp-home.js';
export * from '../helpers/workspace.js';

// Mocks
export * from '../mocks/baileys.js';

// Fixtures
// Add fixture exports here as needed
// export * from '../fixtures/...'

// Common test patterns
export * from './config.js';
export * from './sessions.js';
export * from './assertions.js';
