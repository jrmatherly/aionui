# AionUi Personal Assistant Feature Development Plan

> This document records the complete development plan for the personal assistant feature, including architecture design, plugin system, interaction design, etc.

---

## 1. Feature Overview

### 1.1 Basic Information

- **Feature Name**: Personal Assistant Feature
- **Module**: Agent Layer, Conversation System
- **Process**: Main Process, Worker
- **Environment**: GUI Mode (AionUi Running)

### 1.2 Feature Description

1. Similar to WebUI functionality, users can use Aion features directly via personal terminals.
2. Mainly involves personal IM communication tools (Telegram, Lark/Feishu, etc.).
3. Create a 7x24 hour personal terminal assistant.
4. **Implemented Platforms**: Telegram (grammY), Lark/Feishu (Official SDK).
5. **Supported Agents**: Gemini, ACP, Codex.

### 1.3 User Scenarios

```text
Trigger: User sends a message via mobile IM tool (e.g., Telegram)
Process: Platform bot receives message -> forwards to Aion Agent -> LLM processes
Result: Push results to user via the same platform after processing is complete
```

### 1.4 Reference Projects

- **Clawdbot**: https://github.com/clawdbot/clawdbot
- Adopted its plugin design, pairing security mode, Channel abstraction, and other design concepts.

---

## 2. Overall Architecture

### 2.1 Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                  ChannelManager (Singleton)                 │
│                  (Unifies management of all components)     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │PluginManager│ │SessionManager│ │PairingService│           │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
│  ┌─────────────┐ ┌─────────────────────────────┐            │
│  │ActionExecutor│ │ChannelMessageService         │            │
│  └─────────────┘ └─────────────────────────────┘            │
54: └────────────────────┼────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     Layer 1: Plugin                          │
│                     (Platform Adapter Layer)                 │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐                                   │
│  │ Telegram │ │  Lark    │  ... (Slack, Discord TBD)         │
│  │  Plugin  │ │  Plugin  │                                   │
│  └────┬─────┘ └────┬─────┘                                   │
│       └────────────┴────────────┘                           │
│                    │                                         │
│  Responsibility: Receive platform msg/callback -> Convert to unified format -> Send response │
│  Ignores: Agent type, business logic                        │
└────────────────────┼────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     Layer 2: Gateway                         │
│                     (Business Logic Layer)                   │
├─────────────────────────────────────────────────────────────┤
│  ActionExecutor: System Action handling, conversation routing│
│  SessionManager: Session management, user authorization      │
│  PairingService: Pairing code generation and verification    │
│  ChannelMessageService: Message stream processing            │
│                                                              │
│  Responsibility: System Action handling, routing, sessions, access control │
│  Ignores: Platform details, Agent implementation details    │
└────────────────────┼────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     Layer 3: Agent                           │
│                     (AI Processing Layer)                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                      │
│  │ Gemini  │  │   ACP   │  │  Codex  │                      │
│  │  Agent  │  │  Agent  │  │  Agent  │                      │
│  └─────────┘  └─────────┘  └─────────┘                      │
│                                                              │
│  Responsibility: Communicate with AI service, manage context, return unified response │
│  Ignores: Source platform, system-level operations          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```text
Inbound Flow:
  Platform Message -> Plugin(Convert) -> ActionExecutor(Route) -> Agent(Process)

  Detailed Flow:
  1. Plugin receives platform message -> toUnifiedIncomingMessage()
  2. PluginManager calls messageHandler -> ActionExecutor.handleMessage()
  3. ActionExecutor routes based on Action type:
     - Platform Action -> Plugin handles internally
     - System Action -> SystemActions handles
     - Chat Action -> ChannelMessageService -> Agent

Outbound Flow:
  Agent Response -> ChannelEventBus -> ChannelMessageService -> ActionExecutor -> Plugin(Convert) -> Platform Send

  Detailed Flow:
  1. Agent Worker sends message -> ChannelEventBus.emitAgentMessage()
  2. ChannelMessageService listens to event -> handleAgentMessage()
  3. transformMessage + composeMessage -> StreamCallback
  4. ActionExecutor calls context.sendMessage/editMessage()
  5. Plugin converts message format -> sendMessage/editMessage()
```

---

## 3. Plugin System Design

### 3.1 Plugin Responsibilities

| Plugin Responsibilities                       | Plugin NOT Responsible For             |
| --------------------------------------------- | -------------------------------------- |
| Connect to Platform API                       | Agent scheduling and execution         |
| Receive messages -> Convert to unified format | Session management and persistence     |
| Unified format -> Convert to platform message | User authentication and access control |
| Handle platform-specific commands             | Message routing decisions              |
| Stream message updates (edit sent messages)   |                                        |

