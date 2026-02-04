#!/bin/bash
# =============================================================================
# AionUI Docker Entrypoint Script
# Initializes virtual display and starts AionUI WebUI server
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
DISPLAY_NUM="${DISPLAY_NUM:-99}"
SCREEN_RESOLUTION="${SCREEN_RESOLUTION:-1024x768x24}"

export DISPLAY=":${DISPLAY_NUM}"

# -----------------------------------------------------------------------------
# Start Xvfb (Virtual Framebuffer)
# Electron requires a display server, even in headless mode
# -----------------------------------------------------------------------------
echo "🖥️  Starting Xvfb on display :${DISPLAY_NUM}..."
Xvfb ":${DISPLAY_NUM}" -screen 0 "${SCREEN_RESOLUTION}" -ac +extension GLX +render -noreset &
XVFB_PID=$!

# Wait for Xvfb socket to be ready (up to 5 seconds)
echo "⏳ Waiting for Xvfb to be ready..."
for i in {1..20}; do
    if [ -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
        break
    fi
    sleep 0.25
done

# Verify Xvfb is running and socket exists
if ! kill -0 $XVFB_PID 2>/dev/null; then
    echo "❌ Failed to start Xvfb"
    exit 1
fi
if [ ! -e "/tmp/.X11-unix/X${DISPLAY_NUM}" ]; then
    echo "❌ Xvfb socket not found after timeout"
    exit 1
fi
echo "✅ Xvfb started successfully (PID: $XVFB_PID)"

# -----------------------------------------------------------------------------
# Start D-Bus (required by Electron)
# Session bus for IPC; redirect system bus to session bus to prevent
# "Failed to connect to /run/dbus/system_bus_socket" errors
# -----------------------------------------------------------------------------
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ]; then
    echo "🔌 Starting D-Bus session..."
    eval "$(dbus-launch --sh-syntax)"
    export DBUS_SESSION_BUS_ADDRESS
fi
# Electron also checks the system bus — point it to our session bus
export DBUS_SYSTEM_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS"

# -----------------------------------------------------------------------------
# Build startup arguments
# -----------------------------------------------------------------------------
AIONUI_ARGS="--webui --no-sandbox --disable-gpu --disable-software-rasterizer"

# Enable remote access if configured
if [ "${AIONUI_ALLOW_REMOTE}" = "true" ] || [ "${AIONUI_ALLOW_REMOTE}" = "1" ]; then
    AIONUI_ARGS="${AIONUI_ARGS} --remote"
    echo "🌐 Remote access enabled"
fi

# Set custom port if specified
if [ -n "${AIONUI_PORT}" ]; then
    AIONUI_ARGS="${AIONUI_ARGS} --port ${AIONUI_PORT}"
    echo "🔌 Using port: ${AIONUI_PORT}"
fi

# -----------------------------------------------------------------------------
# Cleanup handler
# Note: This trap handles signals received BEFORE exec replaces this shell.
# After exec, tini handles signal forwarding to the AionUI process.
# -----------------------------------------------------------------------------
cleanup() {
    echo "🛑 Shutting down..."

    # Kill Xvfb
    if [ -n "$XVFB_PID" ] && kill -0 $XVFB_PID 2>/dev/null; then
        kill $XVFB_PID 2>/dev/null || true
    fi

    exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# -----------------------------------------------------------------------------
# Detect Available CLI Tools (Multi-Agent Mode)
# -----------------------------------------------------------------------------
echo "🔍 Detecting Multi-Agent CLI tools..."
CLI_FOUND=0
for cli in claude qwen codex iflow auggie copilot qodercli opencode kimi goose droid; do
    if command -v "$cli" &> /dev/null; then
        echo "   ✅ $cli found: $(command -v "$cli")"
        CLI_FOUND=$((CLI_FOUND + 1))
    fi
done
if [ "$CLI_FOUND" -eq 0 ]; then
    echo "   ℹ️  No CLI tools detected. Multi-Agent mode will use built-in Gemini only."
    echo "   💡 Rebuild with --build-arg INSTALL_CLAUDE_CODE=true to add CLI tools."
fi
echo ""

# -----------------------------------------------------------------------------
# Start AionUI
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
echo "🚀 Starting AionUI WebUI Server"
echo "=============================================="
echo "   Port:        ${AIONUI_PORT:-25808}"
echo "   Remote:      ${AIONUI_ALLOW_REMOTE:-false}"
echo "   Display:     ${DISPLAY}"
echo "   Arguments:   ${AIONUI_ARGS}"
echo "=============================================="
echo ""

# Execute AionUI with any additional arguments passed to the container
# --no-deprecation suppresses dependency warnings (DEP0040 punycode, DEP0180 fs.Stats)
exec /app/AionUi --no-deprecation ${AIONUI_ARGS} "$@"
