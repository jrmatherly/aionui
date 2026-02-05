# Lark Integration Plan

> This document records the complete development plan for the Lark platform integration, extending the existing Telegram plugin architecture.

---

## 1. Feature Overview

### 1.1 Basic Information

- **Feature Name**: Lark Bot Integration
- **Module**: Channel Plugin Layer
- **Process**: Main Process
- **Environment**: GUI Mode (AionUi Running)
- **Dependencies**: Existing Channel Architecture, PairingService, SessionManager

### 1.2 Feature Description

1. Reuse existing Channel plugin architecture, add Lark platform support
2. Users can interact with AionUi via Lark Robot
3. Support switching between multiple Agents like Gemini, Claude, Codex, etc.
4. Fully aligned with Telegram functionality

### 1.3 User Scenarios

```text
Trigger: User @AionBot in Lark or sends a private message
Process: Lark Robot receives message -> forwards to Aion Agent -> LLM processes
Result: Push results to user via Lark message card after processing is complete
```

### 1.4 Resources

- **Lark Open Platform**: https://open.feishu.cn/
- **Node SDK**: https://github.com/larksuite/node-sdk
- **Existing Implementation**: `src/channels/plugins/telegram/`

---

## 2. Technical Selection

### 2.1 Platform Comparison

| Item                       | Telegram                         | Lark                                |
| -------------------------- | -------------------------------- | ----------------------------------- |
| **Bot Library**            | grammY                           | @larksuiteoapi/node-sdk             |
| **Run Mode**               | Polling / Webhook                | WebSocket Long Connection / Webhook |
| **Auth Method**            | Bot Token                        | App ID + App Secret                 |
| **Interactive Components** | Inline Keyboard + Reply Keyboard | Message Card                        |
| **Message Format**         | Markdown / HTML                  | Rich Text / Message Card JSON       |
| **Streaming Update**       | editMessageText                  | PATCH /im/v1/messages/:id           |

### 2.2 Technical Choices

| Item           | Choice                  | Description                                      |
| -------------- | ----------------------- | ------------------------------------------------ |
| SDK            | @larksuiteoapi/node-sdk | Official Node.js SDK                             |
| Run Mode       | WebSocket (Preferred)   | No public IP required, suitable for desktop apps |
| Message Format | Message Card            | Supports rich text and interactive buttons       |

---

## 3. Configuration Process

### 3.1 Lark App Creation

```text
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Create App                                          │
│   Lark Open Platform -> Create Custom Enterprise App ->     │
│   Get App ID/Secret                                         │
├─────────────────────────────────────────────────────────────┤
│ Step 2: Enable Robot Capabilities                           │
│   App Capabilities -> Robot -> Enable                       │
├─────────────────────────────────────────────────────────────┤
│ Step 3: Configure Permissions                               │
│   Permission Management -> Add the following permissions:   │
│   • im:message (Read and send single/group messages)        │
│   • im:message.group_at_msg (Receive @bot messages in groups)│
│   • im:chat (Get group info)                                │
│   • contact:user.id:readonly (Get User ID)                  │
├─────────────────────────────────────────────────────────────┤
│ Step 4: Publish App                                         │
│   Version Management & Release -> Create Version ->         │
│   Apply for Release                                         │
├─────────────────────────────────────────────────────────────┤
│ Step 5: Configure AionUi                                    │
│   Settings -> Channels -> Lark -> Paste App ID/Secret ->    │
│   Start                                                     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Configuration Items

| Config Item   | Type                 | Description                           | Required |
| ------------- | -------------------- | ------------------------------------- | :------: |
| App ID        | string               | Lark App ID                           |    ✅    |
| App Secret    | string               | Lark App Secret                       |    ✅    |
| Run Mode      | websocket / webhook  | Event receive mode                    |    ✅    |
| Webhook URL   | string               | Only required for webhook mode        |    ❌    |
| Pairing Mode  | boolean              | Whether pairing code auth is required |    ✅    |
| Rate Limit    | number               | Max messages per minute               |    ❌    |
| Default Agent | gemini / acp / codex | Default Agent to use                  |    ✅    |

---

## 4. Pairing Security Mechanism

### 4.1 Flow Design (Consistent with Telegram)

```text
┌─────────────────────────────────────────────────────────────┐
│ ① User initiates in Lark                                    │
│    User -> @AionBot: Any message                            │
├─────────────────────────────────────────────────────────────┤
│ ② Bot returns pairing request (Message Card)                │
│    ┌────────────────────────────────────────┐               │
│    │ 👋 Welcome to Aion Assistant!          │               │
│    │                                        │               │
│    │ 🔑 Pairing Code: ABC123                │               │
│    │ Please approve this pairing in AionUi  │               │
│    │                                        │               │
│    │ [📖 Guide]     [🔄 Refresh Status]     │               │
│    └────────────────────────────────────────┘               │
├─────────────────────────────────────────────────────────────┤
│ ③ AionUi shows pending request                              │
│    Settings Page: Username, Code, Time, [Approve]/[Reject]  │
├─────────────────────────────────────────────────────────────┤
│ ④ User clicks [Approve] in AionUi                           │
├─────────────────────────────────────────────────────────────┤
│ ⑤ Bot pushes pairing success message                        │
│    Bot -> User: "✅ Pairing Successful! You can chat now"   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Security Measures

