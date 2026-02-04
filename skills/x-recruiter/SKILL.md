---
name: x-recruiter
description: Post recruitment content on X (x.com). Includes copywriting guidelines, image generation prompts, and automated publishing scripts. Use for AI-related or design positions.
---

# X Recruiter

This skill enables quick posting of job listings on X, including copywriting rules, cover/detail image prompts, and automated publishing scripts.

## Core Workflow

### 1. Information Gathering

Confirm with the user:

- **Job Title**
- **Core Responsibilities & Requirements**
- **Application Email/Link**

### 2. Generate Visual Assets

Use `scripts/generate_images.js` to create images.

- **Command**:

  ```bash
  node scripts/generate_images.js
  ```

- **Output**: `cover.png`, `jd_details.png`

### 3. Generate Copy

Create X-appropriate copy within 280 characters.

- **Rules**: See `assets/rules.md`.
- **Requirements**: Concise, clear, with core responsibilities and application method.

### 4. Automated Publishing

Use `scripts/publish_x.py` to launch browser for publishing.

**Prerequisites**:

- Install Playwright: `pip install playwright`
- Install browser driver: `playwright install chromium`

**Command**:

```bash
python3 scripts/publish_x.py "post_content.txt" "cover.png" "jd_details.png"
```

**Interactive Flow**:

1. Watch the browser window: the script opens X home or compose page.
2. If a login page appears, complete login.
3. After login, the script auto-fills content and images.
4. Review content in browser, then click "Post" when ready.

## Resource Files

- **assets/rules.md**: Copywriting rules and constraints.
- **assets/design_philosophy.md**: Visual style guide.
- **scripts/generate_images.js**: Image generation script.
- **scripts/publish_x.py**: Publishing automation script.
