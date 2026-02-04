# AI Agent Recruitment & Xiaohongshu Publishing Rules

These rules cover the complete workflow from visual design, copywriting, to publishing process—ensuring efficient and professional AI-related job recruitment.

## 1. Visual Design Rules (Systemic Flux)

All recruitment images must follow the "Systemic Flux" design philosophy:

- **Core Style**: Dark mode (Charcoal/Black), simulating an IDE interface.
- **Color Scheme**: Background #0D0E12, with fluorescent green (#00FF94) for active states, indigo (#5E5CE6) for processing states.
- **Composition Elements**:
  - Must include a precise 60px grid system.
  - Decorative elements should include tech-inspired details (status bar, system version, coordinates).
  - Core graphics use neural network nodes or dynamic connection lines.
- **Typography**:
  - Title/Code: JetBrains Mono (Bold).
  - Body: Instrument Sans.

## 2. Content Generation Rules

### Recruitment Copy Standards

- **Title**: Must be within **20 characters** (including emoji), directly highlighting the position's core value.
- **Body Structure**:
  1. **Slogan**: An engaging opening line (e.g., "Seeking those who define the future").
  2. **🔥 Position Title**: Clearly state the full job title.
  3. **✨ Responsibilities**: Use bullet points covering full product lifecycle design, interaction definition, user insights, etc.
  4. **🎯 Requirements**: Specify years of experience (e.g., 3+ years) and core background (e.g., C-end product experience).
  5. **📩 How to Apply**: Prominently display the email and specify the subject line format.
- **Emoji Usage**: Use sparingly (1-2 per section) to enhance readability within the Xiaohongshu community.

## 3. Standard Operating Procedure (SOP)

This workflow documents the complete process for publishing recruitment posts, for Agent reference.

### Phase 1: Asset Generation

1. **Environment Setup**:
   - Ensure Node.js environment is available.
   - Install dependencies: `npm install canvas`.
2. **Script Execution**:
   - Create or invoke `generate_images.js`.
   - Script must include `Systemic Flux` color scheme and layout logic.
   - Run command: `node generate_images.js`.
3. **Output Verification**:
   - Confirm generation of `cover.png` (cover) and `jd_details.png` (details).
   - **Preserve files**: Generated files should not be auto-deleted for subsequent upload.

### Phase 2: Web Automation Publishing

1. **Login Check**:
   - Navigate to `https://creator.xiaohongshu.com/`.
   - Check login status (via screenshot or URL).
   - If not logged in, pause the workflow and prompt user to scan QR code or use SMS login.
2. **Enter Publishing Page**:
   - Navigate to `https://creator.xiaohongshu.com/publish/publish`.
   - **Key Action**: Click the "Upload Image Post" tab (Class: `tab`) to ensure image post mode, not video mode.
3. **File Upload**:
   - Locate upload button (`input[type="file"]` or button text "Upload Image").
   - Upload `cover.png` and `jd_details.png` in sequence.
   - Wait for upload completion (confirm via DOM changes or console status).
4. **Content Entry**:
   - **Title**: Locate title input (`placeholder="Enter title..."`) and enter title (<20 characters).
     - _Exception Handling_: If character limit warning appears, auto-truncate or rewrite title.
   - **Body**: Locate body textarea (multiline text box) and enter full recruitment copy.
5. **Publish Execution**:
   - Click the "Publish" button.
   - **Status Monitoring**: After clicking, monitor button state changes (disabled/grayed) or page redirect/toast notification ("Published successfully").
   - If no feedback, perform secondary check (e.g., missing required checkboxes like "Original Content Declaration").

## 4. Platform Technical Limits Summary

- **Title Limit**: 20 characters (**strict limit**, exceeding prevents publishing).
- **Body Limit**: 1000 characters.
- **Image Count**: Maximum 18 images.
- **Image Size**: Maximum 32MB per image.
- **Hashtag Recommendation**: Include 5-10 core hashtags at the bottom of the body.

---

_Created by Recruitment Agent - 2026-01-20_
