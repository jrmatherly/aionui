# Per-User API Key Isolation

This guide explains how AionUI isolates API keys between users in a multi-user deployment, ensuring that User A's API keys are never used for User B's CLI agent sessions.

## Overview

In multi-user deployments, each user can store their own API keys for various AI providers (Anthropic, OpenAI, Google, etc.). When a user starts a CLI agent conversation (Claude Code, Codex, etc.), their personal API keys are automatically injected into the CLI process environment.

## Global Models: Shared Provider Access

Before diving into per-user key isolation, note that users may not need personal API keys at all if an admin has configured **Global Models**.

Global Models are admin-managed, shared provider configurations with group-based access control. When a Global Model is available for a provider, users see it alongside any personal API keys and can use it without storing their own key.

The per-user API key system described in this guide is still used when:

- Users want their **own keys** for a specific provider (billing isolation, higher rate limits, etc.)
- The admin **hasn't configured** a Global Model for that provider
- A user needs a provider that isn't covered by any Global Model

When both exist, the resolution order is: **user's personal key → Global Model → container env var fallback**.

## Architecture

┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Renderer)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐                         │
│  │      User A         │    │      User B         │                         │
│  │  (userId: user_a)   │    │  (userId: user_b)   │                         │
│  └─────────┬───────────┘    └─────────┬───────────┘                         │
│            │                          │                                     │
│            │ Starts ACP               │ Starts ACP                          │
│            │ Conversation             │ Conversation                        │
│            ▼                          ▼                                     │
│  ┌─────────────────────────────────────────────────┐                        │
│  │         WebSocket Adapter                       │                        │
│  │  Injects __webUiUserId into IPC requests        │                        │
│  └─────────────────────────────────────────────────┘                        │
│                              │                                              │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │ IPC Bridge
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MAIN PROCESS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────┐                        │
│  │         conversationBridge.ts                   │                        │
│  │  • Extracts__webUiUserId from IPC request       │                        │
│  │  • Stores userId in conversations.user_id       │                        │
│  └─────────────────────────────────────────────────┘                        │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────┐                        │
│  │              SQLite Database                    │                        │
│  │  ┌─────────────────────────────────────────┐    │                        │
│  │  │ conversations                           │    │                        │
│  │  │  • id: "conv_123"                       │    │                        │
│  │  │  • user_id: "user_a" ◄─── stored here   │    │                        │
│  │  │  • type: "acp"                          │    │                        │
│  │  └─────────────────────────────────────────┘    │                        │
│  │  ┌─────────────────────────────────────────┐    │                        │
│  │  │ user_api_keys                           │    │                        │
│  │  │  • user_id: "user_a"                    │    │                        │
│  │  │  • provider: "anthropic"                │    │                        │
│  │  │  • encrypted_key: [AES-256-GCM]         │    │                        │
│  │  └─────────────────────────────────────────┘    │                        │
│  └─────────────────────────────────────────────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

## Key Injection Flow

