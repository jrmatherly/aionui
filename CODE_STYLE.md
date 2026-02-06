# Code Style Guide

This project uses ESLint and Prettier to ensure code quality and consistency.

## Tool Configuration

### ESLint

- Configuration file: `eslint.config.mjs` (flat config format)
- Ignores are defined inline in the config (no `.eslintignore` file)
- Main rules:
  - TypeScript support
  - Import rules checking
  - Line length limit (120 characters)
  - Unused variable checking
  - Type safety checking

### Prettier

- Configuration file: `.prettierrc.json`
- Ignore file: `.prettierignore`
- Formatting rules:
  - Single quotes
  - Semicolons
  - 2-space indentation
  - Line length limit (700 characters)

## Available Script Commands

### Code Checking

```bash
# Run ESLint check
npm run lint

# Run ESLint check with auto-fix
npm run lint:fix

# Check code format
npm run format:check

# Auto-format code
npm run format
```

### Git Hooks

The project has Git hooks configured to ensure code quality:

1. **pre-commit**: Automatically runs lint-staged before commit
2. **commit-msg**: Validates commit message format

### Language

- **All user-facing strings**: Hardcoded English only (i18n was removed in v1.8.2)
- **Code comments**: English
- **Commit messages**: English

### Commit Message Format

Commit messages must follow this format:

```text
type(scope): description
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation update
- `style`: Code formatting adjustment
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Test-related changes
- `chore`: Build process or auxiliary tool changes

Examples:

```text
feat: add user login feature
fix(login): fix login validation issue
docs: update API documentation
```

## Workflow

1. **During development**:
   - Write code
   - Run `npm run lint` to check code quality
   - Run `npm run format` to format code

2. **Before commit**:
   - Git hooks will automatically run lint-staged
   - Automatically fix resolvable issues
   - Validate commit message format

3. **Continuous integration**:
   - Run `npm run lint` and `npm run format:check` to verify code quality

## Common Issues

### Ignoring Specific Files from Checking

Add patterns to the `ignores` array in `eslint.config.mjs` or to `.prettierignore`.

### Disabling Checking for Specific Lines

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = getData();
```

### Custom Rules

Modify rule configuration in `eslint.config.mjs`.

## IDE Integration

### VS Code

Recommended extensions:

- ESLint
- Prettier - Code formatter

Configure `settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### Other Editors

Please refer to the ESLint and Prettier plugin configuration for your editor.
