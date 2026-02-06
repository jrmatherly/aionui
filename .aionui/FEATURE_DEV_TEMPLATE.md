# AionUi Feature Development Specification Template

> This template is used to standardize describing feature development requirements to AI, ensuring AI can accurately understand tasks and follow project conventions.

---

## 1. Feature Overview

### 1.1 Basic Information

- **Feature Name**: [Concise name]
- **Module**: [ ] Agent Layer [ ] Conversation System [ ] Preview System [ ] Settings System [ ] Workspace [ ] Other
- **Processes Involved**: [ ] Main Process (process) [ ] Renderer Process (renderer) [ ] WebServer [ ] Worker

### 1.2 Feature Description

[Describe the core purpose and value of the feature in 1-3 sentences]

### 1.3 User Scenario

```text
Trigger: [How user triggers this feature]
Process: [How system responds]
Result: [State after feature completes]
```

### 1.4 Data Flow

| Direction | Data Type | Description |
| --------- | --------- | ----------- |
| Input     |           |             |
| Output    |           |             |

---

## 2. Development Guidelines

### 2.1 Technology Stack Constraints

- **Framework**: Electron 37 + React 19 + TypeScript 5.8
- **UI Library**: Arco Design (@arco-design/web-react)
- **Icons**: Icon Park (@icon-park/react)
- **CSS**: UnoCSS atomic styles
- **State Management**: React Context (AuthContext / ConversationContext / ThemeContext / LayoutContext)
- **IPC Communication**: @office-ai/platform bridge system
- **Database**: better-sqlite3
- **Language**: English only (no i18n)

### 2.2 Naming Conventions

| Type              | Convention              | Example                                         |
| ----------------- | ----------------------- | ----------------------------------------------- |
| React Component   | PascalCase              | `MessageList.tsx`, `FilePreview.tsx`            |
| Hooks             | use prefix + PascalCase | `useAutoScroll.ts`, `useColorScheme.ts`         |
| Bridge File       | featureName + Bridge    | `conversationBridge.ts`, `databaseBridge.ts`    |
| Service File      | featureName + Service   | `WebuiService.ts`                               |
| Interface Type    | I prefix                | `ICreateConversationParams`, `IResponseMessage` |
| Type Alias        | T prefix or direct      | `TChatConversation`, `PresetAgentType`          |
| Constants         | UPPER_SNAKE_CASE        | `MAX_RETRY_COUNT`                               |
| Utility Functions | camelCase               | `formatMessage`, `parseResponse`                |

### 2.3 File Location Guidelines

```text
New files should be placed in corresponding directories:

src/
├── agent/                        # AI agent implementations
│   ├── acp/                      # ACP protocol agent
│   ├── codex/                    # Codex agent
│   └── gemini/                   # Gemini agent
│
├── channels/                     # External channel plugins
│   ├── core/                     # Core managers (ChannelManager, SessionManager)
│   ├── gateway/                  # Plugin lifecycle, action routing
│   ├── plugins/                  # Platform plugins (telegram, lark)
│   ├── actions/                  # System/Chat/Platform actions
│   ├── agent/                    # Channel event bus, message service
│   ├── pairing/                  # Pairing code service
│   └── utils/                    # Credential encryption, etc.
│
├── common/                       # Cross-process shared modules
│   ├── adapters/                 # API adapters (OpenAI, Anthropic, Gemini)
│   ├── presets/                  # Assistant presets
│   ├── types/                    # Shared type definitions
│   └── utils/                    # Shared utility functions
│
├── process/                      # Electron main process
│   ├── bridge/                   # IPC bridge definitions (24+)
│   ├── database/                 # SQLite database operations
│   │   └── migrations/           # Database migrations
│   ├── services/                 # Business logic services
│   └── task/                     # Agent task management
│
├── renderer/                     # React renderer process
│   ├── assets/                   # Static assets (logos, images)
│   ├── components/               # Reusable UI components
│   │   └── base/                 # Base components
│   ├── config/                   # Model platforms, capabilities
│   ├── context/                  # React Context state
│   ├── hooks/                    # Custom Hooks (26+)
│   ├── pages/                    # Page components
│   │   ├── conversation/         # Conversation page
│   │   │   ├── preview/          # Preview panel
│   │   │   └── workspace/        # Workspace
│   │   ├── settings/             # Settings pages (12+)
│   │   ├── admin/                # Admin pages (UserManagement, GroupMappings, GlobalModels, LoggingSettings)
│   │   └── login/                # Login page
│   ├── messages/                 # Message rendering components
│   ├── services/                 # Frontend services
│   ├── styles/                   # CSS themes and overrides
│   └── utils/                    # Frontend utility functions
│
├── webserver/                    # Web server (WebUI mode)
│   ├── auth/                     # Authentication (OIDC, JWT, RBAC)
│   ├── routes/                   # API routes
│   ├── middleware/               # Security middleware
│   └── websocket/                # WebSocket manager
│
├── worker/                       # Web Worker
│
└── types/                        # Global type definitions
```

