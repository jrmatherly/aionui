---
name: xiaohongshu-recruiter
description: Post high-quality AI-related job recruitment on Xiaohongshu (Little Red Book). Includes auto-generation of geek-style cover and detail images, plus automated publishing scripts. Use when posting recruitment info or searching for Agent designers and other AI talent.
---

# Xiaohongshu Recruiter

This skill helps users quickly and professionally post AI job recruitment on Xiaohongshu. It generates visual assets following the "Systemic Flux" design philosophy and provides Playwright scripts for semi-automated publishing.

## Core Workflow

### Simplified Mode (Default)

When the user provides a one-line instruction (e.g., "Post a frontend developer job on Xiaohongshu"):

1. Do not ask for details—the model auto-completes recruitment info and copy.
2. Do not require email or application method—model defaults to "Contact via DM/comments".
3. Auto-generate cover and detail images, then proceed directly to publishing.
4. Auto-open browser, wait for user to scan QR code to login, then auto-fill content and publish.

### 1. Information Gathering

Confirm with user (only ask if explicitly requested or if critical info conflicts):

- **Position Title** (e.g., Agent Designer)
- **Core Responsibilities & Requirements**
- **Application Email**

### 2. Visual Asset Generation

Use local script `scripts/generate_images.js` to generate images (LLM image generation temporarily disabled).

- **Command**:

  ```bash
  node scripts/generate_images.js
  ```

  _(Note: Modify text configuration in script as needed)_

- **Output**: `cover.png`, `jd_details.png`

### 3. Content Generation

Generate Xiaohongshu-style copy, saved as `post_content.txt`.

- **Rules**: See `assets/rules.md`.
- **Title**: <20 characters.
- **Body**: Include hashtags.

### 4. Automated Publishing

Use `scripts/publish_xiaohongshu.py` to launch browser for publishing.

**Prerequisites**:

- Install Playwright: `pip install playwright`
- Install browser driver: `playwright install chromium`

**Command**:

```bash
python3 scripts/publish_xiaohongshu.py "Your Title" "post_content.txt" "cover.png" "jd_details.png"
```

**Interactive Flow (Simplified One-Click Publishing)**:

1. Watch the browser window: script opens Xiaohongshu Creator Center.
2. If login page appears, scan QR code to login.
3. After login, script auto-uploads images and fills title and body.
4. Script auto-clicks "Publish" to complete; browser stays open for user confirmation.

## Resource Files

- **assets/design_philosophy.md**: Visual design philosophy.
- **assets/rules.md**: Detailed operational guidelines and platform limits.
- **scripts/generate_images.js**: Image generation script.
- **scripts/publish_xiaohongshu.py**: Publishing automation script.
