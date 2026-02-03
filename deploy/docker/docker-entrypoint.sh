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

# Wait for Xvfb to be ready
sleep 2

# Verify Xvfb is running
if ! kill -0 $XVFB_PID 2>/dev/null; then
    echo "❌ Failed to start Xvfb"
    exit 1
fi
echo "✅ Xvfb started successfully (PID: $XVFB_PID)"

# -----------------------------------------------------------------------------
# Start D-Bus (required by Electron)
# -----------------------------------------------------------------------------
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ]; then
    echo "🔌 Starting D-Bus session..."
    eval "$(dbus-launch --sh-syntax)"
    export DBUS_SESSION_BUS_ADDRESS
fi

# -----------------------------------------------------------------------------
# Build startup arguments
# -----------------------------------------------------------------------------
AIONUI_ARGS="--webui --no-sandbox"

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
exec /app/AionUi ${AIONUI_ARGS} "$@"