### 2.4 Code Style (Prettier Configuration)

```json
{
  "semi": true, // Use semicolons
  "singleQuote": true, // Use single quotes
  "jsxSingleQuote": true, // JSX uses single quotes
  "trailingComma": "es5", // ES5-compatible trailing commas
  "tabWidth": 2, // 2-space indentation
  "useTabs": false, // Don't use tabs
  "bracketSpacing": true, // Spaces inside brackets
  "arrowParens": "always", // Always use parentheses for arrow functions
  "endOfLine": "lf" // Unix line endings
}
```

### 2.5 Quality Requirements

- [x] Complete TypeScript types, avoid using `any`
- [x] Use bridge system for IPC communication
- [x] Implement error boundary handling
- [x] Use hardcoded English strings (no i18n)
- [x] Dark/light theme compatibility
- [x] Responsive layout adaptation
- [x] Support both Electron and Web (Docker) modes

### 2.6 Prohibited Practices

- ❌ Direct use of `ipcMain` / `ipcRenderer`, must use bridge system
- ❌ Direct access to Node.js API in renderer process
- ❌ Inline styles, should use UnoCSS class names
- ❌ Direct DOM manipulation in components, use React ref
- ❌ Ignoring TypeScript errors (`@ts-ignore`)
- ❌ Using `shell.openExternal` in web mode (use `window.open` instead)

---

## 3. Implementation Architecture

### 3.1 Layered Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    User Interface (UI)                   │
│  React Components / Hooks / Context                      │
└─────────────────────┬───────────────────────────────────┘
                      │ IPC Bridge (@office-ai/platform)
┌─────────────────────▼───────────────────────────────────┐
│                   Main Process (Main)                    │
│  Bridge → Service → Database / External API              │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                    Data Layer (Data)                     │
│  SQLite / ConfigStorage / External Services              │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Files to Modify/Add

**Main Process (src/process/)**

| File Path | Operation            | Description |
| --------- | -------------------- | ----------- |
|           | [ ] Add / [ ] Modify |             |

**Renderer Process (src/renderer/)**

| File Path | Operation            | Description |
| --------- | -------------------- | ----------- |
|           | [ ] Add / [ ] Modify |             |

**Shared Modules (src/common/)**

| File Path | Operation            | Description |
| --------- | -------------------- | ----------- |
|           | [ ] Add / [ ] Modify |             |

**Type Definitions (src/types/)**

| File Path | Operation            | Description |
| --------- | -------------------- | ----------- |
|           | [ ] Add / [ ] Modify |             |

### 3.3 IPC Communication Design

When adding new IPC channels, follow this pattern:

```typescript
// src/process/bridge/[feature]Bridge.ts
import { bridge } from '@office-ai/platform';

export const [featureName] = {
  // Provider pattern: request-response (similar to HTTP request)
  [methodName]: bridge.buildProvider<TResponse, TParams>('[channelName]'),

  // Emitter pattern: event stream (for streaming data)
  [eventName]: bridge.buildEmitter<TData>('[channelName].stream'),
};

// Usage example:
// Renderer process call: const result = await [featureName].[methodName].invoke(params);
// Renderer process listen: [featureName].[eventName].on((data) => { ... });
```

