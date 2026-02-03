# AionUI Documentation

Welcome to the AionUI documentation. This documentation provides comprehensive guides for users, developers, and API integrators.

## Documentation Structure

```text
docs/
├── README.md                    # This file
├── PROJECT_INDEX.md             # Quick project reference (compact)
├── api/
│   ├── index.html               # Interactive API playground (Swagger UI)
│   ├── openapi.yaml             # OpenAPI 3.0 specification
│   └── IPC_REFERENCE.md         # IPC API reference
├── architecture/
│   └── ARCHITECTURE.md          # System architecture documentation
└── guides/
    ├── GETTING_STARTED.md       # User getting started guide
    └── DEVELOPER_GUIDE.md       # Developer contribution guide
```

## Quick Links

### For Users

- **[Getting Started](./guides/GETTING_STARTED.md)** - Installation, setup, and basic usage
- **[WebUI Guide](../WEBUI_GUIDE.md)** - Remote access via web browser

### For Developers

- **[Developer Guide](./guides/DEVELOPER_GUIDE.md)** - Development setup, patterns, and contribution
- **[Architecture](./architecture/ARCHITECTURE.md)** - System design and component relationships
- **[IPC Reference](./api/IPC_REFERENCE.md)** - Inter-process communication API

### API Documentation

- **[Interactive API Docs](./api/index.html)** - Swagger UI playground
- **[OpenAPI Spec](./api/openapi.yaml)** - Machine-readable API specification

## Document Overview

### PROJECT_INDEX.md

A compact index of the entire project structure. Use this for quick reference without reading the entire codebase. Contains:

- Project structure tree
- Entry points and core modules
- Key types and configurations
- Quick start commands

### Architecture Documentation

Detailed system architecture including:

- Multi-process architecture diagrams
- Component relationships (Mermaid diagrams)
- Data flow sequences
- Database schema
- IPC communication patterns

### API Documentation

#### WebUI REST API (openapi.yaml)

The WebUI server exposes a REST API for:

- Authentication (login, logout, password management)
- Directory operations
- WebSocket token management
- QR code login

#### IPC API (IPC_REFERENCE.md)

Internal API for renderer-main process communication:

- Conversation management
- MCP service integration
- Cron job scheduling
- File system operations
- Dialog windows

### User Guides

#### Getting Started

Step-by-step guide for new users:

- Installation methods
- First-time setup
- Agent configuration
- Basic workflows

#### WebUI Guide

Remote access setup:

- Starting WebUI server
- Authentication
- Mobile access via QR code

### Developer Guide

For contributors:

- Development environment setup
- Code style and conventions
- Adding new AI agents
- Adding channel plugins
- Testing practices

## Generating Documentation

### Update API Docs

If the API changes, regenerate the OpenAPI spec:

```bash
# The openapi.yaml is manually maintained
# Update docs/api/openapi.yaml as needed
```

### View Documentation Locally

```bash
# Serve the docs directory
npx serve docs

# Or use Python
python -m http.server 8080 -d docs
```

Then open http://localhost:8080 in your browser.

## Documentation Standards

### Markdown Style

- Use ATX-style headers (`#`, `##`, etc.)
- Include code blocks with language specifiers
- Use tables for structured data
- Add mermaid diagrams for visual documentation

### Code Examples

```typescript
// Include type annotations
function example(param: string): ReturnType {
  // ...
}
```

### API Documentation

- Document all endpoints with request/response schemas
- Include error responses
- Provide curl examples for testing

## Contributing to Documentation

1. Documentation lives in the `docs/` directory
2. Follow existing formatting conventions
3. Update the relevant index when adding new files
4. Test links before submitting changes

## Version

Documentation version: 1.8.1

Last updated: 2026-02-02
