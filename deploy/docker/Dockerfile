# =============================================================================
# AionUI Docker Image
# Multi-stage build for running AionUI WebUI server in a container
#
# Uses hybrid build: Electron Forge (webpack) + electron-builder (packaging)
# This matches the project's standard build pipeline (scripts/build-with-builder.js)
#
# Build from project root:
#   docker build -f deploy/docker/Dockerfile -t aionui .
#
# Or use docker-compose:
#   docker-compose -f deploy/docker/docker-compose.yml build
#
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# Compiles webpack bundles via Forge, then packages with electron-builder
# -----------------------------------------------------------------------------
# Node version pinned to match mise.lock for reproducible builds.
# Update this when mise.lock changes: check with `grep version mise.lock`
# Or build with: docker build --build-arg NODE_VERSION=24.13.0 ...
ARG NODE_VERSION=24.13.0
FROM node:${NODE_VERSION}-bookworm AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, node-pty, bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

# Upgrade npm to match project requirements (Node 24 bundles npm 11.6.x, project standardizes on 11.9+).
# Version pinned to match mise.lock. Update when mise.lock changes.
ARG NPM_VERSION=11.9.0
RUN npm install -g npm@${NPM_VERSION}

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (--ignore-scripts: native modules rebuilt by Forge later)
# Mount npm cache for faster repeat installs across builds
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --ignore-scripts

# Copy source code and build configuration
COPY . .

# --- Step 1: Forge webpack compilation + native module rebuild ---
# electron-forge compiles webpack bundles (.webpack/) and rebuilds native
# modules against Electron's Node ABI. Do NOT set CI=true — that would skip
# native module rebuilding (rebuildConfig.onlyModules: [] in forge.config.ts).
# Increase Node heap for webpack — default 2GB is insufficient for full rebuild.
#
# Cache mounts:
#   - /root/.cache/electron: Electron binary download (~100-250MB per arch).
#     Persisted across builds so Electron doesn't re-download every time.
#   - /app/.webpack-cache: Webpack 5 filesystem cache for incremental rebuilds.
#     Only changed modules are recompiled, cutting webpack time dramatically.
#
# AIONUI_BRAND_NAME: Custom brand name baked into the build (HTML title, default configs).
# Pass via: docker build --build-arg AIONUI_BRAND_NAME="My Brand" ...
ARG TARGETARCH=arm64
ARG AIONUI_BRAND_NAME=AionUi
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV AIONUI_BRAND_NAME=${AIONUI_BRAND_NAME}
RUN --mount=type=cache,target=/root/.cache/electron,sharing=locked \
    --mount=type=cache,target=/app/.webpack-cache,sharing=locked \
    npm exec electron-forge -- package --platform=linux --arch=${TARGETARCH}

# Ensure .webpack output is at the expected location for electron-builder.
# Forge may output to .webpack/{arch}/ — normalize to .webpack/main & .webpack/renderer
RUN if [ -d ".webpack/${TARGETARCH}/main" ] && [ ! -d ".webpack/main" ]; then \
    cp -r ".webpack/${TARGETARCH}/main" ".webpack/main"; \
    cp -r ".webpack/${TARGETARCH}/renderer" ".webpack/renderer"; \
    fi

# --- Step 2: electron-builder packaging ---
# electron-builder reads electron-builder.yml which:
#   - Includes native modules in the asar (files: node_modules/better-sqlite3/**)
#   - Unpacks them to app.asar.unpacked/ (asarUnpack patterns)
#   - Runs afterPack.js to rebuild native modules for target arch if cross-compiling
# Output: out/linux-unpacked/
RUN npx electron-builder --linux dir --${TARGETARCH} --publish=never

# Normalize output directory name: electron-builder may produce
# linux-unpacked (x64 default) or linux-arm64-unpacked (arm64).
# Rename to a consistent linux-unpacked for the COPY stage.
RUN if [ -d "/app/out/linux-arm64-unpacked" ] && [ ! -d "/app/out/linux-unpacked" ]; then \
    mv /app/out/linux-arm64-unpacked /app/out/linux-unpacked; \
    fi

# Verify the build produced expected output
# Note: Using bash with pipefail for pipe safety (DL4006)
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN echo "=== Build verification ===" && \
    ls -la /app/out/linux-unpacked/resources/ && \
    echo "--- app.asar.unpacked ---" && \
    (ls -la /app/out/linux-unpacked/resources/app.asar.unpacked/node_modules/ 2>/dev/null || echo "WARNING: no app.asar.unpacked") && \
    echo "--- native modules ---" && \
    find /app/out/linux-unpacked/resources/app.asar.unpacked -name "*.node" 2>/dev/null | head -20 && \
    echo "=== Verification complete ==="

# -----------------------------------------------------------------------------
# Stage 2: CLI Installer (Multi-Agent Mode)
# Installs ALL CLI tools for multi-agent orchestration.
# All tools are baked into the image; runtime env vars control which are enabled.
#
# IMPORTANT: Uses a fresh node base instead of FROM builder so this stage
# builds in PARALLEL with the builder and is cached independently of source
# changes. Only a package-lock.json or Node version change invalidates it.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS cli-installer

