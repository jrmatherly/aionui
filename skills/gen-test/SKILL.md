---
name: gen-test
description: 'Generate Jest unit tests for AionUI modules following project conventions'
---

# Generate Tests

Scaffold Jest unit tests for a given source file or module.

## Usage

User provides a source file path (e.g., `/gen-test src/webserver/auth/service/AuthService.ts`).

If no path given, suggest priority targets:

1. Auth services: `src/webserver/auth/service/`
2. Database operations: `src/process/database/`
3. API adapters: `src/common/adapters/`
4. IPC bridges: `src/process/bridge/`
5. Cron system: `src/process/services/cron/`

## Workflow

### 1. Analyze source

Read the target file. Identify:

- All exported functions, classes, and types
- Constructor dependencies and injected services
- External module imports that need mocking
- Error handling paths and edge cases

### 2. Determine test location

Mirror the source path under `tests/unit/`:

| Source                                      | Test                                                    |
| ------------------------------------------- | ------------------------------------------------------- |
| `src/process/database/schema.ts`            | `tests/unit/process/database/schema.test.ts`            |
| `src/webserver/auth/service/AuthService.ts` | `tests/unit/webserver/auth/service/AuthService.test.ts` |
| `src/common/adapters/openai.ts`             | `tests/unit/common/adapters/openai.test.ts`             |

Create intermediate directories as needed.

### 3. Generate test file

Follow these conventions:

- **Format**: `describe`/`it` blocks grouped by function or method name
- **Extension**: `.test.ts`
- **Path aliases** (from `jest.config.js`): `@/*`, `@process/*`, `@renderer/*`, `@worker/*`, `@mcp/*`
- **Mocking**: Use `jest.mock()` for external dependencies
- **Reset**: `jest.clearAllMocks()` in `beforeEach`

**Required mocks** (add at top of every test file as needed):

```typescript
// Electron (always mock if source imports electron)
jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/test'), getName: jest.fn(() => 'test') },
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  BrowserWindow: jest.fn(),
}));

// better-sqlite3 (always mock for database modules)
jest.mock('better-sqlite3', () => {
  const mockDb = {
    prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) })),
    exec: jest.fn(),
    pragma: jest.fn(),
    close: jest.fn(),
  };
  return jest.fn(() => mockDb);
});

// Pino logger (always mock to avoid file I/O)
jest.mock('@/common/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() })),
  },
  dbLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  webLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// node-pty (mock if source uses terminal)
jest.mock('node-pty', () => ({
  spawn: jest.fn(() => ({ onData: jest.fn(), write: jest.fn(), kill: jest.fn() })),
}));
```

**Test patterns**:

- Test each exported function/method independently
- Assert return values, thrown errors, and side effects (mock calls)
- For async code, use `async/await` in test functions
- For classes, test construction and each public method

**Example skeleton**:

```typescript
import { MyService } from '@/path/to/module';

jest.mock('better-sqlite3');
jest.mock('@/common/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() })),
  },
}));

describe('MyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should return expected result for valid input', () => {
      // arrange, act, assert
    });

    it('should throw on invalid input', () => {
      expect(() => service.methodName(null)).toThrow();
    });

    it('should handle empty array gracefully', () => {
      expect(service.methodName([])).toEqual([]);
    });
  });
});
```

Include tests for:

- Happy path
- Edge cases and boundary conditions
- Error handling paths
- Input validation (if Zod schemas are used)

### 4. Run tests

```bash
npm test -- --testPathPattern=<test-file-path>
```

Fix any failures before presenting the result. Do not modify source code to make tests pass — fix the tests instead.

## Configuration

- Jest config: `jest.config.js` (ts-jest preset)
- Setup file: `tests/jest.setup.ts` (mocks `electronAPI` on global)
- Test timeout: 10000ms