| Mechanism             | Description                               |
| --------------------- | ----------------------------------------- |
| Pairing Code Auth     | 6-digit random code, valid for 10 minutes |
| Local Approval        | Must approve in AionUi, not in Lark       |
| User Whitelist        | Only authorized users can use             |
| Rate Limiting         | Prevent abuse                             |
| Credential Encryption | Encrypted storage for App Secret          |

---

## 5. Message Conversion Rules

### 5.1 Inbound Conversion (Lark -> Unified Format)

| Lark Event Type                 | Unified Message content.type |
| ------------------------------- | ---------------------------- |
| `im.message.receive_v1` (text)  | `text`                       |
| `im.message.receive_v1` (image) | `image`                      |
| `im.message.receive_v1` (file)  | `file`                       |
| `im.message.receive_v1` (audio) | `audio`                      |
| `card.action.trigger`           | `action`                     |

### 5.2 Outbound Conversion (Unified Format -> Lark)

| Unified Message type | Lark API                  | content_type |
| -------------------- | ------------------------- | ------------ |
| `text`               | POST /im/v1/messages      | text         |
| `image`              | POST /im/v1/messages      | image        |
| `buttons`            | POST /im/v1/messages      | interactive  |
| Streaming Update     | PATCH /im/v1/messages/:id | -            |

### 5.3 Message Card Structure

```json
{
  "config": {
    "wide_screen_mode": true
  },
  "header": {
    "title": {
      "tag": "plain_text",
      "content": "Aion Assistant"
    }
  },
  "elements": [
    {
      "tag": "markdown",
      "content": "Message content..."
    },
    {
      "tag": "action",
      "actions": [
        {
          "tag": "button",
          "text": { "tag": "plain_text", "content": "🆕 New Chat" },
          "type": "primary",
          "value": { "action": "session.new" }
        }
      ]
    }
  ]
}
```

---

## 6. Interaction Design

### 6.1 Component Mapping

| Scenario                   | Telegram                    | Lark                             |
| -------------------------- | --------------------------- | -------------------------------- |
| **Persistent Shortcuts**   | Reply Keyboard              | Message Card bottom button group |
| **Message Action Buttons** | Inline Keyboard             | Message Card interactive buttons |
| **Pairing Request**        | Text + Button               | Message Card                     |
| **AI Reply**               | Markdown + Button           | Rich Text/Card + Button          |
| **Settings Menu**          | Multi-level Inline Keyboard | Message Card                     |

### 6.2 Interaction Scenarios

**Scenario 1: Main Menu after Successful Pairing**

```text
┌─────────────────────────────────────────────────────────────┐
│                    Message Card                             │
├─────────────────────────────────────────────────────────────┤
│  ✅ Pairing Successful! You can start chatting now.         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [🆕 New Chat] [🔄 Agent] [📊 Status] [❓ Help]      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Scenario 2: AI Reply with Action Buttons**

````text
┌─────────────────────────────────────────────────────────────┐
│                    Message Card                             │
├─────────────────────────────────────────────────────────────┤
│  Here is an implementation of quicksort:                    │
│                                                             │
│  ```python                                                  │
│  def quicksort(arr):                                        │
│      if len(arr) <= 1:                                      │
│          return arr                                         │
│      ...                                                    │
│  ```                                                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [📋 Copy]  [🔄 Regenerate]  [💬 Continue]           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
````

**Scenario 3: Agent Switching**

```text
┌─────────────────────────────────────────────────────────────┐
│                    Message Card                             │
├─────────────────────────────────────────────────────────────┤
│  🔄 Switch Agent                                            │
│                                                             │
│  Select an AI Agent:                                        │
│  Current: 🤖 Gemini                                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [✓ 🤖 Gemini]  [🧠 Claude]  [⚡ Codex]              │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. File Structure

