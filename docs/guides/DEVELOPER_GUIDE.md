# AionUI Developer Guide

This guide covers development setup, architecture patterns, and contribution guidelines for AionUI.

## Development Setup

### Prerequisites

- **Node.js** >= 24.0.0 (managed automatically by mise)
- **npm** >= 11.0.0
- **Git** for source control
- **[mise-en-place](https://mise.jdx.dev)** (recommended) — manages tool versions automatically

### Quick Start (Recommended — with mise)

[mise](https://mise.jdx.dev) automatically installs the correct Node.js version and sets up the development environment. This is the recommended approach for all contributors.

```bash
# 1. Install mise (if you don't have it)
curl https://mise.run | sh
# Then activate mise in your shell — see https://mise.jdx.dev/getting-started.html#activate-mise

# 2. Clone and enter the project
git clone https://github.com/jrmatherly/aionui.git
cd aionui

# 3. Install tools + dependencies and start developing
mise install          # Installs correct Node.js version automatically
mise run dev          # Installs npm deps + starts Electron dev server
```

That's it. mise reads `mise.toml` and `mise.lock` to ensure you get the exact same Node.js and npm versions as every other contributor.

> **Note:** If you have mise activated in your shell, tools auto-install when you `cd` into the project directory thanks to the `[hooks] enter` configuration. Dependencies (`node_modules/`) are also auto-installed before task execution when stale, via the `[prepare.npm]` provider.

### Alternative Setup (without mise)

```bash
# Ensure you have the correct Node.js version (see engines in package.json)
node --version  # Must be >= 24.0.0

# Node 24 bundles npm 11.6.x — project standardizes on npm 11.9+
npm install -g npm@11
npm --version   # Must be >= 11.0.0

# Clone and install
git clone https://github.com/jrmatherly/aionui.git
cd aionui
npm install
npm start
```

### Development Commands

AionUI uses **mise tasks** as the primary interface. Dependencies are auto-installed when stale (via `[prepare.npm]`), and tools are auto-installed before running.

```bash
# ─── Development ─────────────────────────────────────────────
mise run dev               # Start Electron dev server (alias: mise dev)
mise run webui             # Start WebUI server (local access)
mise run webui:remote      # Start WebUI server (remote access)
mise run info              # Print environment information

# ─── Code Quality ────────────────────────────────────────────
mise run lint              # Run ESLint (alias: mise lint)
mise run lint:fix          # Run ESLint with auto-fix
mise run lint:python       # Lint Python scripts with ruff
mise run lint:python:fix   # Lint and auto-fix Python scripts with ruff
mise run typecheck         # TypeScript type checking (no emit)
mise run format            # Format code with Prettier
mise run format:check      # Check formatting (CI)
mise run ci                # Run full CI checks (lint + format + test)

# ─── Testing ─────────────────────────────────────────────────
mise run test              # Run all tests (alias: mise test)
mise run test:watch        # Watch mode
mise run test:coverage     # Coverage report
mise run test:contract     # Contract tests only
mise run test:integration  # Integration tests only

# ─── Building ────────────────────────────────────────────────
mise run build             # Build for current platform (alias: mise build)
mise run build:mac         # macOS distribution
mise run build:win         # Windows distribution
mise run build:linux       # Linux distribution
mise run clean             # Clean build artifacts

# ─── Release & Changelog ─────────────────────────────────────
mise run release               # Interactive release workflow (bump, changelog, tag, push)
mise run changelog             # Generate CHANGELOG.md from git history
mise run changelog:unreleased  # Preview unreleased changes
mise run changelog:latest      # Show latest release notes
mise run changelog:bump        # Show next version bump

# ─── Docker ───────────────────────────────────────────────────
mise run docker:build      # Build image (versions from mise.lock)
mise run docker:build -- --arch amd64  # Build for amd64
mise run docker:up         # Start container (docker-compose)
mise run docker:down       # Stop container
mise run docker:logs       # Follow container logs
mise run docker:up:https   # Start with HTTPS nginx proxy
mise run docker:down:https # Stop HTTPS stack
mise run docker:logs:https # Follow HTTPS stack logs

# ─── Drift Detect (Code Health) ──────────────────────────────
mise run drift:check       # Validate patterns
mise run drift:scan        # Full scan
mise run drift:health      # Health summary
mise run drift:export      # Export AI context
mise run drift:status      # Pattern status
mise run drift:memory      # Cortex memory health
mise run drift:memory:why  # Memory reasoning for a feature area
mise run drift:env         # Audit sensitive env var access
mise run drift:boundaries  # Verify data access boundaries
mise run drift:dna         # Check style consistency (DNA mutations)
mise run drift:approve     # Approve high-confidence patterns
mise run drift:audit       # Audit report
mise run drift:dashboard   # Open Drift dashboard
```

> **npm scripts still work.** The mise tasks wrap npm scripts, so `npm start`, `npm test`, etc. continue to work as before. mise tasks are preferred because they ensure the correct Node.js version is active.

#### Legacy npm Commands (still supported)

```bash
npm start              # Start with hot reload
npm run webui          # Start WebUI server
npm run lint           # Run ESLint
npm test               # Run all tests
npm run build          # Build for macOS
```

### Configuration Files

| File | Purpose | Git |
|------|---------|-----|
| `mise.toml` | Tool versions, env vars, tasks, prepare providers | ✅ Committed |
| `mise.lock` | Exact pinned versions + checksums + download URLs | ✅ Committed |
| `mise.local.toml` | Personal overrides (e.g., different Node version) | ❌ Gitignored |
| `mise.local.lock` | Lockfile for local overrides | ❌ Gitignored |
| `mise.*.local.toml` | Environment-specific local overrides | ❌ Gitignored |

#### Deploy Configuration (Docker)

| File | Purpose | Git |
|------|---------|-----|
| `deploy/docker/.env.example` | Full env var documentation | ✅ Committed |
| `deploy/docker/.env` | Actual deployment config (secrets) | ❌ Gitignored |
| `deploy/docker/global-models-example.json` | Example shared model configs | ✅ Committed |
| `deploy/docker/global-models.json` | Actual model configs (API keys) | ❌ Gitignored |
| `deploy/docker/group-mappings-example.json` | Example OIDC group mappings | ✅ Committed |
| `deploy/docker/group-mappings.json` | Actual group mappings | ❌ Gitignored |

To override a tool version locally without affecting the team:

```toml
# mise.local.toml (create this file, it's gitignored)
[tools]
node = "24"  # Default; override to test other versions
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

skills/                   # Python skills (lance, crawl4ai)
├── lance/                # Knowledge base embedding/search
├── crawl4ai/             # Web crawling skills
└── requirements.txt      # Python dependencies

deploy/                   # Deployment configurations
└── docker/               # Docker containerization
    ├── nginx.conf        # HTTPS reverse proxy config
    └── ...
```

## Branding Customization

AionUI supports full white-label branding via the `AIONUI_BRAND_NAME` environment variable.

### Build-Time vs Runtime Branding

Branding happens at two levels:

| Layer | Method | When Applied | Examples |
|-------|--------|--------------|----------|
| HTML `<title>` | BrandingInjectorPlugin | Build time | Browser tab title |
| React defaults | DefinePlugin | Build time | Initial component renders |
| Server messages | `getBrandName()` | Runtime | Telegram/Lark bot messages |
| HTTP headers | `getBrandName()` | Runtime | User-Agent strings |

**Important**: Build-time branding eliminates the "flash of default brand" that occurs with runtime-only configuration.

### Building with Custom Brand

```bash
# Option 1: mise task with --brand flag
mise run build:branded --brand "Enterprise AI"

# Option 2: Set env var before build
export AIONUI_BRAND_NAME="Enterprise AI"
mise run build

# Option 3: Docker with --brand flag
mise run docker:build --brand "Enterprise AI" --tag myapp:latest

# Option 4: docker-compose (set in .env)
echo 'AIONUI_BRAND_NAME="Enterprise AI"' >> deploy/docker/.env
docker-compose build
```

### Key Branding Files

| File | Purpose |
|------|---------|
| `src/common/branding.ts` | Runtime functions (`getBrandName()`, `getBrandingConfig()`) |
| `src/renderer/hooks/useBranding.ts` | React hook for UI components |
| `config/webpack/webpack.plugins.ts` | Build-time injection (BrandingInjectorPlugin, DefinePlugin) |
| `deploy/docker/Dockerfile` | `AIONUI_BRAND_NAME` build arg |
| `mise.toml` | `build:branded` and `docker:build --brand` tasks |

### Adding Branding to New Components

```typescript
// In UI components (renderer)
import { useBranding } from '@/renderer/hooks/useBranding';

const MyComponent = () => {
  const branding = useBranding();
  return <h1>{branding.brandName}</h1>;
};

// In server-side code (main process)
import { getBrandName } from '@/common/branding';

const message = `Welcome to ${getBrandName()}`;
```

See `.serena/memories/branding-and-release-configuration.md` for complete documentation.

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

## Authentication & Authorization

### Overview

AionUI implements a multi-user authentication system with support for:

- **OIDC (OpenID Connect)**: Primary authentication via SSO providers
- **Local Authentication**: Fallback username/password system
- **RBAC**: Role-based access control (admin/user)
- **Token System**: JWT access tokens (15min) + refresh tokens (7d)

### Adding RBAC-Protected Endpoints

#### Using RoleMiddleware

```typescript
// src/webserver/routes/adminRoutes.ts
import { requireAdmin, requireRole, requireUser } from '../middleware/RoleMiddleware';

// Admin-only endpoint
router.get('/api/admin/users', requireAdmin, async (req, res) => {
  // Only accessible by users with role='admin'
  const users = await userRepository.getAllUsers();
  res.json({ users });
});

// Role-specific endpoint
router.get('/api/moderator/reports', requireRole('moderator'), async (req, res) => {
  // Only accessible by users with role='moderator'
  const reports = await getReports();
  res.json({ reports });
});

// Any authenticated user
router.get('/api/profile', requireUser, async (req, res) => {
  // Accessible by any authenticated user
  // User info available in req.user
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
  });
});
```

#### Using DataScopeMiddleware

```typescript
// src/webserver/routes/conversationRoutes.ts
import { scopeToUser } from '../middleware/DataScopeMiddleware';

// Automatically filter by userId
router.get('/api/conversations', requireUser, scopeToUser, async (req, res) => {
  // req.userId is guaranteed to be set
  const conversations = db.prepare(`
    SELECT * FROM conversations 
    WHERE json_extract(metadata, '$.webUiUserId') = ?
  `).all(req.userId);
  
  res.json({ conversations });
});

// Create with automatic userId tagging
router.post('/api/conversations', requireUser, scopeToUser, async (req, res) => {
  const { title, type } = req.body;
  
  const conversation = {
    id: generateId(),
    title,
    type,
    metadata: JSON.stringify({ webUiUserId: req.userId }),
    created_at: Date.now(),
  };
  
  db.prepare(`
    INSERT INTO conversations (id, title, type, metadata, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(conversation.id, conversation.title, conversation.type, conversation.metadata, conversation.created_at);
  
  res.json({ conversation });
});
```

#### Combining Middleware

```typescript
// Stack middleware for comprehensive protection
router.delete('/api/admin/conversations/:id', 
  requireAdmin,      // Must be admin
  scopeToUser,       // Validates userId
  async (req, res) => {
    // Admin can delete any conversation
    const { id } = req.params;
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    res.json({ success: true });
  }
);
```

### OIDC Development Setup

#### Configuration

Create `src/webserver/config/oidcConfig.ts`:

```typescript
export const oidcConfig = {
  issuer: process.env.OIDC_ISSUER || 'https://accounts.google.com',
  clientId: process.env.OIDC_CLIENT_ID || 'your-client-id',
  clientSecret: process.env.OIDC_CLIENT_SECRET || 'your-client-secret',
  redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:25808/api/auth/oidc/callback',
  scopes: ['openid', 'profile', 'email'],
};
```

Create `src/webserver/config/groupMappings.ts`:

```typescript
// Map OIDC groups to application roles
export const groupMappings = {
  admin: ['admins', 'super-users', 'sysadmins'],
  moderator: ['moderators', 'content-managers'],
  user: ['users', 'members'],
};

export function mapGroupsToRole(groups: string[]): 'admin' | 'user' {
  if (!groups || groups.length === 0) return 'user';
  
  // Check for admin groups first
  if (groupMappings.admin.some(g => groups.includes(g))) {
    return 'admin';
  }
  
  return 'user';
}
```

#### Testing OIDC Locally

1. **Use a test OIDC provider**: Google, Auth0, Okta, or Keycloak
2. **Set environment variables**:

```bash
export OIDC_ISSUER="https://accounts.google.com"
export OIDC_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export OIDC_CLIENT_SECRET="your-secret"
export OIDC_REDIRECT_URI="http://localhost:25808/api/auth/oidc/callback"
```

3. **Test the flow**:

```bash
# Start WebUI server
npm run webui

# Navigate to http://localhost:25808/login
# Click "Login with SSO"
# Complete authentication
# Verify callback and token generation
```

4. **Debug with logging**:

```typescript
// src/webserver/auth/service/OidcService.ts
import { webLogger } from '@/common/logger';
const log = webLogger.child({ module: 'oidc' });

log.debug({ authUrl }, 'Authorization URL generated');
log.debug('Token response received');
log.debug({ sub: claims.sub, email: claims.email }, 'ID token claims');
```

### Token Management Patterns

#### Token Generation

```typescript
// src/webserver/auth/service/AuthService.ts
import jwt from 'jsonwebtoken';

export class AuthService {
  generateAccessToken(user: User): string {
    return jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: '15m',
        jwtid: generateJti(), // Unique token ID for blacklisting
      }
    );
  }

  async generateRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(token, 13);
    
    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(generateId(), userId, hash, Date.now() + 7 * 24 * 60 * 60 * 1000, Date.now());
    
    return token;
  }
}
```

#### Token Validation

```typescript
// src/webserver/middleware/TokenMiddleware.ts
import jwt from 'jsonwebtoken';

