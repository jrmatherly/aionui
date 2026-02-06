# Global Models Feature

**Added:** 2026-02-05  
**DB Version:** 18 (v16: tables, v18: allowed_groups)

## Overview

Global Models allow administrators to define shared model configurations that are automatically available to all users. This enables centralized management of AI model access while allowing users to customize their experience.

## Architecture

### Database Schema

**Table: `global_models`**

- Admin-managed model configurations
- Encrypted API keys (AES-256-GCM, derived from JWT_SECRET)
- Priority ordering for display
- Enable/disable toggle

**Table: `user_model_overrides`**

- Tracks per-user overrides for global models
- Override types: `hidden` (user hid it), `modified` (user has local copy)

### Service Layer

**GlobalModelService** (`src/process/services/GlobalModelService.ts`)

- Singleton pattern with `initialize()` / `getInstance()`
- AES-256-GCM encryption for API keys
- Key derivation: `HMAC-SHA256(SHA256(JWT_SECRET), "global_models")`

Key methods:

- `createGlobalModel(dto, adminId)` — Admin creates shared model
- `getVisibleGlobalModels(userId)` — Models not hidden by user
- `getHiddenGlobalModels(userId)` — Models user has hidden
- `hideGlobalModel(userId, modelId)` — User hides a global model
- `unhideGlobalModel(userId, modelId)` — User unhides

### API Endpoints

**Admin (requires admin role):**

- `GET /api/admin/models` — List all global models
- `GET /api/admin/models/:id` — Get single model
- `POST /api/admin/models` — Create global model
- `PATCH /api/admin/models/:id` — Update global model
- `DELETE /api/admin/models/:id` — Delete global model
- `POST /api/admin/models/:id/toggle` — Enable/disable

**User:**

- `GET /api/models/global` — Visible global models
- `GET /api/models/global/hidden` — Hidden global models
- `GET /api/models/global/:id` — Get model details (for copy)
- `POST /api/models/global/:id/hide` — Hide a model
- `POST /api/models/global/:id/unhide` — Unhide a model

### Environment Variable Configuration

**GLOBAL_MODELS** — JSON array to pre-configure shared models without using the UI.

Synced to DB on every startup (upsert by name). Does not delete existing models.

```bash
GLOBAL_MODELS='[
  {
    "platform": "openai",
    "name": "OpenAI GPT-4",
    "api_key": "sk-xxx",
    "models": ["gpt-4", "gpt-4-turbo", "gpt-4o"],
    "base_url": "https://api.openai.com/v1"
  },
  {
    "platform": "anthropic",
    "name": "Anthropic Claude",
    "api_key": "sk-ant-xxx",
    "models": ["claude-3-opus-20240229", "claude-3-sonnet-20240229"]
  }
]'
```

**Schema:**

- `platform` (required): Provider ID (openai, anthropic, azure-openai, etc.)
- `name` (required): Display name (used as unique key for upsert)
- `models` (required): Array of model IDs
- `api_key` (optional): API key (encrypted in DB)
- `base_url` (optional): Custom API endpoint
- `capabilities` (optional): e.g., ["vision", "function_calling"]
- `context_limit` (optional): Token context limit
- `custom_headers` (optional): Additional HTTP headers
- `enabled` (optional, default: true)
- `priority` (optional, default: 0): Sort order (higher = first)

**Implementation:** `src/process/database/migrations/v16_add_global_models.ts` — `syncGlobalModelsFromEnv()`

### UI Components

**Admin:**

- `src/renderer/pages/admin/GlobalModels.tsx` — Admin management page
- `src/renderer/pages/admin/components/GlobalModelForm.tsx` — Add/Edit form
- Route: `/admin/models`
- Menu entry in UserMenu component

**User:**

