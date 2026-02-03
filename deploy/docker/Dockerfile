# =============================================================================
# AionUI Docker Image
# Multi-stage build for running AionUI WebUI server in a container
# =============================================================================
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
# Compiles the application with all dependencies
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

# Install dependencies without running postinstall (scripts not yet copied)
# Set CI=true to use prebuilt binaries for native modules
ENV CI=true
RUN npm ci --ignore-scripts

# Copy source code and build configuration
COPY . .

# Run postinstall manually after source is available
# CI=true skips electron-builder install-app-deps (uses prebuilt binaries)
RUN npm run postinstall

# Build the application using Electron Forge
# This creates the packaged application in out/AionUi-linux-x64/
ARG TARGETARCH=x64
RUN npm exec electron-forge -- package --platform=linux --arch=${TARGETARCH}

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
# The packaged app is in out/AionUi-linux-{arch}/
ARG TARGETARCH=x64
COPY --from=builder /app/out/AionUi-linux-${TARGETARCH} /app

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