### 3.2 Plugin Lifecycle

```text
created → initializing → ready → starting → running → stopping → stopped
                ↓                    ↓           ↓
              error ←←←←←←←←←←←←←←←←←←←←←←←←←←←←
```

| State          | Description                               |
| -------------- | ----------------------------------------- |
| `created`      | Plugin instance created                   |
| `initializing` | Verifying config and initializing         |
| `ready`        | Initialization complete, waiting to start |
| `starting`     | Connecting to platform                    |
| `running`      | Running normally                          |
| `stopping`     | Disconnecting                             |
| `stopped`      | Stopped                                   |
| `error`        | Error occurred                            |

### 3.3 Plugin Interface (BasePlugin Abstract Class)

| Interface Method       | Direction               | Description                            |
| ---------------------- | ----------------------- | -------------------------------------- |
| `initialize(config)`   | PluginManager → Plugin  | Initialize plugin config               |
| `start()`              | PluginManager → Plugin  | Start platform connection              |
| `stop()`               | PluginManager → Plugin  | Stop platform connection               |
| `sendMessage(...)`     | ActionExecutor → Plugin | Send message to platform               |
| `editMessage(...)`     | ActionExecutor → Plugin | Edit sent message (streaming update)   |
| `getStatus()`          | PluginManager → Plugin  | Get plugin status                      |
| `getActiveUserCount()` | PluginManager → Plugin  | Get active user count                  |
| `getBotInfo()`         | PluginManager → Plugin  | Get Bot info                           |
| `onInitialize()`       | Subclass implementation | Platform-specific initialization logic |
| `onStart()`            | Subclass implementation | Platform-specific start logic          |
| `onStop()`             | Subclass implementation | Platform-specific stop logic           |

### 3.4 Unified Message Format

**Inbound Message (Platform -> System)** - `IUnifiedIncomingMessage`

| Field              | Description                                   |
| ------------------ | --------------------------------------------- |
| `id`               | System-generated unique ID                    |
| `platform`         | Source platform (telegram/lark/slack/discord) |
| `chatId`           | Chat ID                                       |
| `user`             | User info (id, username, displayName)         |
| `content`          | Message content (type, text, attachments)     |
| `timestamp`        | Timestamp                                     |
| `replyToMessageId` | ID of the message being replied to (optional) |
| `action`           | Action info (for button callbacks)            |
| `raw`              | Platform raw message (optional)               |

**Outbound Message (System -> Platform)** - `IUnifiedOutgoingMessage`

| Field              | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `type`             | Message type (text/image/file/buttons)               |
| `text`             | Text content                                         |
| `parseMode`        | Parse mode (HTML/Markdown/MarkdownV2)                |
| `buttons`          | Inline button group (optional)                       |
| `keyboard`         | Reply Keyboard (optional)                            |
| `replyMarkup`      | Platform specific Markup (optional, e.g., Lark Card) |
| `replyToMessageId` | ID of the message being replied to (optional)        |
| `imageUrl`         | Image URL (image type)                               |
| `fileUrl`          | File URL (file type)                                 |
| `fileName`         | File name (file type)                                |
| `silent`           | Send silently (optional)                             |

### 3.5 Steps to Extend New Platform

1. Create `src/channels/plugins/[platform]/` directory.
2. Implement `[Platform]Plugin` inheriting from `BasePlugin`.
3. Implement `[Platform]Adapter` to handle message conversion (toUnifiedIncomingMessage, to[Platform]SendParams).
4. Register plugin in `ChannelManager` constructor: `registerPlugin('platform', PlatformPlugin)`.
5. Add platform type to `PluginType` in `types.ts`.
6. Add Settings Page UI.
7. Add i18n translations.
8. Implement platform-specific interactive components (e.g., Keyboard, Card).

---

## 4. Implemented Platforms

### 4.1 Telegram Integration

#### Technical Selection

| Item        | Choice                         | Description                   |
| ----------- | ------------------------------ | ----------------------------- |
| Bot Library | grammY                         | Used by Clawdbot, elegant API |
| Run Mode    | Polling (Dev) / Webhook (Prod) | Configurable                  |

#### Bot Configuration Process

```text
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Create Bot                                          │
│   User @BotFather in Telegram -> /newbot -> Get Token       │
├─────────────────────────────────────────────────────────────┤
│ Step 2: Configure Token                                     │
│   AionUi Settings -> Paste Token -> Verify -> Save          │
├─────────────────────────────────────────────────────────────┤
│ Step 3: Start Bot                                           │
│   Toggle Switch -> Bot starts listening                     │
├─────────────────────────────────────────────────────────────┤
│ Step 4: User Pairing (See Security Mechanism below)         │
└─────────────────────────────────────────────────────────────┘
```