- `ModelModalContent.tsx` updated with:
  - "Your Models" section (user's local models)
  - "Organization Models" section (visible global models)
  - "Hidden Models" section (models user has hidden)
  - Visual distinction: Planet icon, "Shared" tag, blue tint header
  - Actions: Hide (PreviewCloseOne icon), Copy to local (Copy icon)

## Chat Integration

Global models appear automatically in the chat model selector for WebUI users:

- **modelBridge.ts**: `getModelConfig` IPC handler calls `GlobalModelService.getEffectiveModels()` when `__webUiUserId` is present
- **WebSocket adapter**: Injects `__webUiUserId` into IPC params for all web mode calls
- **Desktop mode**: Unaffected — no userId means local-only models
- **`isGlobal` flag**: Added to `IProvider` interface; used to filter global models out of "Your Models" edit controls while keeping them visible in chat

### Data flow

```
Admin creates model → encrypted API key in DB
→ getEffectiveModels() decrypts + merges local + global
→ getModelConfig IPC returns full IProvider[] (with isGlobal flag)
→ Chat stores TProviderWithModel at conversation creation
→ Messages use stored provider config directly
```

## Model Resolution Chain

When displaying models to a user:

1. User's local models (highest priority)
2. Visible global models (enabled + not hidden by user)

Users can:

- Hide any global model (still works if already in use)
- Copy global model to local (creates personal copy for customization)

## Shared Components

Model forms use shared components from `src/renderer/components/shared/`:

- **ProviderLogo.tsx**: `ProviderLogo`, `renderPlatformOption`, `getProviderLogo` — single source of truth for all provider logo rendering
- **PlatformSelect.tsx**: Reusable alphabetically-sorted provider dropdown with logos
- **GlobalModelForm.tsx**: Uses `useModeModeList` SWR hook for dynamic model fetching (same pattern as `AddPlatformModal`)

## Group-Based Access Control (v18)

**Added:** 2026-02-05

Enables cost-effective model distribution by restricting expensive models to specific EntraID groups.

### Configuration

Add `allowed_groups` to any global model config:

```json
{
  "name": "Economy Models",
  "models": ["gpt-4o-mini"],
  "priority": 5
  // No allowed_groups = everyone
},
{
  "name": "Premium Models",
  "models": ["gpt-4o", "o1-mini"],
  "allowed_groups": ["AI-Power-Users", "AI-Admins"],
  "priority": 20
}
```

### Access Rules

| Scenario                    | Access            |
| --------------------------- | ----------------- |
| No `allowed_groups` or `[]` | Everyone          |
| Admin role                  | Always (bypass)   |
| User with matching group    | Yes               |
| User without matching group | No                |
| Local auth user (no OIDC)   | Unrestricted only |

### Group Matching

Groups matched by **name** (not ID) for readability. Resolution:

1. Check if user's group IDs contain the allowed value (direct ID match)
2. Look up group name in `GROUP_MAPPINGS` → resolve to groupId → check match

### Implementation

**Schema (v18):**

```sql
ALTER TABLE global_models ADD COLUMN allowed_groups TEXT;
-- JSON array of group names, NULL = everyone
```

**Service (`GlobalModelService.ts`):**

```typescript
private hasGroupAccess(userGroups: string[] | null, userRole: UserRole, allowedGroups: string[] | null): boolean {
  if (userRole === 'admin') return true;
  if (!allowedGroups?.length) return true;
  if (!userGroups?.length) return false;
  // Match by ID or resolve name via GROUP_MAPPINGS
}
```

**Token Flow:**

1. User logs in → groups extracted from OIDC claims
2. JWT access token includes `groups` array
3. WebSocket connection stores `groups` and `role`
4. IPC messages include `__webUiUserGroups` and `__webUiUserRole`
5. `getEffectiveModels()` filters by group access

### Files Modified

- `v18_add_global_model_groups.ts` — Migration
- `GlobalModelService.ts` — `hasGroupAccess()` + filtered queries
- `AuthService.ts` — Groups in JWT payload
- `WebSocketManager.ts` — Store/retrieve groups and role
- `adapter.ts` — Inject user context into IPC
- `apiRoutes.ts` — Pass groups/role to service
- `types.ts` — `allowed_groups` in interfaces
- `express.d.ts` — Groups in Request.user

## Embedding Model Integration

**Added:** 2026-02-06 (commits: `b09dad7a`, `885f2dca`)

Global Models now serve as the source of truth for **Knowledge Base embeddings**, eliminating the need for separate `OPENAI_API_KEY` configuration.

### How It Works

`KnowledgeBaseService.getEmbeddingModelFromGlobalModels()` searches for embedding providers:

1. **Capability match**: Models with `embedding` in capabilities array
2. **Name match**: Models with `embedding` in model name (e.g., `text-embedding-3-small`)

### Configuration Example

Add an embedding model to Global Models:

| Field    | Value                    |
| -------- | ------------------------ |
| Platform | `openai`                 |
| Name     | `Embeddings`             |
| Models   | `text-embedding-3-small` |
| API Key  | Your key (encrypted)     |
| Base URL | Gateway URL (optional)   |

### Resolution Priority

1. Global Model with embedding capability/name
2. Environment variables (`OPENAI_API_KEY`, `OPENAI_BASE_URL`)
3. Default: `text-embedding-3-small` (requires valid API key)

### Gateway Support

Works with any OpenAI-compatible endpoint:

- Azure OpenAI
- Portkey
- LiteLLM
- Kong AI Gateway

Set `base_url` in the Global Model configuration to use custom endpoints.

### Related Files

- `KnowledgeBaseService.ts` — `getEmbeddingModelFromGlobalModels()`
- `skills/lance/scripts/ingest.py` — `get_embedding_config()`

## Security

- API keys stored encrypted (never exposed to frontend)
- Only `apiKeyHint` (last 4 chars) shown in admin UI
- Admin role required for all management operations
- Users can only manage their own hide/unhide overrides
- Global models filtered from "Your Models" edit/delete controls via `isGlobal` flag
- Decrypted keys included in IProvider for chat functionality but never shown in settings UI

## Files

```
src/process/database/
├── migrations/v16_add_global_models.ts
├── types.ts (IGlobalModel, IUserModelOverride, etc.)
└── schema.ts (CURRENT_DB_VERSION = 18)

src/process/services/
└── GlobalModelService.ts

src/webserver/routes/
├── adminRoutes.ts (admin endpoints)
└── apiRoutes.ts (user endpoints)

src/renderer/
├── pages/admin/
│   ├── GlobalModels.tsx
│   └── components/GlobalModelForm.tsx
├── components/SettingsModal/contents/
│   └── ModelModalContent.tsx
├── components/UserMenu/index.tsx (menu entry)
└── router.tsx (route registration)
```
