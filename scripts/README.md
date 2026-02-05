# Build Scripts Documentation

This directory contains scripts for building, packaging, and maintaining AionUI across different platforms and architectures.

## Scripts Overview

| Script | Lines | Purpose |
|--------|-------|---------|
| `build-with-builder.js` | 177 | Coordinates Electron Forge and electron-builder |
| `rebuildNativeModules.js` | 337 | **Unified native module rebuild utility** |
| `afterPack.js` | 207 | Post-packaging native module rebuild (cross-compilation) |
| `afterSign.js` | 47 | macOS code signing and notarization |
| `postinstall.js` | 45 | Post-install native module setup |
| `start-forge.js` | 20 | Electron Forge dev server launcher |
| `remove-i18n.py` | 393 | **One-time script** (i18n removal complete in v1.8.2) |

**Total**: ~833 lines of build infrastructure

## Architecture

### Build Flow

```text
npm run dist:*
    ↓
build-with-builder.js
    ↓
    ├─→ Electron Forge (webpack compilation)
    │   └─→ Output: .webpack/
    ↓
electron-builder
    ↓
    ├─→ Package app to app.asar
    ├─→ afterPack.js → rebuildNativeModules.js (cross-compilation)
    └─→ afterSign.js (macOS only)
```

### Development Flow

```text
npm start / mise run dev
    ↓
start-forge.js
    ↓
electron-forge start
    ↓
Hot reload development server
```

## Native Module Rebuild Strategy

### `rebuildNativeModules.js` - Unified Rebuild Utility

This is the core module that handles all native module rebuilding. It provides:

#### Functions

1. **`rebuildWithElectronRebuild(options)`**
   - Rebuilds all native modules in source directory
   - Modules: `better-sqlite3`

2. **`rebuildSingleModule(options)`**
   - Used by: `afterPack.js`
   - Rebuilds a single module in packaged app
   - Strategy: Try prebuild-install first, fall back to electron-rebuild

3. **`verifyModuleBinary(moduleRoot, moduleName)`**
   - Verifies native binary exists after rebuild

4. **Helper utilities**:
   - `normalizeArch()`: Normalize architecture names
   - `getModulesToRebuild()`: Get platform-specific module list
   - `buildEnvironment()`: Create rebuild environment variables

### Platform-Specific Behavior

#### Windows

- **Modules rebuilt**: `better-sqlite3`
- **Skipped**: `node-pty` (uses prebuilt binaries)
- **Environment**: MSVS 2022, Windows SDK 10.0.19041.0

#### macOS

- **Modules rebuilt**: `better-sqlite3`
- **When**: `afterPack` hook for cross-compilation
- **Post-build**: Code signing and notarization

#### Linux

- **Modules rebuilt**: `better-sqlite3`
- **Strategy**: Download prebuilt binary first, compile if unavailable
- **Docker**: Uses prebuild binaries (no native compilation needed)

## Usage Examples

### Building for specific platform

```bash
# Build for macOS (using mise tasks)
mise run build:mac

# Build for Windows
mise run build:win

# Build for Linux
mise run build:linux

# Or using npm directly
npm run dist:mac
npm run dist:win
npm run dist:linux
```

### Manual native module rebuild

```javascript
const { rebuildWithElectronRebuild } = require('./scripts/rebuildNativeModules');

rebuildWithElectronRebuild({
  platform: 'linux',
  arch: 'arm64',
  electronVersion: '37.3.1',
});
```

### Rebuild single module in packaged app

```javascript
const { rebuildSingleModule } = require('./scripts/rebuildNativeModules');

rebuildSingleModule({
  moduleName: 'better-sqlite3',
  moduleRoot: '/path/to/app.asar.unpacked/node_modules/better-sqlite3',
  platform: 'linux',
  arch: 'arm64',
  electronVersion: '37.3.1',
});
```

## Script Details

### `afterPack.js`

Runs after electron-builder packages the app. Main responsibilities:

1. **Cross-compilation detection**: Checks if build arch ≠ target arch
2. **Clean up wrong-architecture artifacts**: Removes `build/` and `bin/` directories
3. **Remove opposite-arch packages**: Cleans up `@lydell/*-x64` when building for `arm64`
4. **Rebuild native modules**: Uses prebuild-install or electron-rebuild
5. **Verify binaries**: Ensures `.node` files exist

### `afterSign.js`

macOS-only. Handles:

1. **Code signature verification**: Checks app is signed before notarization
2. **Notarization**: Submits to Apple's notary service (requires credentials)
3. **Environment variables**: `appleId`, `appleIdPassword`, `teamId`

### `postinstall.js`

Runs after `npm install`. Handles:

1. **CI detection**: Skips rebuild in CI (uses prebuilt binaries)
2. **Local development**: Runs `electron-builder install-app-deps`
3. **npm 11.9+ compatibility**: Avoids `npm_config_build_from_source` warning

### `start-forge.js`

Simple wrapper to start Electron Forge:

1. **Windows fix**: Sets `FORGE_SKIP_NATIVE_REBUILD=true` on Windows
2. **Args forwarding**: Passes extra arguments to Forge

### `remove-i18n.py`

**One-time migration script** — i18n removal was completed in v1.8.2.

This script was used to:

- Replace `t('key')` calls with hardcoded English strings
- Remove `useTranslation` hooks and imports
- Handle interpolation patterns

**Status**: Complete. Kept for historical reference.

## Troubleshooting

### Module not found after packaging

**Symptom**: `Error: Cannot find module 'better-sqlite3'`

**Solution**: Check that:

1. Module is in `electron-builder.yml` → `files` section
2. Module is in `electron-builder.yml` → `asarUnpack` section
3. `afterPack.js` ran successfully during build

### Native module crashes on launch

**Symptom**: App crashes with segfault or binary incompatibility error

**Solution**:

1. Verify target architecture matches build architecture
2. Check that `afterPack.js` rebuilt for correct architecture
3. For Linux ARM64: Ensure prebuild-install found prebuilt binaries

### Cross-compilation fails

**Symptom**: Native module rebuild fails during cross-arch build

**Solution**:

- Windows: This is expected for `node-pty` (uses prebuilt binaries)
- macOS/Linux: Ensure build tools for target architecture are installed
- Consider building on native architecture instead

### npm 11.9+ build_from_source warning

**Symptom**: `Unknown env config: npm_config_build_from_source`

**Solution**: This was fixed in `postinstall.js`. The script no longer passes this env var explicitly.

## Docker Integration

For Docker builds, native modules use prebuild binaries:

1. **No native compilation** in Docker (uses prebuild-install)
2. **Version lock**: Docker uses Node/npm versions from `mise.lock`
3. **Build command**: `mise run docker:build` or `docker-compose build`

See `deploy/docker/Dockerfile` for details.

## Related Files

- `/electron-builder.yml` - electron-builder configuration
- `/forge.config.ts` - Electron Forge configuration
- `/.github/workflows/build-and-release.yml` - CI/CD pipeline
- `/package.json` - Build scripts and dependencies
- `/mise.toml` - Task definitions and tool versions
