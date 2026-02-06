---
paths:
  - 'src/webserver/auth/**'
  - 'src/webserver/routes/authRoutes.ts'
  - 'src/webserver/routes/adminRoutes.ts'
  - 'src/renderer/pages/admin/**'
  - 'src/renderer/pages/login/**'
  - 'src/renderer/pages/profile/**'
  - 'src/renderer/context/AuthContext.tsx'
---

# Authentication & Authorization

## Multi-User Support

- **OIDC/SSO Integration**: EntraID (Azure AD) and other OIDC providers for enterprise single sign-on
- **Local Admin Account**: Fallback authentication with bcrypt password hashing
- **RBAC**: Role-based access control with three tiers (admin, user, viewer)
- **Data Isolation**: Conversation and session data scoped by user
- **Token Management**: JWT access tokens (15min) with refresh token rotation (7d) and blacklist support

## Admin Features

- **User Management**: Admin page for user CRUD and role assignment (`src/renderer/pages/admin/UserManagement.tsx`)
- **Group Mappings**: Map OIDC groups to application roles (`src/renderer/pages/admin/GroupMappings.tsx`)
- **Global Models**: Shared model configurations with optional group-based access control (`src/renderer/pages/admin/GlobalModels.tsx`)
- **Logging Settings**: Runtime logging, OTEL, syslog, Langfuse configuration (`src/renderer/pages/admin/LoggingSettings.tsx`)
- **Profile Page**: User profile with password change capability (`src/renderer/pages/settings/ProfilePage.tsx`)

## Middleware Stack

- **RoleMiddleware**: Enforce role-based access to admin routes
- **DataScopeMiddleware**: Filter database queries by user ownership
- **TokenMiddleware**: Validate and refresh JWT tokens

## Services

- **OidcService** (`src/webserver/auth/service/OidcService.ts`): Handle OIDC discovery, authorization, and token exchange
- **AuthService** (enhanced): Refresh token rotation, token blacklist, password management

## Configuration

- **oidcConfig.ts**: OIDC provider settings (issuer, client credentials, scopes)
- **groupMappings.ts**: Map OIDC groups to roles (JSON or file-based)
- Environment variables: `OIDC_ENABLED`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, etc.
- **GLOBAL_MODELS**: JSON array to pre-configure shared models (synced to DB on startup)

  ```json
  [
    { "platform": "openai", "name": "Economy", "models": ["gpt-4o-mini"] },
    { "platform": "openai", "name": "Premium", "models": ["gpt-4o"], "allowed_groups": ["AI-Power-Users"] }
  ]
  ```

  - `allowed_groups`: Optional array of group names for access control (matches GROUP_MAPPINGS)
  - No `allowed_groups` = available to everyone; admins bypass all restrictions

## Security

- bcrypt-ts@8.0.1 for password hashing
- CSRF protection via tiny-csrf (exclusions: /login, /logout, /api/auth/refresh, /api/auth/qr-login)
- Express `trust proxy` via `AIONUI_TRUST_PROXY` env var (required behind reverse proxy)
- Cookie `Secure` flag conditional on `AIONUI_HTTPS=true`
- HSTS header when HTTPS enabled (1yr, includeSubDomains)