#### Configuration Items

| Config Item    | Type              | Description                                    |
| -------------- | ----------------- | ---------------------------------------------- |
| Bot Token      | string            | Get from @BotFather                            |
| Run Mode       | polling / webhook | Polling suitable for development               |
| Webhook URL    | string            | Only required for webhook mode                 |
| Pairing Mode   | boolean           | Whether pairing code authorization is required |
| Rate Limit     | number            | Max messages per minute                        |
| Group Mentions | boolean           | Whether @bot is required to respond in groups  |
| Default Agent  | gemini            | Fixed to Gemini in MVP phase                   |

#### Pairing Security Mechanism (Clawdbot Mode)

**Core Principle**: Approval action takes place on the user's local device, not in Telegram.

```text
┌─────────────────────────────────────────────────────────────┐
│ ① User Initiates in Telegram                                │
│    User -> @YourBot: /start or any message                  │
├─────────────────────────────────────────────────────────────┤
│ ② Bot Returns Pairing Request                               │
│    Bot -> User:                                             │
│    "👋 Welcome to Aion Assistant!                           │
│     Your Pairing Code: ABC123                               │
│     Please approve this pairing in AionUi:                  │
│     Settings -> Telegram -> Pending Requests -> [Approve]"  │
├─────────────────────────────────────────────────────────────┤
│ ③ AionUi Shows Pending Request                              │
│    Settings Page: Username, Code, Request Time, [Approve]/[Reject] │
├─────────────────────────────────────────────────────────────┤
│ ④ User Clicks [Approve] in AionUi                           │
├─────────────────────────────────────────────────────────────┤
│ ⑤ Bot Notifies Pairing Success                              │
│    Bot -> User: "✅ Pairing Successful! You can chat now"   │
└─────────────────────────────────────────────────────────────┘
```

**Security Measures**

| Mechanism         | Description                               |
| ----------------- | ----------------------------------------- |
| Pairing Code Auth | 6-digit random code, valid for 10 minutes |
| Local Approval    | Must approve in AionUi, not in Telegram   |
| User Whitelist    | Only authorized users can use             |
| Rate Limit        | Prevent abuse                             |
| Token Encryption  | Store encrypted using bcrypt              |

#### Message Conversion Rules

**Inbound Conversion (Telegram -> Unified)**

| Telegram Message Type | Unified Message content.type        |
| --------------------- | ----------------------------------- |
| `message:text`        | `text` or `command` (starts with /) |
| `message:photo`       | `image`                             |
| `message:document`    | `file`                              |
| `message:voice`       | `audio`                             |

**Outbound Conversion (Unified -> Telegram)**

| Unified Message type | Telegram API                      |
| -------------------- | --------------------------------- |
| `text`               | `sendMessage`                     |
| `image`              | `sendPhoto`                       |
| `file`               | `sendDocument`                    |
| `buttons`            | `sendMessage` + `inline_keyboard` |

**Special Handling**

| Scenario         | Handling                                              |
| ---------------- | ----------------------------------------------------- |
| Streaming        | Use `editMessageText` to update message, add ▌ cursor |
| Markdown         | Escape special characters, use `parse_mode: Markdown` |
| @Mention Removal | Clean up `@bot_username` in message                   |
| Group Filtering  | Check if contains @mention (configurable)             |

### 4.2 Lark/Feishu Integration

#### Technical Selection

| Item     | Choice                                      | Description              |
| -------- | ------------------------------------------- | ------------------------ |
| SDK      | @larksuiteoapi/node-sdk                     | Official SDK             |
| Run Mode | WebSocket Long Connection                   | No public URL required   |
| Domain   | Feishu (Configurable to Lark International) | Default to Feishu domain |

#### Bot Configuration Process

```text
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Create App                                          │
│   Create Custom Enterprise App in Lark Open Platform ->     │
│   Get App ID and App Secret                                 │
├─────────────────────────────────────────────────────────────┤
│ Step 2: Configure Permissions                               │
│   App Permissions -> Enable "Receive and send single/group messages" │
├─────────────────────────────────────────────────────────────┤
│ Step 3: Configure Event Subscription                        │
│   Event Subscription -> Subscribe to "Receive Message" ->   │
│   Configure Encryption Key (Optional)                       │
├─────────────────────────────────────────────────────────────┤
│ Step 4: Configure Credentials                               │
│   AionUi Settings -> Paste App ID, App Secret -> Verify -> Save │
├─────────────────────────────────────────────────────────────┤
│ Step 5: Start Bot                                           │
│   Toggle Switch -> Bot connects via WebSocket and starts listening │
├─────────────────────────────────────────────────────────────┤
│ Step 6: User Pairing (See Security Mechanism below)         │
└─────────────────────────────────────────────────────────────┘
```

