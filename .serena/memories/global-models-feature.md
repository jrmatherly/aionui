# Global Models Feature

**Added:** 2026-02-05  
**DB Version:** 16

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
└── schema.ts (DB_VERSION = 16)

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
