---
paths:
  - 'eslint.config.mjs'
  - '.prettierrc.json'
  - '.prettierignore'
  - '**/*.css'
  - 'uno.config.ts'
---

# Code Style Rules

## ESLint & Prettier

- ESLint config: `eslint.config.mjs` (flat config format, no `.eslintignore`)
- Prettier config: `.prettierrc.json` with `.prettierignore`
- Single quotes, semicolons, 2-space indentation
- Line length: 120 chars (ESLint), 700 chars (Prettier — intentionally high to avoid wrapping)

## Styling Stack

- **UnoCSS** atomic classes preferred over inline styles
- **CSS Modules** (`*.module.css`) for component-specific styles — requires `auto: true` in css-loader
- **Arco Design** semantic colors and CSS variables: `var(--bg-1)`, `var(--text-primary)`
- **CSS Variables** for theming (not Theme Context or data attributes)
- **Media queries** for responsive design
- **CSS Animations** (@keyframes) preferred over CSS transitions

## Git Hooks

- **pre-commit**: lint-staged runs ESLint + Prettier on staged files
- **commit-msg**: Validates conventional commit format
- **pre-push**: Drift Detect validation (blocking) + doc reminder (advisory)

## IDE Setup (VS Code)

Recommended extensions: ESLint, Prettier - Code formatter

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Disabling Rules

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = getData();
```

Add patterns to `ignores` in `eslint.config.mjs` or to `.prettierignore` for file-level exclusions.
