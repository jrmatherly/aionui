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
FROM node:22-bookworm AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, node-pty, bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (--ignore-scripts: native modules rebuilt by Forge later)
RUN npm ci --ignore-scripts

# Copy source code and build configuration
COPY . .

# --- Step 1: Forge webpack compilation + native module rebuild ---
# electron-forge compiles webpack bundles (.webpack/) and rebuilds native
# modules against Electron's Node ABI. Do NOT set CI=true — that would skip
# native module rebuilding (rebuildConfig.onlyModules: [] in forge.config.ts).
ARG TARGETARCH=arm64
RUN npm exec electron-forge -- package --platform=linux --arch=${TARGETARCH}

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
# Stage 2: Runtime
# Minimal image with only runtime dependencies
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# OCI Image Labels
LABEL org.opencontainers.image.source="https://github.com/jrmatherly/aionui" \
    org.opencontainers.image.title="AionUI" \
    org.opencontainers.image.description="AionUI WebUI Server - Transform CLI AI agents into a modern chat interface" \
    org.opencontainers.image.version="1.8.1" \
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

# Create data directory with correct permissions
# AionUI stores data in ~/.config/AionUi on Linux
RUN mkdir -p /home/aionui/.config/AionUi \
    && chown -R aionui:aionui /home/aionui /app

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