```text
src/channels/
├── plugins/
│   ├── telegram/              # Existing Telegram plugin
│   │   ├── TelegramPlugin.ts
│   │   ├── TelegramAdapter.ts
│   │   ├── TelegramKeyboards.ts
│   │   └── index.ts
│   │
│   └── lark/                  # New Lark plugin
│       ├── LarkPlugin.ts      # Lark plugin main class
│       ├── LarkAdapter.ts     # Message format adapter
│       ├── LarkCards.ts       # Message card templates
│       └── index.ts
│
├── types.ts                   # Need to add 'lark' to PluginType
└── ...
```

---

## 8. Interface Design

### 8.1 LarkPlugin Class

```typescript
class LarkPlugin extends BasePlugin {
  // Lifecycle
  async initialize(config: LarkPluginConfig): Promise<void>;
  async start(): Promise<void>;
  async stop(): Promise<void>;

  // Message Handling
  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string>;
  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void>;

  // Event Handling
  private handleMessageEvent(event: LarkMessageEvent): void;
  private handleCardAction(action: LarkCardAction): void;

  // Token Management
  private async refreshAccessToken(): Promise<void>;
}
```

### 8.2 Configuration Interface

```typescript
interface LarkPluginConfig {
  appId: string;
  appSecret: string;
  mode: 'websocket' | 'webhook';
  webhookUrl?: string;
  encryptKey?: string; // Event encryption key
  verificationToken?: string; // Event verification token
}
```

---

## 9. Lark-Specific Considerations

| Item                   | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| **App Type**           | Custom Enterprise App recommended, functional limits for personal devs |
| **Permission Review**  | Some permissions require admin approval                                |
| **Message Card Limit** | Card JSON max 30KB, long messages need sharding                        |
| **Token Refresh**      | Access Token valid for 2 hours, needs auto-refresh                     |
| **Event Subscription** | WebSocket mode needs no public IP, better for desktop apps             |
| **@Mentions**          | In groups, must @robot to receive messages                             |

---

## 10. Development Plan

### Phase 1: Basic Connection (Est. 2-3 Days)

- [ ] Create LarkPlugin base class
- [ ] Implement WebSocket event reception
- [ ] Implement Access Token auto-refresh
- [ ] Basic message send/receive functionality

### Phase 2: Security & Auth (Est. 1-2 Days)

- [ ] Reuse PairingService
- [ ] Pairing flow message cards
- [ ] Settings page UI adaptation

### Phase 3: Interaction Perfection (Est. 2-3 Days)

- [ ] Message card template system
- [ ] Button callback handling
- [ ] Agent switching functionality
- [ ] Streaming response support

### Phase 4: Optimization (Est. 1-2 Days)

- [ ] Long message sharding
- [ ] Error handling perfection
- [ ] Multi-language support
- [ ] Logging and monitoring

---

## 11. Feature Alignment List

| Feature                 | Telegram | Lark | Component Reused      |
| ----------------------- | :------: | :--: | --------------------- |
| Bot Config Verification |    ✅    |  🔲  | -                     |
| Bot Start/Stop          |    ✅    |  🔲  | ChannelManager        |
| Pairing Code Auth       |    ✅    |  🔲  | PairingService        |
| Local Approval Flow     |    ✅    |  🔲  | Existing UI           |
| User Whitelist          |    ✅    |  🔲  | Database              |
| Button Interaction      |    ✅    |  🔲  | SystemActions         |
| Streaming Response      |    ✅    |  🔲  | ChannelMessageService |
| Agent Switching         |    ✅    |  🔲  | SystemActions         |
| New Session             |    ✅    |  🔲  | SessionManager        |
| Rate Limiting           |    ✅    |  🔲  | RateLimiter           |

---

## 12. Acceptance Criteria

### 12.1 Functionality Acceptance

- [ ] Lark app credentials configuration and verification
- [ ] Bot start/stop control
- [ ] Pairing code generation and local approval flow
- [ ] Authorized user management
- [ ] Message card interaction
- [ ] Chat with Gemini/Claude Agent
- [ ] Agent switching functionality
- [ ] New session functionality
- [ ] Streaming message response

### 12.2 Security Acceptance

- [ ] Pairing code 10-minute expiration
- [ ] Must approve locally in AionUi
- [ ] Unauthorized users cannot use
- [ ] App Secret encrypted storage
- [ ] Rate limiting active

### 12.3 Compatibility

- [ ] macOS runs normally
- [ ] Windows runs normally
- [ ] Multi-language support

---

## Template Maintenance

- **Creation Date**: 2026-01-30
- **Last Update**: 2026-01-30
- **Applicable Version**: AionUi v0.x+
- **Maintainer**: Project Team
