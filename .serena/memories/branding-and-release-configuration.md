# AionUI Branding & Release Configuration

## Overview

This memory documents how to configure branding for AionUI custom forks/deployments. The branding system supports both **build-time** and **runtime** customization.

---

## Build-Time vs Runtime Branding

| Layer | Method | When Applied | Use Case |
|-------|--------|--------------|----------|
| HTML `<title>` | BrandingInjectorPlugin (webpack) | Build time | Eliminates title flash |
| React components | `process.env.AIONUI_BRAND_NAME` via DefinePlugin | Build time | Immediate correct brand |
| useBranding default | DefinePlugin value | Build time | No hydration flash |
| Server messages | `getBrandName()` reads env | Runtime | Channel bot messages |
| HTTP headers | `getBrandName()` reads env | Runtime | API requests |
| OCI image labels | Docker build arg | Build time | Container metadata |

**Key insight**: Build-time branding eliminates the "flash of default brand" that occurs when relying solely on runtime configuration.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AIONUI_BRAND_NAME` | `AionUi` | Display name throughout UI and messages |
| `AIONUI_GITHUB_REPO` | `jrmatherly/aionui` | GitHub repo for updates and wiki links |
| `AIONUI_WEBSITE_URL` | `https://github.com/jrmatherly/aionui` | Website link in About page |
| `AIONUI_CONTACT_URL` | `https://github.com/jrmatherly` | Contact link in About page |
| `AIONUI_FEEDBACK_URL` | `https://github.com/jrmatherly/aionui/discussions` | Feedback link |

---

## Usage

### Local Development Build

```bash
# Option 1: mise task with --brand flag
mise run build:branded --brand "Enterprise AI"

# Option 2: Set env var, then build
export AIONUI_BRAND_NAME="Enterprise AI"
mise run build

# Option 3: npm directly
AIONUI_BRAND_NAME="Enterprise AI" npm run build
```

### Docker Build

```bash
# Option 1: mise task with --brand flag
mise run docker:build --brand "Enterprise AI" --tag myapp:latest

# Option 2: docker build directly
docker build \
  --build-arg AIONUI_BRAND_NAME="Enterprise AI" \
  -f deploy/docker/Dockerfile \
  -t myapp:latest .

# Option 3: docker-compose (set in .env, then build)
echo 'AIONUI_BRAND_NAME="Enterprise AI"' >> deploy/docker/.env
docker-compose -f deploy/docker/docker-compose.yml build
```

### Runtime Override (Server Only)

For messages sent via Telegram/Lark bots and HTTP headers, you can also override at runtime:

```bash
# In docker-compose.yml or .env
AIONUI_BRAND_NAME="Enterprise AI"
```

Note: Runtime override does NOT affect build-time elements (HTML title, React defaults).

---

## Architecture

### Build-Time Injection

**File**: `config/webpack/webpack.plugins.ts`

```typescript
// Read brand name from environment at build time
const BRAND_NAME = process.env.AIONUI_BRAND_NAME || 'AionUi';

// DefinePlugin exposes to renderer code
new webpack.DefinePlugin({
  'process.env.AIONUI_BRAND_NAME': JSON.stringify(BRAND_NAME),
}),

// BrandingInjectorPlugin replaces <title> in HTML
class BrandingInjectorPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('BrandingInjectorPlugin', (compilation) => {
      const hooks = HtmlWebpackPlugin.getCompilationHooks(compilation);
      hooks.beforeEmit.tapAsync('BrandingInjectorPlugin', (data, cb) => {
        data.html = data.html.replace(/<title>[^<]*<\/title>/, `<title>${BRAND_NAME}</title>`);
        cb(null, data);
      });
    });
  }
}
```

### Runtime Injection

**File**: `src/common/branding.ts`

```typescript
export function getBrandName(): string {
  return env('AIONUI_BRAND_NAME', DEFAULT_BRAND_NAME);
}

export function getBrandingConfig(): BrandingConfig {
  return {
    brandName: getBrandName(),
    // ... other config
  };
}
```

### Renderer Hook

**File**: `src/renderer/hooks/useBranding.ts`

```typescript
// Uses build-time value as default (no flash)
const BUILD_TIME_BRAND = process.env.AIONUI_BRAND_NAME || 'AionUi';

const DEFAULTS: BrandingConfig = {
  brandName: BUILD_TIME_BRAND,
  // ...
};

export function useBranding(): BrandingConfig {
  const [config, setConfig] = useState<BrandingConfig>(DEFAULTS);
  
  useEffect(() => {
    // Fetch runtime config (may override for server-side values)
    fetchBranding().then(setConfig);
  }, []);
  
  return config;
}
```

---

## Files Using Branding

### UI Components (use `useBranding()` hook)

| File | What's Branded |
|------|----------------|
| `layout.tsx` | Sidebar title, document.title |
| `LoginPage.tsx` | Page title, logo alt, copyright |
| `Titlebar/index.tsx` | Window title bar |
| `AboutModalContent.tsx` | App name in about dialog |
| `ChannelModalContent.tsx` | Channel descriptions |
| `WebuiModalContent.tsx` | Desktop app references |
| `OneClickImportModal.tsx` | MCP import description |

### Server-Side (use `getBrandName()`)

| File | What's Branded |
|------|----------------|
| `LarkCards.ts` | Bot card headers, pairing instructions |
| `PlatformActions.ts` | Pairing flow messages |
| `SystemActions.ts` | Help messages, settings text |
| `ClientFactory.ts` | X-Title HTTP header |
| `modelBridge.ts` | User-Agent header |
| `fsBridge.ts` | User-Agent for preview fetches |
| `updateBridge.ts` | User-Agent, temp file names |
| `authRoutes.ts` | QR login page title |
| `webserver/index.ts` | Startup banner |

---

## Dockerfile Integration

**File**: `deploy/docker/Dockerfile`

```dockerfile
# Build stage
ARG AIONUI_BRAND_NAME=AionUi
ENV AIONUI_BRAND_NAME=${AIONUI_BRAND_NAME}

# Brand is baked into webpack build
RUN npm exec electron-forge -- package ...

# Runtime stage
ARG AIONUI_BRAND_NAME=AionUi
LABEL org.opencontainers.image.title="${AIONUI_BRAND_NAME}"
```

---

## mise Tasks

**File**: `mise.toml`

```toml
[tasks."build:branded"]
description = "Build with custom brand name"
usage = '''
flag "--brand <name>" help="Custom brand name"
'''
run = """
if [ -n "${usage_brand:-}" ]; then
  export AIONUI_BRAND_NAME="${usage_brand}"
fi
npm run build
"""

[tasks."docker:build"]
# --brand flag passes AIONUI_BRAND_NAME to Docker build
```

---

## Do NOT Modify

These should NOT be changed (functional, not branding):

- `AIONUI_PORT`, `AIONUI_ALLOW_REMOTE` - Functional env vars
- `AIONUI_TIMESTAMP_SEPARATOR`, `AIONUI_FILES_MARKER` - Internal markers
- `~/.config/AionUi` data paths - Would break existing installs
- Copyright headers in source files - Legal requirement
- Wiki page URL slugs (e.g., `AionUi-Image-Generation-Tool...`) - Actual GitHub URLs

---

## Version History

- **Feb 5, 2026**: Implemented build-time branding via webpack BrandingInjectorPlugin
- **Feb 4, 2026**: Added `useBranding()` hook and runtime env var support
- **Initial**: Hardcoded brand names throughout codebase
