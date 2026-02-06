# AionUI Documentation

Welcome to the AionUI documentation. This documentation provides comprehensive guides for users, developers, and API integrators.

## Documentation Structure

```text
docs/
├── README.md                              # This file
├── BLOCKED_UPGRADES.md                    # Pinned/blocked dependency upgrades
├── PROJECT_INDEX.md                       # Quick project reference (compact)
├── api/
│   ├── index.html                         # Interactive API playground (Swagger UI)
│   ├── openapi.yaml                       # OpenAPI 3.0 specification
│   └── IPC_REFERENCE.md                   # IPC API reference
├── architecture/
│   └── ARCHITECTURE.md                    # System architecture documentation
└── guides/
    ├── AI_CONTEXT_GUIDE.md                # Drift Detect + Serena setup
    ├── CICD_SETUP.md                      # CI/CD pipeline setup → .github/CICD_SETUP.md
    ├── DEPLOYMENT.md                      # Deployment guide → deploy/README.md
    ├── DEVELOPER_GUIDE.md                 # Developer contribution guide
    ├── GETTING_STARTED.md                 # User getting started guide
    ├── LOGGING_GUIDE.md                   # Logging & observability guide
    └── PER_USER_API_KEY_ISOLATION.md      # API key isolation architecture
```

## Quick Links

### For Users

- **[Getting Started](./guides/GETTING_STARTED.md)** - Installation, setup, and basic usage
- **[WebUI Guide](./guides/WEBUI_GUIDE.md)** - Remote access via web browser
- **[Logging & Observability](./guides/LOGGING_GUIDE.md)** - Pino + OTEL + Syslog + Langfuse logging stack

### For Operators

- **[Deployment Guide](./guides/DEPLOYMENT.md)** - Docker deployment, OIDC/SSO, HTTPS, configuration
- **[CI/CD Setup](./guides/CICD_SETUP.md)** - GitHub Actions workflows, Docker registry, secrets

### For Developers

- **[Developer Guide](./guides/DEVELOPER_GUIDE.md)** - Development setup, patterns, and contribution
- **[Architecture](./architecture/ARCHITECTURE.md)** - System design and component relationships
- **[IPC Reference](./api/IPC_REFERENCE.md)** - Inter-process communication API
- **[Blocked Upgrades](./BLOCKED_UPGRADES.md)** - Pinned/blocked dependency upgrades
- **[AI Context Guide](./guides/AI_CONTEXT_GUIDE.md)** - Drift Detect + Serena setup

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
- Knowledge Base (RAG search, ingestion)
- Logging configuration
- Python environment management
- Global Models administration

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

## Viewing Documentation

These docs are standard Markdown files. View them on GitHub, in your IDE, or any Markdown reader. The API playground (`docs/api/index.html`) can be opened directly in a browser.

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

Documentation version: 1.8.2 (pre-v2.0.0)

Last updated: 2026-02-05