export async function validateToken(token: string): Promise<TokenPayload> {
  // 1. Verify JWT signature and expiration
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
  
  // 2. Check blacklist
  const blacklisted = db.prepare(`
    SELECT 1 FROM token_blacklist WHERE jti = ?
  `).get(payload.jti);
  
  if (blacklisted) {
    throw new Error('Token has been revoked');
  }
  
  return payload;
}
```

#### Token Refresh

```typescript
// src/webserver/routes/authRoutes.ts
router.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.cookies;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }
  
  try {
    // 1. Find and validate refresh token
    const tokens = db.prepare(`
      SELECT * FROM refresh_tokens WHERE expires_at > ?
    `).all(Date.now());
    
    let validToken = null;
    for (const t of tokens) {
      if (await bcrypt.compare(refreshToken, t.token_hash)) {
        validToken = t;
        break;
      }
    }
    
    if (!validToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    // 2. Get user
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(validToken.user_id);
    
    // 3. Rotate tokens
    // 3a. Blacklist old access token (if provided)
    const oldAccessToken = req.headers.authorization?.split(' ')[1];
    if (oldAccessToken) {
      const decoded = jwt.decode(oldAccessToken) as any;
      if (decoded?.jti) {
        db.prepare(`
          INSERT INTO token_blacklist (jti, exp, blacklisted_at)
          VALUES (?, ?, ?)
        `).run(decoded.jti, decoded.exp, Date.now());
      }
    }
    
    // 3b. Delete old refresh token
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(validToken.id);
    
    // 3c. Generate new tokens
    const newAccessToken = authService.generateAccessToken(user);
    const newRefreshToken = await authService.generateRefreshToken(user.id);
    
    // 4. Set cookies
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    res.json({ success: true, accessToken: newAccessToken });
  } catch (error) {
    log.error({ err: error }, 'Token refresh failed');
    res.status(401).json({ error: 'Token refresh failed' });
  }
});
```

#### Token Blacklisting

```typescript
// Blacklist a token (e.g., on logout)
export function blacklistToken(token: string): void {
  const decoded = jwt.decode(token) as any;
  
  if (decoded?.jti && decoded?.exp) {
    db.prepare(`
      INSERT INTO token_blacklist (jti, exp, blacklisted_at)
      VALUES (?, ?, ?)
    `).run(decoded.jti, decoded.exp, Date.now());
  }
}