#### Configuration Items

| Config Item        | Type    | Description                                    |
| ------------------ | ------- | ---------------------------------------------- |
| App ID             | string  | Get from Lark Open Platform                    |
| App Secret         | string  | Get from Lark Open Platform                    |
| Encrypt Key        | string  | Event encryption key (Optional)                |
| Verification Token | string  | Event verification Token (Optional)            |
| Pairing Mode       | boolean | Whether pairing code authorization is required |
| Rate Limit         | number  | Max messages per minute                        |
| Default Agent      | gemini  | Fixed to Gemini in MVP phase                   |

#### Pairing Security Mechanism

Same as Telegram, using local approval mode. Pairing code is sent to user via Lark message, user approves in AionUi.

#### Message Conversion Rules

**Inbound Conversion (Lark -> Unified)**

| Lark Message Type | Unified Message content.type        |
| ----------------- | ----------------------------------- |
| `message:text`    | `text` or `command` (starts with /) |
| `message:image`   | `photo`                             |
| `message:file`    | `document`                          |
| `message:audio`   | `audio`                             |
| Card Action       | `action` (via extractCardAction)    |

**Outbound Conversion (Unified -> Lark)**

| Unified Message type | Lark API                   |
| -------------------- | -------------------------- |
| `text`               | `im.message.create`        |
| `buttons`            | `im.message.create` + Card |
| Interactive Card     | Use Lark Card format       |

**Special Handling**

| Scenario            | Handling                                                    |
| ------------------- | ----------------------------------------------------------- |
| Streaming           | Use `im.message.update` to update message                   |
| HTML to Markdown    | convertHtmlToLarkMarkdown() converts HTML to Lark Markdown  |
| Card Interaction    | Use Lark Card format, supports buttons, confirmations, etc. |
| Event Deduplication | 5-minute event cache to prevent duplicate processing        |

---

## 5. Interaction Design

### 5.1 Design Principles

**Button First, Command Reserved**: Ordinary users operate via buttons, advanced users can use commands.

### 5.2 Telegram Interactive Components

| Type                | Description             | Applicable Scenario             |
| ------------------- | ----------------------- | ------------------------------- |
| **Inline Keyboard** | Buttons below message   | Confirmation, option selection  |
| **Reply Keyboard**  | Replaces input keyboard | Shortcuts for common operations |
| **Menu Button**     | Left of chat input      | Fixed feature entry             |

### 5.3 Interaction Scenarios Design

**Scenario 1: First Use/Pairing**

```text
Bot Message:
┌─────────────────────────────────────────┐
│ 👋 Welcome to Aion Assistant!           │
│                                          │
│ 🔑 Pairing Code: ABC123                 │
│ Please approve this pairing in AionUi Settings │
│                                          │
│ [📖 Guide]  [❓ Get Help]               │
└─────────────────────────────────────────┘
```

**Scenario 2: After Pairing (Reply Keyboard Persistent)**

```text
┌─────────────────────────────────────────┐
│ ... Chat Content ...                    │
├─────────────────────────────────────────┤
│ Reply Keyboard (Persistent Shortcuts)   │
│ [🆕 New Chat] [📊 Status] [❓ Help]     │
├─────────────────────────────────────────┤
│ [Type message...]               [Send]  │
└─────────────────────────────────────────┘
```

**Scenario 3: AI Reply with Action Buttons**

````text
Bot Message:
┌─────────────────────────────────────────┐
│ Here is an implementation of quicksort: │
│                                          │
│ ```python                                │
│ def quicksort(arr):                      │
│     ...                                  │
│ ```                                      │
│                                          │
│ [📋 Copy] [🔄 Regenerate] [💬 Continue] │
└─────────────────────────────────────────┘
````

**Scenario 4: Settings Page (Card Selection)**

```text
Bot Message:
┌─────────────────────────────────────────┐
│ ⚙️ Settings                             │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ 🤖 AI Model                         │ │
│ │ Current: Gemini 1.5 Pro             │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ ┌─────────────────────────────────────┐ │
│ │ 💬 Chat Style                       │ │
│ │ Current: Professional               │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ [← Back]                                │
└─────────────────────────────────────────┘
```

### 5.4 Button vs Command Mapping

