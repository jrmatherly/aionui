# Getting Started with AionUI

This guide will help you set up and start using AionUI to interact with AI agents through a modern chat interface.

## Prerequisites

- **Node.js**: 18.x or later
- **npm**: 9.x or later
- **Operating System**: macOS, Windows, or Linux
- **AI API Keys** (optional, depending on agent):
  - Google AI API key (for Gemini)
  - OpenAI API key (for Codex)
  - Anthropic API key (for Claude)

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/your-org/aionui.git
cd aionui

# Install dependencies
npm install

# Start development server
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

Then open `http://your-ip:3000` in a browser.

## Configuration

### Application Settings

Access via **Settings** in the sidebar:

| Setting | Description |
|---------|-------------|
| **Theme** | Light, Dark, or System |
| **Language** | en-US, zh-CN, zh-TW, ja-JP, ko-KR |
| **Font Size** | Adjust text size |
| **Workspace** | Default project folder |

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
2. Verify port 3000 is available
3. For remote access, ensure `--remote` flag is used

### Getting Help

- **Documentation**: Check the `/docs` folder
- **Issues**: Report bugs on GitHub
- **Logs**: View application logs for debugging

## Next Steps

- [Architecture Overview](./architecture/ARCHITECTURE.md) - Understand the system design
- [API Documentation](./api/openapi.yaml) - WebUI API reference
- [Developer Guide](./DEVELOPER_GUIDE.md) - Contributing and extending AionUI