// Cleanup expired blacklist entries (run periodically)
export function cleanupBlacklist(): void {
  db.prepare(`
    DELETE FROM token_blacklist WHERE exp < ?
  `).run(Date.now() / 1000);
}
```

### Database Migration Patterns

#### Creating Auth Migrations

```typescript
// src/process/database/migrations.ts

// Schema v10: Multi-user support
{
  version: 10,
  up: (db) => {
    db.exec(`
      ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
      ALTER TABLE users ADD COLUMN auth_method TEXT DEFAULT 'local';
      ALTER TABLE users ADD COLUMN oidc_subject TEXT UNIQUE;
      ALTER TABLE users ADD COLUMN display_name TEXT;
      ALTER TABLE users ADD COLUMN groups TEXT;
    `);
  },
  down: (db) => {
    // Note: SQLite doesn't support DROP COLUMN in older versions
    // Create new table without columns, copy data, rename
    db.exec(`
      CREATE TABLE users_backup (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password_hash TEXT,
        created_at INTEGER,
        last_login INTEGER
      );
      INSERT INTO users_backup SELECT id, username, password_hash, created_at, last_login FROM users;
      DROP TABLE users;
      ALTER TABLE users_backup RENAME TO users;
    `);
  },
},

// Schema v11: Token system
{
  version: 11,
  up: (db) => {
    db.exec(`
      CREATE TABLE refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE token_blacklist (
        jti TEXT PRIMARY KEY,
        exp INTEGER NOT NULL,
        blacklisted_at INTEGER NOT NULL
      );

      CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
      CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
      CREATE INDEX idx_blacklist_exp ON token_blacklist(exp);
    `);
  },
  down: (db) => {
    db.exec(`
      DROP TABLE refresh_tokens;
      DROP TABLE token_blacklist;
    `);
  },
}
```

#### Running Migrations

```typescript
// Automatically runs on app start
// src/process/database/index.ts
import { migrations } from './migrations';

