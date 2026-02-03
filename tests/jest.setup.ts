/**
 * Jest Test Setup
 * Global configuration for MCP integration tests
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Test mocks require flexible typing */

// Jest types are automatically available

// Make this a module
export {};

// Extend global types for testing
declare global {
  var electronAPI: any;
}

const noop = () => Promise.resolve();

// Mock Electron APIs for testing
const windowControlsMock = {
  minimize: noop,
  maximize: noop,
  unmaximize: noop,
  close: noop,
  isMaximized: () => Promise.resolve(false),
  onMaximizedChange: (): (() => void) => () => void 0,
};

(global as any).electronAPI = {
  emit: noop,
  on: () => {},
  windowControls: windowControlsMock,
};

if (typeof window !== 'undefined') {
  (window as any).electronAPI = (global as any).electronAPI;
}