| Command (Hidden/Reserved) | Button (User Visible) |
| ------------------------- | --------------------- |
| `/start`                  | Auto Trigger          |
| `/new`                    | 🆕 New Chat           |
| `/status`                 | 📊 Status             |
| `/help`                   | ❓ Help               |

---

## 6. Action Unified Processing Mechanism

### 6.1 Design Goal

Commands and button callbacks use unified processing to avoid duplicate logic and facilitate multi-platform extension.

### 6.2 Action Classification

| Type                | Description                           | Handler                    |
| ------------------- | ------------------------------------- | -------------------------- |
| **Platform Action** | Platform-specific ops (Auth, Pairing) | Plugin Internal Processing |
| **System Action**   | Platform-agnostic system ops          | Gateway ActionHandler      |
| **Chat Action**     | Messages requiring Agent processing   | AgentRouter -> Agent       |

```text
User Input
    │
    ├─→ Platform Action → Plugin Internal Processing (Does not enter Gateway)
    │       Ex: Telegram Pairing, Slack OAuth, Discord Invite
    │
    ├─→ System Action → Gateway ActionHandler → Unified Processing
    │       Ex: Session Management, Settings, Help
    │
    └─→ Chat Action → AgentRouter → Gemini/ACP/Codex
```

### 6.3 System Action List (Platform Agnostic)

| Category         | Action                  | Description               |
| ---------------- | ----------------------- | ------------------------- |
| **Session Mgmt** | `session.new`           | Create new session        |
|                  | `session.status`        | View current status       |
|                  | `session.list`          | Session list (Extended)   |
|                  | `session.switch`        | Switch session (Extended) |
| **Settings Ops** | `settings.show`         | Show settings menu        |
|                  | `settings.model.list`   | Show model list           |
|                  | `settings.model.select` | Select model              |
|                  | `settings.agent.select` | Switch Agent (Extended)   |
| **Help Info**    | `help.show`             | Show help                 |
| **Navigation**   | `nav.back`              | Go back                   |
|                  | `nav.cancel`            | Cancel current operation  |

### 6.4 Platform Action Examples (Implemented by Plugins)

| Platform     | Action            | Description          |
| ------------ | ----------------- | -------------------- |
| **Telegram** | `pairing.show`    | Show pairing code    |
|              | `pairing.refresh` | Refresh pairing code |
| **Slack**    | `oauth.start`     | Start OAuth          |
|              | `oauth.callback`  | OAuth callback       |
| **Discord**  | `invite.generate` | Generate invite link |

> **Note**: Platform Actions are handled internally by each Plugin and do not pass through Gateway ActionHandler.

### 6.5 Chat Action List

| Category         | Action            | Description            | Routing To            |
| ---------------- | ----------------- | ---------------------- | --------------------- |
| **Send Message** | `chat.send`       | User sends new message | Current Session Agent |
| **Message Ops**  | `chat.regenerate` | Regenerate reply       | Current Session Agent |
|                  | `chat.continue`   | Continue generating    | Current Session Agent |
|                  | `chat.stop`       | Stop generating        | Current Session Agent |

### 6.6 Action Data Structure

```typescript
UnifiedAction {
  action: string          // Action Type
  params?: object         // Optional Params
  context: {
    platform: string      // Source Platform
    userId: string        // User ID
    chatId: string        // Chat ID
    messageId?: string    // Trigger Message ID
    sessionId?: string    // Current Session ID
  }
}
```

### 6.7 Button Callback Data Format

```text
Format: action:param1=value1,param2=value2

Example:
• "session.new"
• "settings.model.select:id=gemini-pro"
• "chat.regenerate:msg=abc123"
```

### 6.8 Unified Response Format

```typescript
ActionResponse {
  text?: string                    // Text Content
  parseMode?: 'plain' | 'markdown' // Parse Mode
  buttons?: ActionButton[][]       // Inline Buttons
  keyboard?: ActionButton[][]      // Reply Keyboard
  behavior: 'send' | 'edit' | 'answer'  // Response Behavior
  toast?: string                   // Toast
}
```

---

## 7. Session Management

### 7.1 Session & Agent Relationship

```typescript
Session {
  id: string              // Session ID
  platform: string        // Source Platform
  userId: string          // User ID
  chatId: string          // Chat ID

  // Agent Config
  agentType: string       // gemini / acp / codex
  agentConfig: {
    modelId?: string      // Model ID
  }

  // Session Status
  status: string          // active / idle / error
  context: object         // Agent Session Context

  // Metadata
  createdAt: number
  lastActiveAt: number
}
```

### 7.2 MVP Phase Session Strategy

