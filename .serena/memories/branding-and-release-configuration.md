# AionUI Branding & Release Configuration

## Overview

This memory documents how to configure branding, version, and external links for AionUI custom forks/deployments.

---

## Environment Variables for Branding

| Variable             | Default                   | Purpose                                            |
| -------------------- | ------------------------- | -------------------------------------------------- |
| `AIONUI_BRAND_NAME`  | `AionUi`                  | Display name in UI (titlebar, sidebar, about page) |
| `AIONUI_GITHUB_REPO` | `iOfficeAI/AionUi`        | GitHub repo for updates and derived links          |
| `AIONUI_WEBSITE_URL` | `https://www.aionui.com`  | Official website link in About page                |
| `AIONUI_CONTACT_URL` | `https://x.com/WailiVery` | Contact/social link in About page                  |

**Note**: `AIONUI_GITHUB_REPO` already works for the update system (see `updateBridge.ts:109`).

---

## Version Source

The version displayed in the About page (`v1.8.1`) comes from:

- **File**: `package.json` line 4
- **Import**: `AboutModalContent.tsx` line 13
- **Display**: `AboutModalContent.tsx` line 86

**For releases**: Update `package.json` version during build/release process.

---

## Hardcoded URLs Requiring Changes

### About Page (`src/renderer/components/SettingsModal/contents/AboutModalContent.tsx`)

| Line | Current URL                                    | Purpose            |
| ---- | ---------------------------------------------- | ------------------ |
| 49   | `https://github.com/iOfficeAI/AionUi/wiki`     | Help Documentation |
| 54   | `https://github.com/iOfficeAI/AionUi/releases` | Update Log         |
| 59   | `https://github.com/iOfficeAI/AionUi/issues`   | Feedback           |
| 64   | `https://x.com/WailiVery`                      | Contact Me         |
| 69   | `https://www.aionui.com`                       | Official Website   |
| 82   | `AionUi` (hardcoded text)                      | Brand title        |
| 87   | `https://github.com/iOfficeAI/AionUi`          | GitHub icon link   |

### Settings Pages with Wiki Links

| File                    | Line     | Wiki Page                                                      |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `ModelModalContent.tsx` | 116      | `/wiki/LLM-Configuration`                                      |
| `WebuiModalContent.tsx` | 576      | `/wiki/Remote-Internet-Access-Guide`                           |
| `ToolsModalContent.tsx` | 375, 381 | `/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide` |

### Backend/API References

| File               | Line   | URL/Value                             | Purpose                     |
| ------------------ | ------ | ------------------------------------- | --------------------------- |
| `updateBridge.ts`  | 33     | `iOfficeAI/AionUi`                    | Default repo for updates    |
| `updateBridge.ts`  | 34     | `AionUi`                              | User-Agent string           |
| `fsBridge.ts`      | 230    | `https://github.com/iOfficeAI/AionUi` | Referer header              |
| `ClientFactory.ts` | 35, 87 | `https://aionui.com`                  | HTTP-Referer for OpenRouter |

---

## UI Brand Name Locations

| File                    | Line | Current Value          |
| ----------------------- | ---- | ---------------------- |
| `layout.tsx`            | 223  | `AionUi` (sidebar)     |
| `AboutModalContent.tsx` | 82   | `AionUi` (about title) |
| `Titlebar/index.tsx`    | 18   | `AionUi` (hardcoded)   |

---

## Implementation Plan Location

Full implementation plan with code examples:
`.scratchpad/branding-customization-plan.md`

---

## Docker Deployment

Environment variables should be added to:

- `deploy/docker/.env.example` - Documentation
- `deploy/docker/docker-compose.yml` - Environment section

---

## Do NOT Modify

These should NOT be changed (functional, not branding):

- `AIONUI_PORT`, `AIONUI_ALLOW_REMOTE` - Functional env vars
- `AIONUI_TIMESTAMP_SEPARATOR`, `AIONUI_FILES_MARKER` - Internal markers
- `~/.config/AionUi` data paths - Would break existing installs
- Copyright headers - Legal requirement
