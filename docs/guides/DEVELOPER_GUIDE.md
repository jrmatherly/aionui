# AionUI Developer Guide

This guide covers development setup, architecture patterns, and contribution guidelines for AionUI.

## Development Setup

### Prerequisites

```bash
# Required
node --version  # 18.x or later
npm --version   # 9.x or later

# Recommended
git --version   # For source control
```

### Initial Setup

```bash
# Clone repository
git clone https://github.com/your-org/aionui.git
cd aionui

# Install dependencies
npm install

# Start development server
npm start
```

### Development Commands

```bash
# Development
npm start              # Start with hot reload
npm run webui          # Start WebUI server
npm run webui:remote   # WebUI with remote access

# Code Quality
npm run lint           # Run ESLint
npm run lint:fix       # Fix lint issues
npm run format         # Format with Prettier

# Testing
npm test               # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report

# Building
npm run build          # Build for macOS
npm run dist:mac       # macOS distribution
npm run dist:win       # Windows distribution
npm run dist:linux     # Linux distribution
```

## Project Structure

```text
src/
├── index.ts              # Main process entry
├── preload.ts            # IPC bridge (contextBridge)
├── agent/                # AI agent implementations
│   ├── acp/              # Claude Code agent
│   ├── codex/            # OpenAI Codex agent
│   └── gemini/           # Google Gemini agent
├── channels/             # External messaging
├── common/               # Shared code
├── process/              # Main process services
├── renderer/             # React UI
├── webserver/            # WebUI server
└── worker/               # Background workers
```

## Architecture Patterns

### Multi-Process Communication

AionUI uses Electron's multi-process architecture:

```typescript
// Main Process (src/process/)
ipcBridge.conversation.sendMessage.provider((data) => {
  // Handle in main process
  return workerManager.sendToAgent(data);
});

// Renderer Process (src/renderer/)
await window.electron.emit('conversation.sendMessage', message);

// Worker Process (src/worker/)
process.on('message', (msg) => {
  // Handle in worker
  agent.handleMessage(msg);
});
```

### Context Providers

React Context pattern for global state:

```typescript
// src/renderer/context/ConversationContext.tsx
export const ConversationProvider: React.FC = ({ children }) => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<string>('');

  return (
    <ConversationContext.Provider value={{ conversationId, workspace }}>
      {children}
    </ConversationContext.Provider>
  );
};

// Usage
const { conversationId } = useConversationContext();
```

### Message Types

Type-safe message handling:

```typescript
// src/common/chatLib.ts
interface IMessage {
  id: string;
  msg_id: string;
  conversation_id: string;
  type: TMessageType;
  content: any;
  status: string;
  position: number;
}

type TMessage =
  | IMessageText
  | IMessageToolCall
  | IMessageToolGroup
  | IMessagePlan
  | IMessageAgentStatus;
```

## Adding a New AI Agent

### 1. Create Agent Directory

```bash
mkdir -p src/agent/myagent
```

### 2. Implement Agent Class

```typescript
// src/agent/myagent/index.ts
export class MyAgent {
  private connection: MyAgentConnection;
  private onStreamEvent: (event: StreamEvent) => void;

  constructor(config: MyAgentConfig) {
    this.connection = new MyAgentConnection(config);
    this.onStreamEvent = config.onStreamEvent;
  }

  async start(): Promise<void> {
    await this.connection.connect();
  }

  async stop(): Promise<void> {
    await this.connection.disconnect();
  }

  async sendMessage(message: string): Promise<void> {
    const response = await this.connection.send(message);
    this.onStreamEvent({ type: 'text', content: response });
  }
}
```

### 3. Create Worker

```typescript
// src/worker/myagent.ts
import { MyAgent } from '@/agent/myagent';

let agent: MyAgent | null = null;

process.on('message', async (msg: WorkerMessage) => {
  switch (msg.type) {
    case 'init':
      agent = new MyAgent({
        ...msg.config,
        onStreamEvent: (event) => process.send?.({ type: 'stream', event }),
      });
      await agent.start();
      break;

    case 'message':
      await agent?.sendMessage(msg.content);
      break;

    case 'stop':
      await agent?.stop();
      break;
  }
});
```

### 4. Register Worker

```typescript
// src/process/WorkerManage.ts
class WorkerManage {
  private workers: Map<string, ChildProcess> = new Map();

  createWorker(type: AgentType, id: string): ChildProcess {
    const workerPath = path.join(__dirname, `../worker/${type}.ts`);
    const worker = fork(workerPath);
    this.workers.set(id, worker);
    return worker;
  }
}
```

### 5. Add UI Components

```typescript
// src/renderer/pages/conversation/myagent/MyAgentChat.tsx
export const MyAgentChat: React.FC = () => {
  const { conversationId } = useConversationContext();
  const [messages, setMessages] = useState<TMessage[]>([]);

  // Handle messages
  useEffect(() => {
    const handler = (event: StreamEvent) => {
      setMessages(prev => [...prev, transformMessage(event)]);
    };
    window.electron.on(`myagent.${conversationId}.stream`, handler);
    return () => window.electron.off(`myagent.${conversationId}.stream`, handler);
  }, [conversationId]);

  return <MessageList messages={messages} />;
};
```