| Item            | MVP Implementation                 |
| --------------- | ---------------------------------- |
| Session Mode    | Single Active Session              |
| New Session     | Clicking 🆕 clears context         |
| Session Storage | Independent of AionUi GUI sessions |
| Agent           | Fixed Gemini                       |
| Model           | Uses AionUi default config         |

### 7.3 Future Extensions

| Item          | Extension Content                         |
| ------------- | ----------------------------------------- |
| Multi-session | Support `session.list` / `session.switch` |
| Agent Switch  | Support `settings.agent.select`           |
| Model Switch  | Support dynamic model selection           |
| Session Sync  | Link Telegram session with AionUi session |

---

## 8. Message Stream Processing Architecture

### 8.1 Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Worker (Gemini/ACP/Codex)              │
│                    (Agent Worker Process)                       │
├─────────────────────────────────────────────────────────────────┤
│  Send message event to IPC Bridge                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ChannelEventBus                               │
│                    (Global Event Bus - Singleton)                │
├─────────────────────────────────────────────────────────────────┤
│  emitAgentMessage(conversationId, data)                          │
│  onAgentMessage(handler) → () => void (cleanup)                  │
│                                                                  │
│  Event Type: 'channel.agent.message'                             │
│  Data Structure: IAgentMessageEvent { ...IResponseMessage, conv_id }   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ChannelMessageService                         │
│                    (Message Service - Singleton)                 │
├─────────────────────────────────────────────────────────────────┤
│  initialize() {                                                  │
│    // Register global event listener on initialization           │
│    channelEventBus.onAgentMessage(this.handleAgentMessage);    │
│  }                                                               │
│                                                                  │
│  handleAgentMessage(event) {                                     │
│    // Handle special events: start, finish, error                │
│    // Use transformMessage + composeMessage to merge messages    │
│    // Callback: callback(TMessage, isInsert)                     │
│  }                                                               │
│                                                                  │
│  sendMessage(sessionId, conversationId, text, callback) {        │
│    // Only send message, do not handle listening                 │
│    // Call Agent Task via WorkerManage                           │
│  }                                                               │
│                                                                  │
│  Internal State:                                                 │
│    activeStreams: Map<conversationId, IStreamState>              │
│    messageListMap: Map<conversationId, TMessage[]>               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ActionExecutor                                │
│                    (Business Executor)                           │
├─────────────────────────────────────────────────────────────────┤
│  handleChatMessage(context, text) {                              │
│    messageService.sendMessage(                                   │
│      sessionId, conversationId, text,                             │
│      (message: TMessage, isInsert: boolean) => {                 │
│        const outgoing = convertTMessageToOutgoing(message, platform); │
│        if (isInsert) context.sendMessage(outgoing);              │
│        else context.editMessage(msgId, outgoing);                │
│      }                                                           │
│    );                                                            │
│  }                                                               │
│                                                                  │
│  convertTMessageToOutgoing(message, platform) {                  │
│    // TMessage → IUnifiedOutgoingMessage                         │
│    // Format text based on platform (HTML/Markdown)              │
│    // text → Display content                                     │
│    // tips → Tips with icons                                     │
│    // tool_group → Tool status list                              │
│  }                                                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Plugin (Telegram/Lark)                       │
│                    (Platform Plugin)                             │
├─────────────────────────────────────────────────────────────────┤
│  sendMessage(chatId, message: IUnifiedOutgoingMessage)           │
│  editMessage(chatId, messageId, message: IUnifiedOutgoingMessage)│
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Event Type Processing

| Event Type          | Source                  | Handling                                       |
| ------------------- | ----------------------- | ---------------------------------------------- |
| `start`             | Agent starts responding | Reset message list                             |
| `content`           | Streaming text chunk    | transformMessage -> composeMessage -> callback |
| `tool_group`        | Tool call status        | Merge into existing tool_group or add new      |
| `finish`/`finished` | Response complete       | resolve promise, cleanup state                 |
| `error`             | Error occurred          | reject promise, cleanup state                  |
| `thought`           | Thinking process        | Ignore (transformMessage returns undefined)    |

### 8.3 Message Merge Strategy (composeMessage)

| Message Type | Merge Rule                                                   |
| ------------ | ------------------------------------------------------------ |
| `text`       | Append content for same msg_id, add new for different msg_id |
| `tool_group` | Merge tool status updates by callId                          |
| `tool_call`  | Merge by callId                                              |
| `tips`       | Add new directly                                             |

### 8.4 Message Callback Parameters

```typescript
type StreamCallback = (chunk: TMessage, isInsert: boolean) => void;

// isInsert = true:  New message, call sendMessage
// isInsert = false: Update message, call editMessage
```

