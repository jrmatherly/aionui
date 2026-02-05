# Getting Started with AionUI

This guide will help you set up and start using AionUI to interact with AI agents through a modern chat interface.

## Prerequisites

- **Node.js**: 22.x or later (automatically managed if using [mise](https://mise.jdx.dev))
- **npm**: 11.x or later
- **Operating System**: macOS, Windows, or Linux
- **AI API Keys** (optional, depending on agent):
  - Google AI API key (for Gemini)
  - OpenAI API key (for Codex)
  - Anthropic API key (for Claude)

## Installation

### From Source (Recommended — with mise)

[mise-en-place](https://mise.jdx.dev) automatically installs the correct Node.js version:

```bash
# Install mise (one-time setup)
curl https://mise.run | sh

# Clone and start
git clone https://github.com/jrmatherly/aionui.git
cd aionui
mise install        # Installs correct Node.js automatically
mise run dev        # Installs npm deps + starts dev server
```

### From Source (without mise)

```bash
# Ensure Node.js >= 22 is installed, then upgrade npm to 11+
# (Node 22 bundles npm 10.x; this project requires npm 11+)
npm install -g npm@11
git clone https://github.com/jrmatherly/aionui.git
cd aionui
npm install
npm start
```

### From Release

Download the latest release for your platform from the [Releases page](https://github.com/your-org/aionui/releases).

- **macOS**: `AionUI-x.x.x.dmg`
- **Windows**: `AionUI-Setup-x.x.x.exe`
- **Linux**: `AionUI-x.x.x.AppImage`

## Quick Start

### 1. Launch the Application

Run the application using:

```bash
npm start
```

Or launch the installed application from your system.

### 2. Configure Your First Agent

1. Click the **Settings** icon in the sidebar
2. Navigate to **Agent Settings**
3. Choose your AI agent:
   - **Gemini**: Enter your Google AI API key
   - **Claude**: Configure Claude Code CLI path
   - **Codex**: Enter your OpenAI API key
4. Click **Save**

### 3. Start a Conversation

1. Click **New Chat** in the sidebar
2. Select a workspace folder (optional)
3. Type your message and press **Enter** or click **Send**

## Features Overview

### Conversation Management

- **Multiple Conversations**: Switch between different chat sessions
- **Workspace Integration**: Associate conversations with project folders
- **History**: View and search past conversations
- **Export**: Save conversations for reference

### AI Agent Interaction

- **Tool Calls**: See what tools the AI is using
- **File Operations**: View and approve file changes
- **Permission Requests**: Control what the AI can do
- **Streaming Responses**: Real-time response display

### Scheduled Tasks (Cron)

1. Navigate to **Settings > Cron**
2. Click **Add Job**
3. Configure:
   - **Name**: Task identifier
   - **Schedule**: Cron expression (e.g., `0 9 * * *` for daily at 9 AM)
   - **Message**: Prompt to send
   - **Conversation**: Target conversation
4. Click **Save**

### WebUI Remote Access

Access AionUI from other devices on your network:

```bash
# Start with WebUI enabled
npm run webui

# Start with remote access
npm run webui:remote
```

Then open `http://your-ip:25808` in a browser.

## Configuration

### Multi-User Authentication

AionUI supports both enterprise SSO and local authentication for multi-user deployments.

#### Authentication Modes

- **OIDC/SSO (EntraID)**: Primary authentication for enterprise environments
- **Local Admin**: Fallback authentication for system administration

#### Role-Based Access Control

AionUI enforces RBAC with three built-in roles:

| Role | Permissions |
|------|-------------|
| **admin** | Full system access, user management, configuration |
| **user** | Create and manage own conversations, access own workspace |
| **viewer** | Read-only access to assigned conversations |

Each user's data is isolated — conversations, files, and settings are scoped per user.

#### Token System

- **Access Tokens**: 15-minute validity for API requests
- **Refresh Tokens**: 7-day validity for session renewal
- **Token Blacklist**: Persistent SQLite-based revocation (survives restarts)

#### OIDC Configuration

To enable OIDC/SSO authentication, configure the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `OIDC_ENABLED` | Yes | Set to `true` to enable OIDC |
| `OIDC_ISSUER` | Yes | Identity provider issuer URL (e.g., `https://login.microsoftonline.com/{tenant}/v2.0`) |
| `OIDC_CLIENT_ID` | Yes | Application/client ID from your IdP |
| `OIDC_CLIENT_SECRET` | Yes | Client secret from your IdP |
| `OIDC_REDIRECT_URI` | Yes | Callback URL (e.g., `http://localhost:25808/api/auth/oidc/callback`) |
| `OIDC_SCOPES` | No | Space-separated scopes (default: `openid profile email`) |
| `OIDC_GROUPS_CLAIM` | No | JWT claim containing user groups (default: `groups`) |

#### Group-to-Role Mapping

Map OIDC groups to AionUI roles using one of two methods:

**Option 1: JSON Configuration File**

Create a `group-mappings.json` file:

```json
{
  "admin": ["AionUI-Admins", "IT-Security"],
  "user": ["AionUI-Users", "Engineering"],
  "viewer": ["AionUI-Viewers", "Auditors"]
}
```

Then set:

```bash
export GROUP_MAPPINGS_FILE=/path/to/group-mappings.json
```

**Option 2: Inline JSON Environment Variable**

```bash
export GROUP_MAPPINGS_JSON='{"admin":["AionUI-Admins"],"user":["AionUI-Users"],"viewer":["AionUI-Viewers"]}'
```

**Default Behavior**: If no group mapping is configured, the first user to log in becomes an admin. Subsequent users default to the `user` role.

#### Initial Admin User

For local authentication deployments:

- On first startup, if no users exist, an `admin` user is auto-created
- The initial password is displayed in application logs
- Change this password immediately after first login

For more details on WebUI authentication setup, see [WEBUI_GUIDE.md](../../WEBUI_GUIDE.md).

### Application Settings

Access via **Settings** in the sidebar:

| Setting | Description |
|---------|-------------|
| **Theme** | Light, Dark, or System |
| **Font Size** | Adjust text size |
| **Workspace** | Default project folder |

> **Note**: The application is English-only. Multi-language support was removed in v1.8.2.

### Agent-Specific Settings

#### Gemini

- **API Key**: Your Google AI API key
- **Model**: Select Gemini model version
- **Skills**: Enable/disable built-in skills
- **Web Search**: Configure search engine

#### Claude (ACP)

- **CLI Path**: Path to Claude Code CLI
- **Custom Args**: Additional CLI arguments
- **Backend**: API or CLI mode

#### Codex

- **API Key**: Your OpenAI API key
- **Model**: Select model version

### MCP (Model Context Protocol)

Configure MCP servers for extended capabilities:

1. Go to **Settings > Tools**
2. Click **Add MCP Server**
3. Configure:
   - **Name**: Server identifier
   - **Command**: Server command
   - **Args**: Command arguments
   - **Env**: Environment variables
4. Click **Test Connection**
5. Click **Save**

## Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| New Chat | `Ctrl+N` | `Cmd+N` |
| Send Message | `Enter` | `Enter` |
| New Line | `Shift+Enter` | `Shift+Enter` |
| Stop Generation | `Escape` | `Escape` |
| Settings | `Ctrl+,` | `Cmd+,` |
| Toggle Sidebar | `Ctrl+B` | `Cmd+B` |

## Troubleshooting

### Common Issues

#### "Agent not responding"

1. Check your API key is valid
2. Verify network connectivity
3. Check the agent-specific configuration
4. View logs: **Settings > About > View Logs**

#### "Permission denied" errors

1. Ensure workspace folder has correct permissions
2. Check file system access rights
3. For CLI agents, verify CLI path is correct

#### WebUI connection issues

1. Check firewall settings
2. Verify port 25808 is available
3. For remote access, ensure `--remote` flag is used

### Authentication & OIDC Issues

#### OIDC Login Failures

**Symptom**: "Authentication failed" or redirect loops

1. **Verify OIDC configuration**:
   - Check `OIDC_ISSUER` URL is correct and accessible
   - Ensure `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` match your IdP
   - Verify `OIDC_REDIRECT_URI` matches the registered callback URL exactly

2. **Check IdP configuration**:
   - Confirm redirect URI is whitelisted in your identity provider
   - Verify client secret has not expired
   - Ensure required scopes are granted (at minimum: `openid profile email`)

3. **Review logs**:

   ```bash
   docker-compose logs -f  # For Docker deployments
   # Or check application logs for OIDC errors
   ```

#### Group Mapping Not Working

**Symptom**: Users logging in with incorrect roles or "access denied"

1. **Verify groups claim**:
   - Check the `OIDC_GROUPS_CLAIM` matches your IdP's group attribute (common values: `groups`, `roles`, `memberOf`)
   - Inspect the ID token from your IdP to confirm the claim name

2. **Validate mapping configuration**:
   - Ensure group names in `group-mappings.json` or `GROUP_MAPPINGS_JSON` exactly match IdP group names (case-sensitive)
   - Test with a known user's groups

3. **Check user's groups**:
   - Have the user log out and back in after group changes
   - Group membership is cached in the JWT token (15-minute access token lifespan)

#### Token Expiry Issues

**Symptom**: "Session expired" or "Unauthorized" errors

1. **Normal behavior**:
   - Access tokens expire after 15 minutes
   - Application automatically refreshes using the 7-day refresh token
   - Users need to re-authenticate after 7 days of inactivity

2. **If auto-refresh fails**:
   - Clear browser cookies and local storage
   - Log out and back in
   - Check that `JWT_SECRET` has not changed (changing it invalidates all tokens)

3. **Token blacklist issues**:
   - The token blacklist persists in SQLite (`aionui.db`)
   - If users can't authenticate after password changes, the blacklist is working correctly
   - To reset: stop application, delete `token_blacklist` table, restart

#### Local Admin Login Not Working

**Symptom**: Cannot login with local admin account when OIDC is enabled

1. **Local auth is always available** as a fallback:
   - On the login page, expand the "Local Authentication" section
   - Use your local admin credentials

2. **Password reset**:
   - See [WEBUI_GUIDE.md - Reset Admin Password](../../WEBUI_GUIDE.md#reset-admin-password)
   - Note: Password reset only applies to local authentication users, not OIDC users

### Getting Help

- **Documentation**: Check the `/docs` folder
- **Issues**: Report bugs on GitHub
- **Logs**: View application logs for debugging

## Next Steps

- [Architecture Overview](./architecture/ARCHITECTURE.md) - Understand the system design
- [API Documentation](./api/openapi.yaml) - WebUI API reference
- [Developer Guide](./DEVELOPER_GUIDE.md) - Contributing and extending AionUI