## Adding a Channel Plugin

### 1. Create Plugin Directory

```bash
mkdir -p src/channels/plugins/myplugin
```

### 2. Implement Plugin Class

```typescript
// src/channels/plugins/myplugin/MyPlugin.ts
import { BasePlugin } from '../BasePlugin';

export class MyPlugin extends BasePlugin {
  type = 'myplugin' as const;

  async onInitialize(): Promise<void> {
    // Setup plugin
  }

  async onStart(): Promise<void> {
    // Start receiving messages
  }

  async onStop(): Promise<void> {
    // Cleanup
  }

  async sendMessage(userId: string, message: string): Promise<void> {
    // Send message to user
  }
}
```

### 3. Register Plugin

```typescript
// src/channels/plugins/index.ts
export const PLUGIN_TYPES = {
  telegram: TelegramPlugin,
  myplugin: MyPlugin,
};
```

## Database Operations

### Schema Migrations

```typescript
// src/process/database/migrations.ts
export const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE my_table (
          id TEXT PRIMARY KEY,
          data TEXT,
          created_at INTEGER
        )
      `);
    },
    down: (db) => {
      db.exec('DROP TABLE my_table');
    },
  },
];
```

### Database Access

```typescript
// src/process/database/index.ts
import Database from 'better-sqlite3';

const db = new Database(dbPath);

// Query
const rows = db.prepare('SELECT * FROM messages WHERE conversation_id = ?').all(id);

// Insert
const insert = db.prepare('INSERT INTO messages (id, content) VALUES (?, ?)');
insert.run(id, content);

// Transaction
const insertMany = db.transaction((items) => {
  for (const item of items) {
    insert.run(item.id, item.content);
  }
});
insertMany(items);
```

## Testing

### Unit Tests

```typescript
// tests/unit/test_myagent.ts
import { MyAgent } from '@/agent/myagent';

describe('MyAgent', () => {
  let agent: MyAgent;

  beforeEach(() => {
    agent = new MyAgent({
      apiKey: 'test-key',
      onStreamEvent: jest.fn(),
    });
  });

  it('should send message', async () => {
    await agent.sendMessage('Hello');
    expect(agent.onStreamEvent).toHaveBeenCalled();
  });
});
```

### Integration Tests

```typescript
// tests/integration/test_webui.ts
import request from 'supertest';
import { createApp } from '@/webserver/setup';

describe('WebUI API', () => {
  const app = createApp();

  it('should return auth status', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

## Code Style

### TypeScript

- Strict mode enabled
- Use path aliases: `@/*`, `@process/*`, `@renderer/*`
- Prefer `type` over `interface` (per ESLint config)
- Use explicit return types for functions

```typescript
// Good
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Bad - missing types
export function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

### React Components

- Functional components only
- Hooks prefix: `use*`
- Event handlers prefix: `on*` or `handle*`
- Props interface: `${ComponentName}Props`

```typescript
// Good
interface MessageListProps {
  messages: TMessage[];
  onMessageClick?: (id: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  onMessageClick,
}) => {
  const handleClick = (id: string) => {
    onMessageClick?.(id);
  };

  return (
    <div>
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} onClick={handleClick} />
      ))}
    </div>
  );
};
```

### Command Execution Security

When executing external commands, use the safe utilities provided:

```typescript
// Good - Use execFileNoThrow for safe command execution
import { execFileNoThrow } from '../utils/execFileNoThrow.js';

const result = await execFileNoThrow('git', ['status']);
if (result.status === 0) {
  console.log(result.stdout);
}

// Avoid - Direct shell execution with string interpolation
// This is vulnerable to command injection
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `MessageList.tsx` |
| Hooks | camelCase with `use` prefix | `useAutoScroll.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Constants | UPPER_SNAKE_CASE | `MAX_MESSAGE_LENGTH` |
| Types | PascalCase with `T` or `I` prefix | `TMessage`, `IConfig` |

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation

### Commit Messages

Format: `<type>(<scope>): <subject>`

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`

```bash
# Good
feat(agent): add support for custom prompts
fix(webui): correct authentication redirect
refactor(database): simplify query methods

# Bad
update code
fix bug
```

### Pull Request Process

1. Create feature branch from `main`
2. Make changes with proper commits
3. Ensure tests pass: `npm test`
4. Ensure lint passes: `npm run lint`
5. Create PR with description
6. Address review feedback
7. Squash and merge

## Debugging

### Main Process

```typescript
// Open DevTools in main window
mainWindow.webContents.openDevTools();
```

### Renderer Process

Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS) to open DevTools.

### Worker Processes

```typescript
// Add logging to worker
console.log('[Worker]', message);
```

### Logging

```typescript
// Use console with prefix for easy filtering
console.log('[Module]', 'Message');
console.error('[Module] Error:', error);
```

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Arco Design Components](https://arco.design/react/docs/start)