### 8.5 Throttle Control

| Parameter          | Value     | Description                         |
| ------------------ | --------- | ----------------------------------- |
| UPDATE_THROTTLE_MS | 500ms     | Min message edit interval           |
| Send New Message   | No Limit  | Send immediately when isInsert=true |
| Edit Message       | Throttled | Apply throttle when isInsert=false  |

- [ ] Use Existing Context: **\*\*\*\***\_\_\_\_**\*\*\*\***
- [ ] Need New Context: **\*\*\*\***\_\_\_\_**\*\*\*\***
- [ ] Component Internal State Only (useState/useReducer)
- [ ] Need Persistence

### 8.6 Key Design Principles

1. **Separation of Event Listening and Message Sending**
   - Event listening happens at service initialization (`initialize()`).
   - `sendMessage()` is only responsible for sending, not listening.

2. **Decoupled Global Event Bus**
   - `ChannelMessageService` does not interact directly with Agent Task.
   - Decoupled via `ChannelEventBus` global event bus.

3. **Unified Message Format**
   - Use `TMessage` internally for unified format.
   - Convert to `IUnifiedOutgoingMessage` for output.

---

## 9. Agent Interface Specification

### 8.1 Capabilities Required for Each Agent

| Capability      | Description                   |
| --------------- | ----------------------------- |
| `sendMessage`   | Send message and get response |
| `streamMessage` | Stream message                |
| `regenerate`    | Regenerate last reply         |
| `continue`      | Continue generation           |
| `stop`          | Stop current generation       |
| `getContext`    | Get session context           |
| `clearContext`  | Clear session context         |

### 8.2 Agent Response Format

```typescript
AgentResponse {
  type: 'text' | 'stream_start' | 'stream_chunk' | 'stream_end' | 'error'
  text?: string
  chunk?: string
  error?: { code: string, message: string }
  metadata?: {
    model?: string
    tokensUsed?: number
    duration?: number
  }
  suggestedActions?: ActionButton[]
}
```

---

## 9. File Structure (Actual Implementation)

```text
src/channels/
├── core/                          # Core Modules
│   ├── ChannelManager.ts          # Unified Manager (Singleton)
│   └── SessionManager.ts          # Session Management
│
├── gateway/                       # Gateway Layer
│   ├── PluginManager.ts           # Plugin Lifecycle Management
│   └── ActionExecutor.ts          # Action Executor (Routing, Msg Handling)
│
├── actions/                       # Action Handling (Platform Agnostic)
│   ├── types.ts                   # Action/Response Type Definitions
│   ├── SystemActions.ts          # System Actions (Session, Settings, Help)
│   ├── ChatActions.ts            # Chat Actions (Send, Regenerate, etc.)
│   └── PlatformActions.ts        # Platform Actions (Pairing, etc.)
│
├── agent/                         # Agent Integration
│   ├── ChannelEventBus.ts        # Global Event Bus
│   └── ChannelMessageService.ts  # Message Stream Service
│
├── pairing/                       # Pairing Service
│   └── PairingService.ts         # Pairing Code Gen & Verification
│
├── plugins/                       # Plugins Directory
│   ├── BasePlugin.ts              # Plugin Abstract Base Class
│   ├── telegram/
│   │   ├── TelegramPlugin.ts      # Telegram Plugin
│   │   ├── TelegramAdapter.ts     # Message Adapter
│   │   └── TelegramKeyboards.ts   # Keyboard Components
│   └── lark/
│       ├── LarkPlugin.ts          # Lark Plugin
│       ├── LarkAdapter.ts         # Message Adapter
│       └── LarkCards.ts           # Card Components
│
├── utils/                         # Utilities
│   └── credentialCrypto.ts        # Credential Encryption
│
└── types.ts                       # Type Definitions
```

---

## 10. Database Design

| Table Name                | Usage                             |
| ------------------------- | --------------------------------- |
| `assistant_plugins`       | Plugin Config (Token, Mode, etc.) |
| `assistant_users`         | Authorized User List              |
| `assistant_sessions`      | User Session Association          |
| `assistant_pairing_codes` | Pending Pairing Requests          |

---

## 11. External Dependencies

| Package                   | Usage             | Description                   |
| ------------------------- | ----------------- | ----------------------------- |
| `grammy`                  | Telegram Bot      | Used by Clawdbot, elegant API |
| `@larksuiteoapi/node-sdk` | Lark/Feishu Bot   | Official SDK                  |
| `@slack/bolt`             | Slack Bot (TBD)   | Official SDK                  |
| `discord.js`              | Discord Bot (TBD) | Official SDK                  |

