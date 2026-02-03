# CI/CD Setup Guide

## Overview

This project is configured with a complete GitHub Actions CI/CD pipeline, supporting automated building, testing, and publishing to multiple platforms.

## Workflow Description

### 1. `build-and-release.yml` - Main Build and Release Flow

- **Trigger**: Only on pushes to the `main` branch
- **Features**:
  - Code quality checks (ESLint, Prettier, TypeScript)
  - Multi-platform builds (macOS Intel/Apple Silicon, Windows, Linux)
  - Automatic version tag creation
  - Create Draft Release (requires manual approval and publishing)
- **Process**:
  1. Code quality checks
  2. Parallel builds for three platforms
  3. Automatic tag creation based on package.json version
  4. Wait for environment approval
  5. Create Draft Release (requires manual editing and publishing)

## Required GitHub Secrets Configuration

Configure the following Secrets in GitHub repository Settings → Secrets and variables → Actions:

### macOS App Signing (Optional, for publishing to Mac App Store)

```
APPLE_ID=your_apple_developer_account_email
APPLE_ID_PASSWORD=app_specific_password
TEAM_ID=apple_developer_team_id
IDENTITY=signing_certificate_name
```

### GitHub Token

```
GH_TOKEN=your_personal_access_token (starts with github_pat_)
```

**Note**: Must be configured manually as it requires `contents: write` permission to create releases.

### Environment Secrets

Also configure in Settings → Environments → release:

```
GH_TOKEN=same_personal_access_token
```

## How to Obtain Apple Signing Configuration

### 1. Apple ID App-Specific Password

1. Visit [appleid.apple.com](https://appleid.apple.com)
2. Sign in with your Apple ID
3. Click "App-Specific Passwords" in the "Sign-In and Security" section
4. Generate a new app-specific password
5. Copy the generated password as `APPLE_ID_PASSWORD`

### 2. Team ID

1. Visit [Apple Developer Portal](https://developer.apple.com/account/)
2. Find the Team ID in "Membership Details"
3. Copy the Team ID as `TEAM_ID`

### 3. Signing Certificate Identity

1. Open Xcode or Keychain Access
2. View installed developer certificates
3. Certificate name looks like: "Developer ID Application: Your Name (TEAM_ID)"
4. Copy the full certificate name as `IDENTITY`

## Usage

### Recommended Release Process (using release.sh)

1. Ensure code quality meets requirements
2. Use the release script to upgrade version:

   ```bash
   # Patch version
   ./scripts/release.sh patch

   # Feature version
   ./scripts/release.sh minor

   # Major version
   ./scripts/release.sh major

   # Pre-release version
   ./scripts/release.sh prerelease
   ```

3. The script will automatically:
   - Run code quality checks
   - Upgrade version number
   - Create git tag
   - Push to main branch
4. GitHub Actions automatically triggers build
5. Approve release on Deployments page
6. Edit Draft Release content
7. Manually publish to users

### Direct Push Release

1. Manually modify version in `package.json`
2. Commit and push to `main` branch
3. GitHub Actions will automatically build and create Draft Release

### Version Management Guidelines

- `patch`: Bug fixes (1.0.0 → 1.0.1)
- `minor`: New features (1.0.0 → 1.1.0)
- `major`: Major updates (1.0.0 → 2.0.0)
- `prerelease`: Pre-release versions (1.0.0 → 1.0.1-beta.0)

## Build Artifacts

After successful build, the following files are generated:

### macOS

- `.dmg` files (Intel and Apple Silicon versions)
- Application bundle

### Windows

- `.exe` NSIS installer (x64/arm64)
- `.zip` portable application (x64/arm64)

### Linux

- `.deb` package (x64/arm64/armv7l)
- `.AppImage` portable application (x64/arm64/armv7l)

## Troubleshooting

### Common Issues

1. **Release creation failed (403 error)**
   - Check if GH_TOKEN is correctly configured
   - Confirm token format starts with `github_pat_`
   - Verify GH_TOKEN exists in both repository and environment

2. **macOS signing failed**
   - Check if Apple ID and password are correct
   - Confirm Team ID and certificate name are accurate
   - Verify Apple Developer account status

3. **Build timeout (Windows)**
   - Windows builds are typically slowest (may take 40+ minutes)
   - Consider disabling MSI target to speed up builds

4. **Duplicate tag error**
   - CI/CD will check and skip existing tags
   - If tag was manually created, CI/CD won't recreate it

### Debugging Methods

1. Check GitHub Actions logs
2. Run the same build commands locally for testing
3. Check build scripts in package.json

## Security Recommendations

1. Regularly update GitHub Actions versions
2. Configure Secrets using least privilege principle
3. Regularly review and clean up unused Secrets
4. Monitor build logs to avoid sensitive information leaks

## Advanced Configuration

### Auto-Update Checking

You can integrate in-app auto-update functionality using GitHub Releases API to implement automatic update notifications.

### Multi-Environment Deployment

The workflow can be extended to support separate deployments for development, testing, and production environments.

### Performance Optimization

- Use build cache to speed up builds
- Parallel builds for different platforms
- Optimize dependency installation speed