When a user sends a message to their CLI agent conversation:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. Message arrives for conversation "conv_123"                             │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. WorkerManage.getTaskByIdRollbackBuild("conv_123")                       │
│     • Calls db.getConversationWithUserId("conv_123")                        │
│     • Returns { conversation, userId: "user_a" }                            │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. buildConversation(conversation, { userId: "user_a" })                   │
│     • Creates AcpAgentManager with userId                                   │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. AcpAgentManager → AcpAgent → AcpConnection                              │
│     • userId threaded through entire chain                                  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. AcpConnection.connect(..., userId: "user_a")                            │
│     • Calls createGenericSpawnConfig(..., userId)                           │
│     • Calls getEnhancedEnv(customEnv, "user_a")                             │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  6. UserApiKeyService.getEnvForUser("user_a")                               │
│     • Queries user_api_keys WHERE user_id = "user_a"                        │
│     • Decrypts keys using per-user derived key                              │
│     • Returns { ANTHROPIC_API_KEY: "sk-ant-...", ... }                      │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  7. CLI Process spawned with USER-SPECIFIC environment                      │
│                                                                             │
│     spawn("claude", args, {                                                 │
│       env: {                                                                │
│         ...process.env,           // Container defaults                     │
│         ...shellEnv,              // Shell environment (PATH, etc.)         │
│         ...userApiKeys,           // ◄─── User A's decrypted keys           │
│         ...customEnv,             // Custom overrides                       │
│       }                                                                     │
│     })                                                                      │
│                                                                             │
│     ANTHROPIC_API_KEY = "sk-ant-api03-..." (User A's key)                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Environment Variable Priority

When spawning CLI processes, environment variables are merged in this order (later takes precedence):

1. **process.env** — Container-level environment variables
2. **shellEnv** — Shell environment (PATH, SSL certs, etc.)
3. **userApiKeys** — Per-user API keys from database (decrypted)
4. **customEnv** — Custom environment overrides from agent config

This means:

- If User A has stored an `ANTHROPIC_API_KEY`, it overrides the container default
- If User A hasn't stored a key, the container default (if any) is used
- Custom agent configs can override even user keys (for advanced use cases)

## Security Model

### Encryption at Rest

User API keys are encrypted using AES-256-GCM:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  Encryption Key Derivation                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Master Key: JWT_SECRET (from environment)                                  │
│              │                                                              │
│              ▼                                                              │
│  ┌─────────────────────────────────┐                                        │
│  │  HMAC-SHA256(masterKey, userId) │                                        │
│  └─────────────────────────────────┘                                        │
│              │                                                              │
│              ▼                                                              │
│  Per-User Derived Key (unique per user)                                     │
│              │                                                              │
│              ▼                                                              │
│  ┌─────────────────────────────────┐                                        │
│  │  AES-256-GCM Encrypt/Decrypt    │                                        │
│  │  • 12-byte random IV per key    │                                        │
│  │  • 16-byte auth tag             │                                        │
│  └─────────────────────────────────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Isolation Guarantees

1. **Database-level isolation**: Each key has `UNIQUE(user_id, provider)` constraint
2. **Encryption isolation**: Each user's keys are encrypted with a different derived key
3. **Process isolation**: Each CLI spawn is a separate process with its own env vars
4. **No cross-user access**: User A cannot decrypt or access User B's keys

### Frontend Security

- API keys are **never sent to the renderer process**
- Frontend only receives key hints (e.g., `...abc123`)
- All encryption/decryption happens in the main process
- IPC calls for key management only accept/return non-sensitive data

## Database Schema

### user_api_keys Table (Migration v14)

```sql
CREATE TABLE user_api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,           -- 'anthropic', 'openai', 'google', etc.
  encrypted_key TEXT NOT NULL,      -- AES-256-GCM encrypted
  key_hint TEXT,                    -- Last 6 chars for display (e.g., '...abc123')
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, provider)         -- One key per provider per user
);

CREATE INDEX idx_user_api_keys_user_id ON user_api_keys(user_id);
```

## Provider Mapping

The `UserApiKeyService` maps providers to environment variable names.

### Visible in UI (Settings → API Keys)

**Common Providers:**

| Provider | Environment Variable | Description |
|----------|---------------------|-------------|
| anthropic | ANTHROPIC_API_KEY | Claude models |
| openai | OPENAI_API_KEY | GPT, Codex |
| gemini | GEMINI_API_KEY | Google AI Studio |
| groq | GROQ_API_KEY | Fast inference |
| openrouter | OPENROUTER_API_KEY | Multi-model proxy |

**Other Providers:**

| Provider | Environment Variable | Description |
|----------|---------------------|-------------|
| azure | AZURE_OPENAI_API_KEY | Azure-hosted OpenAI |
| cohere | COHERE_API_KEY | Enterprise LLMs |
| perplexity | PERPLEXITY_API_KEY | Search-augmented |

### Hidden from UI (Backend Only)

These providers are supported but not shown in the UI. Users can still use them via container environment variables.

| Provider | Environment Variable |
|----------|---------------------|
| google | GOOGLE_API_KEY (Vertex AI) |
| mistral | MISTRAL_API_KEY |
| deepseek | DEEPSEEK_API_KEY |
| together | TOGETHER_API_KEY |
| fireworks | FIREWORKS_API_KEY |
| dashscope | DASHSCOPE_API_KEY |
| moonshot | MOONSHOT_API_KEY |
| replicate | REPLICATE_API_TOKEN |
| huggingface | HUGGINGFACE_API_KEY |
| aws_access | AWS_ACCESS_KEY_ID |
| aws_secret | AWS_SECRET_ACCESS_KEY |

To re-enable hidden providers, edit `src/common/constants/providers.ts`.

## Files Involved

| File | Purpose |
|------|---------|
| `src/common/constants/providers.ts` | Provider definitions (UI visibility, metadata) |
| `src/common/UserApiKeyService.ts` | Encryption/decryption, env var mapping |
| `src/process/database/index.ts` | `getConversationWithUserId()` method |
| `src/process/WorkerManage.ts` | Threads userId through build chain |
| `src/process/task/AcpAgentManager.ts` | Accepts userId, passes to AcpAgent |
| `src/process/task/CodexAgentManager.ts` | Accepts userId, passes to CodexAgent |
| `src/agent/acp/index.ts` | AcpAgent stores and passes userId |
| `src/agent/acp/AcpConnection.ts` | `connect()` and `createGenericSpawnConfig()` accept userId |
| `src/agent/codex/core/CodexAgent.ts` | CodexAgent stores and passes userId |
| `src/agent/codex/connection/CodexConnection.ts` | `start()` accepts userId |

## Testing

### Verify Key Isolation

1. **Create two users**: User A and User B
2. **Store different API keys** for each user via Settings
3. **Start conversations** for both users with the same CLI agent type
4. **Check process environment**: Each CLI should have the respective user's key

### Debug Logging

Enable debug logging to verify key injection:

```typescript
// In getEnhancedEnv(), add:
if (userId) {
  console.log(`[ACP] Injecting API keys for user: ${userId}`);
  console.log(`[ACP] Keys injected: ${Object.keys(userApiKeys).join(', ')}`);
}
```

## Troubleshooting

### User's key not being used

1. **Check conversation ownership**: Verify the conversation's `user_id` in the database
2. **Check key storage**: Verify the user has a key stored for the provider
3. **Check decryption**: Enable debug logging in `UserApiKeyService`

### Fallback to container key

If a user hasn't stored a key, the CLI will use the container-level environment variable (if set). This is expected behavior for:

- System/default users
- Users who prefer centralized key management
- Development/testing scenarios

### Knowledge Base Embedding Keys

The Knowledge Base (RAG) system uses a separate path for embedding API keys. These are **not** injected via CLI spawn — instead, they're passed to Python scripts via `KnowledgeBaseService` using these environment variables:

| Variable | Description |
|----------|-------------|
| `EMBEDDING_API_KEY` | API key for the embedding provider |
| `EMBEDDING_MODEL` | Embedding model name (e.g., `text-embedding-3-small`) |
| `EMBEDDING_BASE_URL` | Base URL for the embedding API |

The KB system can also auto-use a Global Model with embedding capability. The resolution order is:

1. **Capability match** — A Global Model explicitly tagged with embedding capability
2. **Name match** — A Global Model whose name matches the configured embedding model
3. **Env var fallback** — `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` / `EMBEDDING_BASE_URL` from the environment

## Related Documentation

- [Multi-User Authentication](./GETTING_STARTED.md#multi-user-authentication)
- [Security Model](../architecture/ARCHITECTURE.md#security-considerations)