---

## 12. Implementation Status

### 12.1 Implemented Features

#### Telegram

- [x] Bot Token Config and Verification
- [x] Bot Start/Stop Control (Polling Mode, Auto-reconnect)
- [x] Pairing Code Generation and Local Approval Flow
- [x] Authorized User Management
- [x] Button Interaction (Reply Keyboard + Inline Keyboard)
- [x] Chat with Gemini/ACP/Codex Agent
- [x] New Session Feature
- [x] Stream Message Response (editMessage update)
- [x] Tool Confirmation Interaction
- [x] Error Recovery Mechanism

#### Lark/Feishu

- [x] App ID/Secret Config and Verification
- [x] Bot Start/Stop Control (WebSocket Long Connection)
- [x] Pairing Code Generation and Local Approval Flow
- [x] Authorized User Management
- [x] Card Interaction (Buttons, Confirmation, etc.)
- [x] Chat with Gemini/ACP/Codex Agent
- [x] New Session Feature
- [x] Stream Message Response (updateMessage update)
- [x] Tool Confirmation Interaction (Card Format)
- [x] Event Deduplication (5-minute cache)
- [x] HTML to Lark Markdown

#### Core Features

- [x] ChannelManager Unified Management
- [x] PluginManager Plugin Lifecycle Management
- [x] SessionManager Session Management
- [x] PairingService Pairing Service
- [x] ActionExecutor Action Routing and Execution
- [x] ChannelMessageService Message Stream Processing
- [x] ChannelEventBus Global Event Bus
- [x] Credential Encrypted Storage
- [x] Multi-platform Unified Message Format

### 12.2 Security Acceptance

- [x] Pairing Code 10-minute expiration
- [x] Must approve locally in AionUi
- [x] Unauthorized users cannot use
- [x] Token/Credential Encrypted Storage
- [ ] Rate Limit (TBD)

### 12.3 Compatibility

- [x] macOS runs normally
- [x] Windows runs normally
- [x] Multi-language support (i18n)

---

## 13. Future Roadmap

| Phase       | Content                                  | Status                 |
| ----------- | ---------------------------------------- | ---------------------- |
| **Phase 1** | Telegram + Lark Integration              | ✅ Completed           |
| **Phase 2** | Multi-session Management, Session Switch | 🔄 TBD                 |
| **Phase 3** | Agent Switch (Supported, Needs UI)       | 🔄 Partially Completed |
| **Phase 4** | Model Dynamic Switch                     | 🔄 TBD                 |
| **Phase 5** | Slack Platform Integration               | 🔄 TBD                 |
| **Phase 6** | Discord Platform Integration             | 🔄 TBD                 |
| **Phase 7** | Rate Limiting                            | 🔄 TBD                 |
| **Phase 8** | Session Sync with AionUi                 | 🔄 TBD                 |
| **Phase 9** | Headless Independent Service Mode        | 🔄 TBD                 |

---

## Template Maintenance

- **Creation Date**: 2025-01-27
- **Last Update**: 2026-02-03
- **Applicable Version**: AionUi v1.7.8+
- **Maintainer**: Project Team

---

## Appendix: Key Implementation Details

### A.1 ChannelManager Initialization Flow

```typescript
1. ChannelManager.getInstance().initialize()
   ├─ Initialize PluginManager
   ├─ Initialize SessionManager
   ├─ Initialize PairingService
   ├─ Initialize ActionExecutor
   └─ Initialize ChannelMessageService

2. Load plugin config from database
3. Call initialize() and start() for each enabled plugin
```

### A.2 Message Processing Flow

```typescript
1. Plugin receives platform message
   └─ toUnifiedIncomingMessage() conversion

2. PluginManager calls messageHandler
   └─ ActionExecutor.handleMessage()

3. ActionExecutor routes Action
   ├─ Platform Action → PlatformActions
   ├─ System Action → SystemActions
   └─ Chat Action → ChannelMessageService

4. ChannelMessageService.sendMessage()
   └─ Call Agent Task via WorkerManage

5. Agent Response → ChannelEventBus
   └─ ChannelMessageService.handleAgentMessage()
      └─ StreamCallback → ActionExecutor
         └─ Plugin.sendMessage/editMessage()
```

### A.3 Platform Specific Implementation

**Telegram**

- Uses grammY library
- Polling mode, supports auto-reconnect
- Inline Keyboard + Reply Keyboard
- HTML format messages

**Lark/Feishu**

- Uses Official Node SDK
- WebSocket Long Connection mode
- Card format interaction
- Lark Markdown format messages
- Event deduplication (5-minute cache)
