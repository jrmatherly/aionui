# AionUI Authentication System

## Overview

Multi-user enterprise authentication added February 2026. Supports both local admin and OIDC SSO.

## Architecture

### Auth Flow

- **Local login:** `POST /login` → bcryptjs password verify → JWT access token (15min) + refresh token (7d)
- **OIDC SSO:** `GET /api/auth/oidc/login` → EntraID redirect → callback → JIT user provisioning → JWT pair
- **Token refresh:** `POST /api/auth/refresh` → rotate refresh token, issue new access token
- **Desktop:** No auth required (Electron app, single user)

### Key Files

- `src/webserver/auth/service/AuthService.ts` — Token generation, password hashing, blacklist management
- `src/webserver/auth/service/OidcService.ts` — OIDC discovery, authorization flow, JIT provisioning
- `src/webserver/auth/middleware/AuthMiddleware.ts` — Request authentication
- `src/webserver/auth/middleware/TokenMiddleware.ts` — JWT extraction and validation
- `src/webserver/auth/middleware/RoleMiddleware.ts` — Role-based access control (requireAdmin, requireRole)
- `src/webserver/auth/middleware/DataScopeMiddleware.ts` — User data isolation (scopeToUser)
- `src/webserver/auth/repository/UserRepository.ts` — Database operations for users
- `src/webserver/auth/config/oidcConfig.ts` — OIDC configuration from environment
- `src/webserver/auth/config/groupMappings.ts` — EntraID group → app role mapping
- `src/webserver/routes/authRoutes.ts` — Login, logout, refresh, OIDC, change password endpoints
- `src/webserver/routes/adminRoutes.ts` — User management, role changes (admin only)

### Database

- **Schema version:** 12 (`CURRENT_DB_VERSION` in `src/process/database/schema.ts`)
- **Tables:** `users` (with role, auth_method, oidc_subject, display_name, groups, avatar_url), `refresh_tokens`, `token_blacklist`
- **Migrations:** v10 (auth columns), v11 (refresh tokens + blacklist), v12 (avatar_url)

### Frontend

- `src/renderer/context/AuthContext.tsx` — Auth state management, login/logout/refresh
- `src/renderer/pages/login/index.tsx` — Login page (OIDC primary, local collapsible)
- `src/renderer/components/UserMenu/index.tsx` — Sidebar avatar dropdown
- `src/renderer/pages/profile/ProfilePage.tsx` — User profile with avatar

### Roles

- `admin` — Full access, user management, group mapping viewer
- `user` — Standard access, own conversations
- `viewer` — Read-only access

### Security

- bcryptjs (13 rounds) for password hashing
- CSRF protection via tiny-csrf (exclusions: /login, /logout, /api/auth/refresh, /api/auth/qr-login)
- Token blacklist persisted in SQLite with in-memory cache
- Rate limiting per authenticated user (falls back to IP)
- Security headers: HSTS, Permissions-Policy, CSP, X-Frame-Options

### OIDC Configuration

- Provider: Microsoft EntraID (tested and verified)
- Scopes: openid, profile, email, User.Read (for Graph API profile photos)
- Group mappings: File-based (`GROUP_MAPPINGS_FILE`) or env var (`GROUP_MAPPINGS_JSON`)
- JIT user provisioning on first OIDC login
- Display name normalization: "Last, First" → "First Last"

## Key Decisions

- Desktop stays login-free; multi-user targets WebUI/Docker/K8s only
- SQLite for token blacklist (not Redis) — single-node deployment
- 15min access / 7d refresh token split
- `bcryptjs` (pure JS) not `bcrypt` (native) — no packaging concerns
- `openid-client@5.7.1` for OIDC (certified library, pure JS)