### 3.4 State Management Design

- [ ] Use existing Context: \***\*\_\_\_\_\*\***
- [ ] Need to add Context: \***\*\_\_\_\_\*\***
- [ ] Component-internal state only (useState/useReducer)
- [ ] Requires persistent storage (ConfigStorage)

---

## 4. Acceptance Criteria

### 4.1 Feature Acceptance

- [ ] [Specific feature point 1]
- [ ] [Specific feature point 2]
- [ ] [Specific feature point 3]

### 4.2 Edge Cases

- [ ] [Exception scenario 1 handling]
- [ ] [Exception scenario 2 handling]

### 4.3 Compatibility Acceptance

- [ ] macOS runs normally
- [ ] Windows runs normally
- [ ] Linux/Docker runs normally
- [ ] Dark mode displays correctly
- [ ] Light mode displays correctly
- [ ] Works in both Electron and Web modes

### 4.4 Code Quality

- [ ] `npm run lint` has no errors
- [ ] `npm run build` succeeds
- [ ] No TypeScript type errors
- [ ] No leftover console.log

---

## 5. References

### 5.1 Similar Feature References

[List similar implementations in the project for reference]

| Feature | File Path | Description |
| ------- | --------- | ----------- |
|         |           |             |

### 5.2 Dependent Existing Modules

[List existing interfaces/components/Hooks to be called]

| Module | Path | Purpose |
| ------ | ---- | ------- |
|        |      |         |

### 5.3 External Dependencies

[If new dependencies need to be introduced, list and explain reasons]

| Package | Version | Purpose | Necessity |
| ------- | ------- | ------- | --------- |
|         |         |         |           |

### 5.4 Special Notes

[List items that need special attention during implementation]

---

## Usage Example

Here is a complete feature requirement example:

```markdown
## 1. Feature Overview

### 1.1 Basic Information

- **Feature Name**: Export Conversation to PDF
- **Module**: [x] Conversation System
- **Processes Involved**: [x] Main Process (process) [x] Renderer Process (renderer)

### 1.2 Feature Description

Allow users to export current conversation to PDF file, preserving message format, code highlighting, and images.

### 1.3 User Scenario

Trigger: User clicks "Export" button in top-right corner of conversation page, selects "Export as PDF"
Process: System collects conversation content, renders to HTML, converts to PDF
Result: Save dialog appears, user selects save location and PDF file is generated

### 3.2 Files to Modify/Add

**Main Process (src/process/)**
| File Path | Operation | Description |
|----------|------|------|
| src/process/bridge/exportBridge.ts | [x] Add | PDF export IPC channel definition |
| src/process/services/ExportService.ts | [x] Add | PDF generation logic |

**Renderer Process (src/renderer/)**
| File Path | Operation | Description |
|----------|------|------|
| src/renderer/pages/conversation/components/ChatHeader.tsx | [x] Modify | Add export dropdown menu |
| src/renderer/hooks/useExportPdf.ts | [x] Add | Export feature Hook |

### 4.1 Feature Acceptance

- [ ] Export button click shows export options menu
- [ ] Selecting PDF shows save dialog
- [ ] Generated PDF contains complete conversation content
- [ ] Code blocks retain syntax highlighting
- [ ] Images are correctly embedded in PDF

### 5.1 Similar Feature References

| Feature         | File Path                                             | Description            |
| --------------- | ----------------------------------------------------- | ---------------------- |
| Markdown Export | src/renderer/hooks/useExportMarkdown.ts               | Reference export flow  |
| PDF Preview     | src/renderer/pages/conversation/preview/PdfViewer.tsx | Reference PDF handling |
```

---

## Template Maintenance

- **Created**: 2025-01-27
- **Last Updated**: 2026-02-05
- **Applicable Version**: AionUi v1.8.2+
- **Maintainer**: Project Team

If the template needs to be updated, please modify this file and notify team members.