export function initializeDatabase(dbPath: string): Database {
  const db = new Database(dbPath);
  
  // Get current version
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  
  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      log.info({ version: migration.version }, 'Running migration');
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    }
  }
  
  return db;
}
```

### User Repository

The `UserRepository` provides database operations for user management:

```typescript
// src/webserver/auth/repository/UserRepository.ts
export class UserRepository {
  // Find user by OIDC subject claim
  findByOidcSubject(subject: string): User | null {
    return db.prepare(`
      SELECT * FROM users WHERE oidc_subject = ?
    `).get(subject) as User | null;
  }

  // Create OIDC user (JIT provisioning)
  createOidcUser(data: {
    oidcSubject: string;
    username: string;
    displayName?: string;
    groups?: string[];
    role: 'admin' | 'user';
  }): User {
    const user = {
      id: generateId(),
      username: data.username,
      password_hash: null, // OIDC users don't have passwords
      role: data.role,
      auth_method: 'oidc',
      oidc_subject: data.oidcSubject,
      display_name: data.displayName || data.username,
      groups: data.groups ? JSON.stringify(data.groups) : null,
      created_at: Date.now(),
      last_login: Date.now(),
    };

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, auth_method, oidc_subject, display_name, groups, created_at, last_login)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.username,
      user.password_hash,
      user.role,
      user.auth_method,
      user.oidc_subject,
      user.display_name,
      user.groups,
      user.created_at,
      user.last_login
    );

    return user;
  }

  // Update OIDC user info (on login)
  updateOidcUserInfo(userId: string, data: {
    displayName?: string;
    groups?: string[];
  }): void {
    const updates: string[] = ['last_login = ?'];
    const values: any[] = [Date.now()];

    if (data.displayName) {
      updates.push('display_name = ?');
      values.push(data.displayName);
    }

    if (data.groups) {
      updates.push('groups = ?');
      values.push(JSON.stringify(data.groups));
    }

    values.push(userId);

    db.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `).run(...values);
  }

  // Update user role
  updateRole(userId: string, role: 'admin' | 'user'): void {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  }
}
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
import { logger } from '@/common/logger';
const log = logger.child({ module: 'my-module' });

const result = await execFileNoThrow('git', ['status']);
if (result.status === 0) {
  log.info({ stdout: result.stdout }, 'Command completed');
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
// Add logging to worker using Pino child logger
import { logger } from '@/common/logger';
const log = logger.child({ module: 'worker-name' });
log.info({ message }, 'Worker received message');
```

### Logging

```typescript
// Use Pino structured logging with child loggers
import { logger } from '@/common/logger';
const log = logger.child({ module: 'MyModule' });

log.info('Operation completed');
log.error({ err: error }, 'Operation failed');
log.warn({ userId }, 'Unusual activity detected');
```

## Knowledge Base / RAG Development

AionUI includes a Knowledge Base feature powered by vector search for retrieval-augmented generation (RAG).

### Architecture

- **Vector storage**: [LanceDB](https://lancedb.github.io/lancedb/) — embedded vector database (no external server required)
- **Embedding/ingestion**: Python scripts in `skills/lance/` handle document processing and embedding
- **TypeScript service**: `src/process/services/KnowledgeBaseService.ts` orchestrates ingestion and search from the main process

### Key Files

| File | Purpose |
|------|---------|
| `src/process/services/KnowledgeBaseService.ts` | Main process service — orchestrates KB operations |
| `skills/lance/ingest.py` | Document ingestion and embedding pipeline |
| `skills/lance/search.py` | Vector similarity search |
| `skills/lance/manage.py` | Database management (list, delete, stats) |

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `EMBEDDING_MODEL` | Model name for embeddings | — |
| `EMBEDDING_API_KEY` | API key for embedding provider | — |
| `EMBEDDING_BASE_URL` | Base URL for embedding API | — |
| `EMBEDDING_DIMENSIONS` | Embedding vector dimensions | — |

### Adding New Document Types

To support a new file format for ingestion, extend the `extract_text_from_file()` function in `skills/lance/ingest.py`:

```python
def extract_text_from_file(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext == '.mynewformat':
        return parse_my_format(file_path)
    # ... existing handlers
```

## Python Skills Development

Python-based skills extend AionUI with capabilities that benefit from the Python ecosystem (ML, data processing, etc.).

### Overview

- Skills live in the `skills/` directory, organized by feature (e.g., `skills/lance/`, `skills/crawl4ai/`)
- Dependencies are declared in `skills/requirements.txt`
- `MiseEnvironmentService` manages per-user isolated Python virtual environments
- In Docker, a template venv is pre-built during image construction for fast user onboarding

### Linting

```bash
mise run lint:python       # Check with ruff
mise run lint:python:fix   # Auto-fix and format with ruff
```

## HTTPS Development

When running AionUI behind a reverse proxy (e.g., nginx for HTTPS termination):

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `AIONUI_TRUST_PROXY` | Enable Express `trust proxy` for correct `req.ip` and `X-Forwarded-*` headers | `false` |
| `AIONUI_HTTPS` | Enable secure cookies (`Secure` flag) and HSTS headers | `false` |

### nginx Configuration

The HTTPS reverse proxy config lives at `deploy/docker/nginx.conf`. Use the Docker HTTPS tasks to manage the full stack:

```bash
mise run docker:up:https    # Start AionUI + nginx with HTTPS
mise run docker:down:https  # Stop the HTTPS stack
mise run docker:logs:https  # Follow logs for the HTTPS stack
```

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Arco Design Components](https://arco.design/react/docs/start)
