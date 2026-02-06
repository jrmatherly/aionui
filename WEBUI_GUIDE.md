# AionUi WebUI Mode - Startup Guide

AionUi supports WebUI mode, allowing you to access the application through a web browser. This guide covers how to start WebUI mode on all supported platforms.

## Table of Contents

- [What is WebUI Mode?](#what-is-webui-mode)
- [Windows](#windows)
- [macOS](#macos)
- [Linux](#linux)
- [Docker](#docker)
- [Android (Termux)](#android-termux)
- [Remote Access](#remote-access)
- [Troubleshooting](#troubleshooting)

---

## What is WebUI Mode?

WebUI mode starts AionUi with an embedded web server, allowing you to:

- Access the application through any modern web browser
- Use AionUi from remote devices on the same network (with `--remote` flag)
- Run the application headless on servers

Default access URL: `http://localhost:25808` (port may vary, check the application output)

---

## Authentication & OIDC/SSO Setup

AionUI WebUI supports multi-user authentication with enterprise SSO integration.

### Authentication Methods

1. **OIDC/SSO (Primary)**: Microsoft EntraID (Azure AD), Okta, Auth0, or any OpenID Connect provider
2. **Local Authentication (Fallback)**: Built-in username/password for admin access

### Quick Setup for OIDC

#### Step 1: Register Application with Identity Provider

**For Microsoft EntraID:**

1. Navigate to **Azure Portal** → **App Registrations**
2. Click **New registration**
3. Set **Redirect URI**: `http://your-domain:25808/api/auth/oidc/callback`
4. Under **Certificates & secrets**, create a new client secret
5. Note your **Application (client) ID**, **Directory (tenant) ID**, and **client secret**

**For other providers**: Follow their application registration process and obtain client credentials.

#### Step 2: Configure Environment Variables

Set the following in your deployment (see platform-specific sections below):

```bash
# Enable OIDC
export OIDC_ENABLED=true

# Identity Provider Configuration
export OIDC_ISSUER=https://login.microsoftonline.com/{tenant-id}/v2.0
export OIDC_CLIENT_ID=your-client-id
export OIDC_CLIENT_SECRET=your-client-secret
export OIDC_REDIRECT_URI=http://your-domain:25808/api/auth/oidc/callback

# Optional: Customize scopes and groups
export OIDC_SCOPES="openid profile email"
export OIDC_GROUPS_CLAIM="groups"
```

#### Step 3: Configure Group-to-Role Mapping

Map your organization's groups to AionUI roles:

**Method 1: Configuration File (Recommended for Docker)**

Create `group-mappings.json`:

```json
{
  "admin": ["AionUI-Admins", "IT-Security"],
  "user": ["AionUI-Users", "Engineering"],
  "viewer": ["AionUI-Viewers", "Auditors"]
}
```

Mount as volume in Docker or set path:

```bash
export GROUP_MAPPINGS_FILE=/path/to/group-mappings.json
```

**Method 2: Inline JSON**

```bash
export GROUP_MAPPINGS_JSON='{"admin":["AionUI-Admins"],"user":["AionUI-Users"],"viewer":["AionUI-Viewers"]}'
```

**Default Mapping**: If no mapping is configured, the first user to log in receives admin role. Subsequent users default to the `user` role.

### Role-Based Access Control

| Role       | Permissions                                                                |
| ---------- | -------------------------------------------------------------------------- |
| **admin**  | Full system access, user management, OIDC configuration, all conversations |
| **user**   | Create conversations, manage own workspace, access own files               |
| **viewer** | Read-only access to assigned conversations                                 |

### User Interface Features

- **OIDC Login Button**: Prominently displayed on login page
- **Local Login**: Collapsible section for admin fallback authentication
- **User Menu**: Located in sidebar with:
  - User avatar and display name
  - Profile page link
  - Admin dashboard (admin role only)
  - Sign out button

### Security Features

- **Access Tokens**: 15-minute lifespan, auto-refresh
- **Refresh Tokens**: 7-day lifespan for session renewal
- **Token Blacklist**: Persistent SQLite-based revocation system
- **Data Isolation**: Users can only access their own conversations and files
- **RBAC Enforcement**: Middleware validates role permissions on all routes

### Production Security Recommendations

**For Enterprise Deployments:**

1. **Always use HTTPS**: Deploy behind a reverse proxy (nginx, Traefik) with valid SSL/TLS certificates

   ```bash
   export AIONUI_HTTPS=true
   ```

2. **Set Strong JWT Secret**: Use a cryptographically secure random string

   ```bash
   export JWT_SECRET=$(openssl rand -hex 32)
   ```

3. **Restrict Network Access**: Use firewalls and security groups
   - Only allow access from corporate network or VPN
   - Never expose directly to the public internet without additional protection

4. **Enable Audit Logging**: Monitor authentication events and failed login attempts

5. **Regular Secret Rotation**: Rotate `JWT_SECRET` and `OIDC_CLIENT_SECRET` periodically
   - Note: Rotating JWT_SECRET invalidates all active sessions

6. **Validate Redirect URIs**: Ensure IdP configuration only allows known callback URLs

7. **Use Group-Based Access**: Leverage existing AD/LDAP groups rather than managing roles manually

8. **Monitor Token Blacklist**: The blacklist grows over time; consider periodic cleanup of expired entries

**Docker-Specific Security:**

- Use Docker secrets for sensitive environment variables
- Run container as non-root user (already configured in official image)
- Keep base images updated for security patches
- Use read-only volumes where possible

---

## Windows

### Method 1: Command Line (Recommended)

Open **Command Prompt** or **PowerShell** and run:

```cmd
# Using full path
"C:\Program Files\AionUi\AionUi.exe" --webui

# Or if AionUi is in your PATH
AionUi.exe --webui
```

### Method 2: Create a Desktop Shortcut

1. Right-click on desktop → **New** → **Shortcut**
2. Enter target location:

   ```text
   "C:\Program Files\AionUi\AionUi.exe" --webui
   ```

3. Name it **AionUi WebUI**
4. Click **Finish**
5. Double-click the shortcut to launch

### Method 3: Create a Batch File

Create `start-aionui-webui.bat`:

```batch
@echo off
"C:\Program Files\AionUi\AionUi.exe" --webui
pause
```

Double-click the batch file to start WebUI mode.

---

## macOS

### Method 1: Terminal Command (Recommended)

Open **Terminal** and run:

```bash
# Using full path
/Applications/AionUi.app/Contents/MacOS/AionUi --webui

# Or using open command
open -a AionUi --args --webui
```

### Method 2: Create Shell Script

Create `start-aionui-webui.sh`:

```bash
#!/bin/bash
/Applications/AionUi.app/Contents/MacOS/AionUi --webui
```

Make it executable and run:

```bash
chmod +x start-aionui-webui.sh
./start-aionui-webui.sh
```

### Method 3: Create Automator Application

1. Open **Automator**
2. Choose **Application**
3. Add **Run Shell Script** action
4. Enter:

   ```bash
   /Applications/AionUi.app/Contents/MacOS/AionUi --webui
   ```

5. Save as **AionUi WebUI.app**
6. Double-click to launch

### Method 4: Add to Dock

1. Create an Automator app (Method 3)
2. Drag **AionUi WebUI.app** to your Dock
3. Click the Dock icon to start WebUI mode anytime

---

## Linux

### Method 1: Command Line (Recommended)

#### For .deb Installation

```bash
# Using system path
aionui --webui

# Or using full path
/opt/AionUi/aionui --webui
```

#### For AppImage

```bash
# Make AppImage executable (first time only)
chmod +x AionUi-*.AppImage

# Run with --webui flag
./AionUi-*.AppImage --webui
```

### Method 2: Create Desktop Entry

Create `~/.local/share/applications/aionui-webui.desktop`:

```ini
[Desktop Entry]
Name=AionUi WebUI
Comment=Start AionUi in WebUI mode
Exec=/opt/AionUi/aionui --webui
Icon=aionui
Terminal=false
Type=Application
Categories=Utility;Office;
```

Make it executable:

```bash
chmod +x ~/.local/share/applications/aionui-webui.desktop
```

The launcher will appear in your application menu.

### Method 3: Create Shell Script

Create `~/bin/start-aionui-webui.sh`:

```bash
#!/bin/bash
/opt/AionUi/aionui --webui
```

Make it executable:

```bash
chmod +x ~/bin/start-aionui-webui.sh
```

Run it:

```bash
start-aionui-webui.sh
```

### Method 4: Systemd Service (Background)

Create `/etc/systemd/system/aionui-webui.service`:

```ini
[Unit]
Description=AionUi WebUI Service
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
ExecStart=/opt/AionUi/aionui --webui --remote
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable aionui-webui.service
sudo systemctl start aionui-webui.service

# Check status
sudo systemctl status aionui-webui.service
```

---

## Docker

Run AionUI WebUI as a containerized server using Docker. This is ideal for server deployments, headless operation, and consistent environments.

### Prerequisites

- Docker 20.10+ and Docker Compose v2+
- 4GB RAM minimum (8GB recommended)
- x64 or arm64 architecture

### Quick Start

```bash
# From project root
docker-compose -f deploy/docker/docker-compose.yml up -d

# View logs
docker-compose -f deploy/docker/docker-compose.yml logs -f

# Stop
docker-compose -f deploy/docker/docker-compose.yml down
```

### Build from Source

```bash
# Clone the repository
git clone https://github.com/iOfficeAI/AionUi.git
cd AionUi

# Build and start
docker-compose -f deploy/docker/docker-compose.yml up -d --build
```

### Access the WebUI

- **Local:** http://localhost:25808
- **Network:** `http://<host-ip>:25808`

### Default Credentials

On first startup, check container logs for the initial admin password:

```bash
docker-compose -f deploy/docker/docker-compose.yml logs | grep -A5 "Initial Admin"
```

- **Username:** `admin`
- **Password:** (displayed in logs)

### Configuration

Environment variables can be set in `docker-compose.yml`:

| Variable              | Default                | Description                                                           |
| --------------------- | ---------------------- | --------------------------------------------------------------------- |
| `AIONUI_PORT`         | `25808`                | WebUI server port                                                     |
| `AIONUI_ALLOW_REMOTE` | `true`                 | Enable network access                                                 |
| `JWT_SECRET`          | (auto)                 | JWT signing key (set for production)                                  |
| `NODE_ENV`            | `production`           | Environment mode                                                      |
| `OIDC_ENABLED`        | `false`                | Enable OIDC/SSO authentication                                        |
| `OIDC_ISSUER`         | -                      | Identity provider issuer URL                                          |
| `OIDC_CLIENT_ID`      | -                      | OAuth client ID from IdP                                              |
| `OIDC_CLIENT_SECRET`  | -                      | OAuth client secret from IdP                                          |
| `OIDC_REDIRECT_URI`   | -                      | OAuth callback URL (e.g., `http://host:25808/api/auth/oidc/callback`) |
| `OIDC_SCOPES`         | `openid profile email` | Space-separated OAuth scopes                                          |
| `OIDC_GROUPS_CLAIM`   | `groups`               | JWT claim containing user groups                                      |
| `GROUP_MAPPINGS_FILE` | -                      | Path to group-mappings.json file                                      |
| `GROUP_MAPPINGS_JSON` | -                      | Inline JSON string for group-to-role mapping                          |

### Data Persistence

Data is stored in a Docker volume `aionui_data`:

```bash
# Backup
docker run --rm -v aionui_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/aionui-backup.tar.gz -C /data .

# Restore
docker run --rm -v aionui_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/aionui-backup.tar.gz -C /data
```

### Production Recommendations

1. **Set JWT_SECRET** - Use a strong, random secret
2. **Use HTTPS** - Deploy behind nginx/Traefik with SSL
3. **Configure resource limits** - Adjust in docker-compose.yml
4. **Regular backups** - Backup the data volume

For detailed Docker documentation, see [`deploy/README.md`](./deploy/README.md).

---

## Android (Termux)

**Important Note**: Electron desktop mode is **not supported** on Android. However, you can run AionUi in WebUI mode using Termux with a prooted Linux environment.

> **Community Contribution**: This guide is contributed by [@Manamama](https://github.com/Manamama). Special thanks for making AionUi accessible on Android devices! 🙏
>
> **Original Tutorial**: [Running AionUi WebUI on Android via Termux + Proot Ubuntu](https://gist.github.com/Manamama/b4f903c279b5e73bdad4c2c0a58d5ddd)
>
> **Related Issues**: [#217 - Android Support Discussion](https://github.com/iOfficeAI/AionUi/issues/217)

### Prerequisites

- **Termux** from [F-Droid](https://f-droid.org/en/packages/com.termux/) (Google Play version is outdated and not recommended)
- **~5 GB free storage**
- **Internet connection**
- **Android 7.0+** (tested on Android 14)

### Installation Steps

#### 1. Install Termux and Update Packages

```bash
# Update package list
pkg update -y

# Install proot-distro
pkg install proot-distro -y
```

#### 2. Install Ubuntu via Proot

```bash
# Install Ubuntu rootfs
proot-distro install ubuntu

# Login to Ubuntu environment
proot-distro login ubuntu
```

#### 3. Install System Dependencies

```bash
# Update Ubuntu package list
apt update

# Install required dependencies
apt install -y \
    wget \
    libgtk-3-0 \
    libnss3 \
    libasound2 \
    libgbm1 \
    libxshmfence1 \
    ca-certificates

# Optional: Install additional libraries if needed
apt install -y \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libatk1.0-0 \
    libcups2
```

#### 4. Download and Install AionUi

```bash
# Download the ARM64 .deb package (replace VERSION with the actual version)
# Check latest version at: https://github.com/iOfficeAI/AionUi/releases
wget https://github.com/iOfficeAI/AionUi/releases/download/vVERSION/AionUi_VERSION_arm64.deb

# Example (replace VERSION with the release tag, e.g. v1.5.2):
wget https://github.com/iOfficeAI/AionUi/releases/download/vVERSION/AionUi_VERSION_arm64.deb

# Install the package
apt install -y ./AionUi_*.deb

# Verify installation
which AionUi
```

#### 5. Launch AionUi WebUI

```bash
# Start AionUi in WebUI mode with no-sandbox flag
AionUi --no-sandbox --webui
```

**Important**: The `--no-sandbox` flag is required in Termux/proot environments.

#### 6. Access the WebUI

Once started, open your browser and navigate to:

```text
http://localhost:25808
```

**Note**: The default port is 25808. Check the terminal output if a different port is used.

### Expected Warnings (Non-Fatal)

You may see the following warnings in the terminal - these are normal and can be ignored:

```text
[WARNING] Could not connect to session bus: Using X11 for dbus-daemon autolaunch was disabled at compile time
[ERROR] Failed to connect to the bus: Failed to connect to socket: No such file or directory
[WARNING] Multiple instances of the app detected, but not running on display server
```

These errors are related to D-Bus and X server, which are not needed for WebUI mode.

### Remote Access on LAN

To access AionUi from other devices on your local network:

```bash
# Start with --remote flag
AionUi --no-sandbox --webui --remote

# Find your Android device's IP address
# In Termux (outside proot):
# ifconfig or ip addr show
```

Access from other devices: `http://YOUR_ANDROID_IP:25808`

### Troubleshooting

#### Port Already in Use

If port 25808 is occupied:

```bash
# Specify a different port
AionUi --no-sandbox --webui --port 8080
```

#### Permission Denied Errors

```bash
# Ensure the binary has execute permissions
chmod +x /opt/AionUi/aionui
```

#### Out of Memory

AionUi requires sufficient RAM. Close other apps if you encounter memory issues.

#### Cannot Access from Browser

1. Check if AionUi is running: look for "Server started" message
2. Try using Termux's built-in browser or Chrome
3. Clear browser cache

### Performance Tips

1. **Use a lightweight browser** - Chrome or Firefox Focus recommended
2. **Close background apps** - Free up RAM for better performance
3. **Use WiFi** - More stable than mobile data for remote access
4. **Keep device charged** - Running AionUi consumes battery

### Tested Environment

- **Device**: Android 14
- **Termux Version**: 0.118.0
- **AionUi Version**: Latest release (e.g. 1.5.2)
- **Proot-distro**: Ubuntu (latest)

### Creating a Startup Script

For convenience, create a script to launch AionUi quickly:

```bash
# Create script in Ubuntu (proot)
cat > ~/start-aionui.sh << 'EOF'
#!/bin/bash
echo "Starting AionUi WebUI..."
AionUi --no-sandbox --webui --remote
EOF

# Make executable
chmod +x ~/start-aionui.sh

# Run anytime
./start-aionui.sh
```

### Quick Start Command (One-liner)

From Termux main shell:

```bash
proot-distro login ubuntu -- bash -c "AionUi --no-sandbox --webui --remote"
```

### Feedback and Improvements

If you encounter issues or have suggestions for improving Android support:

1. Check the [original community guide](https://gist.github.com/Manamama/b4f903c279b5e73bdad4c2c0a58d5ddd)
2. Report issues at [GitHub Issues #217](https://github.com/iOfficeAI/AionUi/issues/217)
3. Share your experience to help other Android users!

---

## Remote Access

To allow access from other devices on your network, use the `--remote` flag:

### Windows

```cmd
AionUi.exe --webui --remote
```

### macOS

```bash
/Applications/AionUi.app/Contents/MacOS/AionUi --webui --remote
```

### Linux

```bash
aionui --webui --remote
```

**Security Note**: Remote mode allows network access. Use only on trusted networks. Consider setting up authentication and firewall rules for production use.

### Finding Your Local IP Address

**Windows:**

```cmd
ipconfig
```

Look for "IPv4 Address" under your active network adapter.

**macOS/Linux:**

```bash
ifconfig
# or
ip addr show
```

Look for `inet` address (e.g., `192.168.1.100`).

Access from other devices: `http://YOUR_IP_ADDRESS:25808`

---

## Troubleshooting

### Port Already in Use

If port 25808 is already in use, the application will automatically try the next available port. Check the console output for the actual port number.

### Cannot Access from Browser

1. **Check if the application started successfully**
   - Look for "Server started on port XXXX" message in the console

2. **Try a different browser**
   - Chrome, Firefox, Safari, or Edge

3. **Clear browser cache**
   - Press `Ctrl+Shift+Delete` (Windows/Linux) or `Cmd+Shift+Delete` (macOS)

### Firewall Blocking Access

**Windows:**

```cmd
# Allow through Windows Firewall
netsh advfirewall firewall add rule name="AionUi WebUI" dir=in action=allow protocol=TCP localport=25808
```

**Linux (UFW):**

```bash
sudo ufw allow 25808/tcp
```

**macOS:**
Go to **System Preferences** → **Security & Privacy** → **Firewall** → **Firewall Options** → Add AionUi

### Application Not Found

**Find application location:**

**Windows:**

```cmd
where AionUi.exe
```

**macOS:**

```bash
mdfind -name "AionUi.app"
```

**Linux:**

```bash
which aionui
# or
find /opt -name "aionui" 2>/dev/null
```

### View Logs

**Windows (PowerShell):**

```powershell
& "C:\Program Files\AionUi\AionUi.exe" --webui 2>&1 | Tee-Object -FilePath aionui.log
```

**macOS/Linux:**

```bash
/path/to/aionui --webui 2>&1 | tee aionui.log
```

---

## Environment Variables

You can customize WebUI behavior with environment variables:

```bash
# Override the listening port
export AIONUI_PORT=8080

# Allow remote access without passing --remote
export AIONUI_ALLOW_REMOTE=true

# Optional host hint (0.0.0.0 behaves the same as AIONUI_ALLOW_REMOTE=true)
export AIONUI_HOST=0.0.0.0

# Then start the application
aionui --webui

# You can also pass the port directly via CLI
aionui --webui --port 8080
```

---

## User Configuration File

From v1.5.0+, you can store persistent WebUI preferences in `webui.config.json` located in your Electron user-data folder:

| Platform | Location                                                 |
| -------- | -------------------------------------------------------- |
| Windows  | `%APPDATA%/AionUi/webui.config.json`                     |
| macOS    | `~/Library/Application Support/AionUi/webui.config.json` |
| Linux    | `~/.config/AionUi/webui.config.json`                     |

Example file:

```json
{
  "port": 8080,
  "allowRemote": true
}
```

Settings from CLI flags take priority, followed by environment variables, then the user config file.

---

## Command Line Options Summary

| Option             | Description                 |
| ------------------ | --------------------------- |
| `--webui`          | Start in WebUI mode         |
| `--remote`         | Allow remote network access |
| `--webui --remote` | Combine both flags          |

---

## Reset Admin Password

If you forgot your admin password in WebUI mode, you can reset it using the `--resetpass` command.

> **Note:** Password reset only applies to **local authentication** users. OIDC/SSO users are managed by your identity provider (e.g., EntraID, Okta). To reset passwords for OIDC users, use your organization's IdP password reset process.

### Using --resetpass Command

**IMPORTANT:** The --resetpass command resets the password and generates a new random one. All existing JWT tokens will be invalidated.

**Windows:**

```cmd
# Using full path
"C:\Program Files\AionUi\AionUi.exe" --resetpass

# Or for a specific user
"C:\Program Files\AionUi\AionUi.exe" --resetpass username
```

**macOS:**

```bash
# Using full path
/Applications/AionUi.app/Contents/MacOS/AionUi --resetpass

# Or for a specific user
/Applications/AionUi.app/Contents/MacOS/AionUi --resetpass username
```

**Linux:**

```bash
# Using system path
aionui --resetpass

# Or for a specific user
aionui --resetpass username

# Or using full path
/opt/AionUi/aionui --resetpass
```

### What happens when you run --resetpass

1. The command connects to the database
2. Finds the specified user (default: `admin`)
3. Generates a new random 12-character password
4. Updates the password hash in the database
5. Rotates the JWT secret (invalidating all previous tokens)
6. Displays the new password in the terminal

### After running --resetpass

1. The command will display your new password - **copy it immediately**
2. Refresh your browser (Cmd+R or Ctrl+R)
3. You will be redirected to the login page
4. Login with the new password shown in the terminal

### Development Environment Only

If you're in a development environment with Node.js, you can also use:

```bash
# In the project directory
npm run --resetpass

# Or for a specific user
npm run --resetpass username
```

---

## Additional Resources

- [Main README](./readme.md)
- [GitHub Issues](https://github.com/iOfficeAI/AionUi/issues)

---

## Support

If you encounter any issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Search [existing issues](https://github.com/iOfficeAI/AionUi/issues)
3. Create a [new issue](https://github.com/iOfficeAI/AionUi/issues/new) with:
   - Your OS and version
   - AionUi version
   - Steps to reproduce
   - Error messages or logs

---

**Happy using AionUi in WebUI mode!** 🚀
