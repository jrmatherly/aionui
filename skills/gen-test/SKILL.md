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

Read the target file. Identify all exported functions, classes, and their dependencies.

### 2. Determine test location

Mirror the source path under `tests/unit/`:

- `src/process/database/schema.ts` -> `tests/unit/process/database/schema.test.ts`
- `src/webserver/auth/service/AuthService.ts` -> `tests/unit/webserver/auth/service/AuthService.test.ts`

Create intermediate directories as needed.

### 3. Generate test file

Follow these conventions:

- **Format**: `describe`/`it` blocks with descriptive names
- **Extension**: `.test.ts`
- **Path aliases**: `@/*`, `@process/*`, `@renderer/*`, `@worker/*` (configured in `jest.config.js`)
- **Mocking**: Use `jest.mock()` for external dependencies

**Required mocks** (these modules don't work in test env):

```typescript
// better-sqlite3
jest.mock('better-sqlite3');

// Pino logger (avoid file I/O)
jest.mock('@/common/logger', () => ({
  dbLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  webLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// electron (not available in Node test env)
jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/tmp/test') },
  ipcMain: { handle: jest.fn(), on: jest.fn() },
}));
```

**Test structure**:

```typescript
import { functionUnderTest } from '@/path/to/module';

describe('functionUnderTest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle normal input', () => {
    /* ... */
  });
  it('should handle edge case', () => {
    /* ... */
  });
  it('should throw on invalid input', () => {
    /* ... */
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

Fix any failures before presenting the result.

## Configuration

- Jest config: `jest.config.js` (ts-jest preset)
- Setup file: `tests/jest.setup.ts`
- Test timeout: 10000ms