ARG NPM_VERSION=11.9.0
RUN npm install -g npm@${NPM_VERSION}

# Install ALL CLI tools globally (no conditionals - always baked in)
# Combined into a single RUN to minimize layers and maximize cache hits.
# Mount npm cache so repeated builds don't re-download packages.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    echo "📦 Installing Multi-Agent CLI tools..." && \
    npm install -g @anthropic-ai/claude-code && \
    npm install -g @qwen-code/qwen-code && \
    npm install -g @openai/codex && \
    npm install -g @iflow-ai/iflow-cli && \
    npm install -g @augmentcode/auggie && \
    npm install -g @github/copilot && \
    npm install -g @qoder-ai/qodercli && \
    npm install -g opencode-ai && \
    echo "✅ All CLI tools installed"

# -----------------------------------------------------------------------------
# Stage 3: Runtime
# Minimal image with only runtime dependencies
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# OCI Image Labels
ARG APP_VERSION=0.0.0
ARG AIONUI_BRAND_NAME=AionUi
LABEL org.opencontainers.image.source="https://github.com/jrmatherly/aionui" \
    org.opencontainers.image.title="${AIONUI_BRAND_NAME}" \
    org.opencontainers.image.description="${AIONUI_BRAND_NAME} WebUI Server - Transform CLI AI agents into a modern chat interface" \
    org.opencontainers.image.version="${APP_VERSION}" \
    org.opencontainers.image.licenses="Apache-2.0"

# Install Electron runtime dependencies and Xvfb for headless operation
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Electron/Chromium dependencies
    libgtk-3-0 \
    libnss3 \
    libasound2 \
    libgbm1 \
    libxss1 \
    libxtst6 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libpango-1.0-0 \
    libcairo2 \
    libxkbcommon0 \
    libatspi2.0-0 \
    # Virtual display for headless Electron
    xvfb \
    dbus-x11 \
    # Process management
    tini \
    # Utilities
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# -----------------------------------------------------------------------------
# Multi-Agent CLI: Copy Node.js runtime + installed CLIs from cli-installer
# All CLI tools are always included; runtime env vars control which are enabled.
# -----------------------------------------------------------------------------

# Copy Node.js binary and global npm packages from cli-installer
COPY --from=cli-installer /usr/local/bin/node /usr/local/bin/node
COPY --from=cli-installer /usr/local/lib/node_modules /usr/local/lib/node_modules

# Create symlinks for npm, npx, and all CLI tools
# Paths verified via: npm view <package> bin --json
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx && \
    ln -sf /usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js /usr/local/bin/claude && \
    ln -sf /usr/local/lib/node_modules/@qwen-code/qwen-code/cli.js /usr/local/bin/qwen && \
    ln -sf /usr/local/lib/node_modules/@openai/codex/bin/codex.js /usr/local/bin/codex && \
    ln -sf /usr/local/lib/node_modules/@iflow-ai/iflow-cli/bundle/entry.js /usr/local/bin/iflow && \
    ln -sf /usr/local/lib/node_modules/@augmentcode/auggie/augment.mjs /usr/local/bin/auggie && \
    ln -sf /usr/local/lib/node_modules/@github/copilot/npm-loader.js /usr/local/bin/copilot && \
    ln -sf /usr/local/lib/node_modules/@qoder-ai/qodercli/bin/qodercli /usr/local/bin/qodercli && \
    ln -sf /usr/local/lib/node_modules/opencode-ai/bin/opencode /usr/local/bin/opencode && \
    echo "✅ Node.js, npm, npx, and all CLI tools installed"

# Add global npm bin directory to PATH (for CLI executables)
ENV PATH="/usr/local/lib/node_modules/.bin:${PATH}"

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash --uid 1000 aionui

# Set working directory
WORKDIR /app

# Copy built application from builder stage
# electron-builder outputs to out/linux-unpacked/
COPY --from=builder /app/out/linux-unpacked /app

# Copy entrypoint script
COPY deploy/docker/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create data directory, X11 socket dir, and D-Bus system bus dir
# /tmp/.X11-unix — needed by Xvfb (avoids _XSERVTransmkdir error when running as non-root)
# /run/dbus — needed for D-Bus system bus (avoids Electron dbus/bus.cc errors)
RUN mkdir -p /home/aionui/.config/AionUi /tmp/.X11-unix /run/dbus /var/log/aionui \
    && chmod 1777 /tmp/.X11-unix \
    && chown -R aionui:aionui /home/aionui /app /var/log/aionui

# Switch to non-root user
USER aionui

# Environment configuration
ENV DISPLAY=:99 \
    AIONUI_PORT=25808 \
    AIONUI_ALLOW_REMOTE=true \
    NODE_ENV=production \
    # Disable Electron sandbox (required for Docker)
    ELECTRON_DISABLE_SANDBOX=1

# Expose WebUI port
EXPOSE 25808

# Health check - verify WebUI is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:${AIONUI_PORT}/ || exit 1

# Volume for persistent data (database, config, sessions)
VOLUME ["/home/aionui/.config/AionUi"]

# Use tini as init system for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]

# Default command (can be overridden)
CMD []
