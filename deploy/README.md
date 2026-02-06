# AionUI Deployment

This directory contains deployment configurations for running AionUI in various environments.

## Docker Deployment

The `docker/` directory contains everything needed to run AionUI as a containerized WebUI server.

### Quick Start

```bash
# From project root
docker-compose -f deploy/docker/docker-compose.yml up -d

# View logs
docker-compose -f deploy/docker/docker-compose.yml logs -f

# Stop
docker-compose -f deploy/docker/docker-compose.yml down

# Rebuild after code changes
docker-compose -f deploy/docker/docker-compose.yml up -d --build
```

### Build Only

```bash
# Build the Docker image (from project root)
docker build -f deploy/docker/Dockerfile -t aionui .
```

### Access

- **Local:** http://localhost:25808
- **Network:** `http://<host-ip>:25808`

### Default Credentials

On first startup, check the container logs for the initial admin password:

```bash
docker-compose -f deploy/docker/docker-compose.yml logs | grep -A5 "Initial Admin"
```

- **Username:** `admin`
- **Password:** (displayed in logs, or set via `AIONUI_ADMIN_PASSWORD`)

> **Note**: If OIDC is enabled, the first OIDC user to log in will be granted admin role automatically. The local `admin` account remains available as a fallback authentication method.

### Authentication Setup

AionUI supports both OIDC/SSO and local authentication for multi-user deployments.

#### Local Authentication (Default)

By default, AionUI uses local authentication:

- On first startup, an `admin` user is auto-created with a random password
- The password is displayed in container logs (see "Default Credentials" above)
- Users can be managed via the Admin UI after logging in

#### OIDC/SSO Authentication

To enable enterprise SSO with Microsoft EntraID, Okta, Auth0, or any OpenID Connect provider:

**Step 1: Configure Environment**

Set OIDC variables in your `.env` file or `docker-compose.yml`:

```yaml
services:
  aionui:
    image: aionui:latest
    environment:
      - AIONUI_PORT=25808
      - AIONUI_ALLOW_REMOTE=true
      - JWT_SECRET=your-secret-here-change-in-production
      - OIDC_ENABLED=true
      - OIDC_ISSUER=https://login.microsoftonline.com/{tenant-id}/v2.0
      - OIDC_CLIENT_ID=your-client-id
      - OIDC_CLIENT_SECRET=your-client-secret
      - OIDC_REDIRECT_URI=http://your-domain:25808/api/auth/oidc/callback
      - OIDC_SCOPES=openid profile email
      - OIDC_GROUPS_CLAIM=groups
      - GROUP_MAPPINGS_FILE=/etc/aionui/group-mappings.json
    volumes:
      - aionui_data:/home/aionui/.config/AionUi
      - ./group-mappings.json:/etc/aionui/group-mappings.json:ro
    ports:
      - '25808:25808'
    shm_size: '2gb'
```

**Step 2: Create Group Mappings File**

Create `group-mappings.json` in the same directory as your `docker-compose.yml`:

```json
[
  {
    "groupId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "groupName": "AI-Platform-Admins",
    "role": "admin"
  },
  {
    "groupId": "e5f6a7b8-c9d0-1234-5678-abcdef901234",
    "groupName": "AI-Platform-Users",
    "role": "user"
  },
  {
    "groupId": "c9d0e1f2-a3b4-5678-9012-cdef34567890",
    "groupName": "AI-Platform-Viewers",
    "role": "viewer"
  }
]
```

Each entry maps an EntraID group object-ID to an AionUI role:

- **admin**: Full system access, user management, configuration
- **user**: Create conversations, manage own workspace
- **viewer**: Read-only access to assigned conversations

> The `groupId` must be the Azure AD **Object ID** of the security group (a UUID), not the display name.

**Step 3: Alternative - Inline Group Mappings**

Instead of mounting a file, you can use an inline JSON array:

```yaml
environment:
  - GROUP_MAPPINGS_JSON=[{"groupId":"<object-id>","groupName":"AI-Admins","role":"admin"},{"groupId":"<object-id>","groupName":"AI-Users","role":"user"}]
```

> **Note**: JSON in docker-compose environment variables can be fragile. File-based mappings are recommended for production.

**Step 4: Start the Container**

```bash
docker-compose -f deploy/docker/docker-compose.yml up -d
```

**Step 5: Verify OIDC Login**

1. Navigate to `http://your-domain:25808`
2. Click the **Sign in with Microsoft** button (or your IdP)
3. Authenticate via your identity provider
4. You'll be redirected back with a role based on group membership

#### Initial Admin User Behavior

| Scenario                              | Result                                      |
| ------------------------------------- | ------------------------------------------- |
| **OIDC disabled**                     | Local `admin` user created on first startup |
| **OIDC enabled, no group mappings**   | All SSO users get `user` role               |
| **OIDC enabled, with group mappings** | Roles assigned based on group membership    |
| **Both OIDC and local enabled**       | Local `admin` available as fallback         |

### Configuration

Environment variables can be set in `.env` or `docker-compose.yml`:

#### Core Settings

| Variable                | Default      | Description                              |
| ----------------------- | ------------ | ---------------------------------------- |
| `AIONUI_PORT`           | `25808`      | WebUI server port                        |
| `AIONUI_ALLOW_REMOTE`   | `true`       | Enable network access                    |
| `JWT_SECRET`            | (auto)       | JWT signing key (**set for production**) |
| `AIONUI_ADMIN_PASSWORD` | (auto)       | Initial admin password (first run only)  |
| `NODE_ENV`              | `production` | Environment mode                         |

#### OIDC / SSO

| Variable              | Default                | Description                          |
| --------------------- | ---------------------- | ------------------------------------ |
| `OIDC_ENABLED`        | `false`                | Enable OIDC/SSO authentication       |
| `OIDC_ISSUER`         | —                      | Identity provider issuer URL         |
| `OIDC_CLIENT_ID`      | —                      | OAuth client ID                      |
| `OIDC_CLIENT_SECRET`  | —                      | OAuth client secret                  |
| `OIDC_REDIRECT_URI`   | —                      | OAuth callback URL                   |
| `OIDC_SCOPES`         | `openid profile email` | Space-separated OAuth scopes         |
| `OIDC_GROUPS_CLAIM`   | `groups`               | JWT claim containing user groups     |
| `GROUP_MAPPINGS_FILE` | —                      | Path to group-mappings.json          |
| `GROUP_MAPPINGS_JSON` | —                      | Inline JSON array for group mappings |

#### Branding

| Variable              | Default  | Description                  |
| --------------------- | -------- | ---------------------------- |
| `AIONUI_BRAND_NAME`   | `AionUi` | Override app name            |
| `AIONUI_GITHUB_REPO`  | —        | GitHub repo for About page   |
| `AIONUI_WEBSITE_URL`  | —        | Website link for About page  |
| `AIONUI_CONTACT_URL`  | —        | Contact link for About page  |
| `AIONUI_FEEDBACK_URL` | —        | Feedback link for About page |

#### Feature Flags

| Variable            | Default | Description                                |
| ------------------- | ------- | ------------------------------------------ |
| `ALLOW_CLAUDE_YOLO` | `false` | Show Claude YOLO (skip permissions) toggle |
| `ALLOW_GEMINI_YOLO` | `false` | Show Gemini YOLO (skip permissions) toggle |

#### Multi-Agent CLI

All 8 CLI tools are baked into every image. Disable specific tools at runtime:

| Variable               | Description         |
| ---------------------- | ------------------- |
| `DISABLE_CLI_CLAUDE`   | Disable Claude Code |
| `DISABLE_CLI_QWEN`     | Disable Qwen Code   |
| `DISABLE_CLI_CODEX`    | Disable Codex       |
| `DISABLE_CLI_IFLOW`    | Disable iFlow       |
| `DISABLE_CLI_AUGGIE`   | Disable Auggie      |
| `DISABLE_CLI_COPILOT`  | Disable Copilot     |
| `DISABLE_CLI_QODER`    | Disable QoderCLI    |
| `DISABLE_CLI_OPENCODE` | Disable OpenCode    |

Container-level API keys (per-user keys via UI take precedence):

| Variable            | Used By                       |
| ------------------- | ----------------------------- |
| `ANTHROPIC_API_KEY` | Claude Code                   |
| `OPENAI_API_KEY`    | Codex, OpenCode               |
| `GEMINI_API_KEY`    | Gemini CLI (Google AI Studio) |

> GitHub Copilot and Auggie use OAuth authentication — no API key needed.

### Data Persistence

Data is stored in a named Docker volume `aionui_data`:

- SQLite database (`aionui.db`)
- User configuration and sessions
- Token blacklist

### Backup

```bash
# Create backup
docker run --rm -v aionui_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/aionui-backup-$(date +%Y%m%d).tar.gz -C /data .

# Restore backup
docker run --rm -v aionui_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/aionui-backup-YYYYMMDD.tar.gz -C /data
```

### Production Recommendations

#### Security

1. **Set JWT_SECRET** — Use a strong, random secret for consistent auth tokens

   ```bash
   JWT_SECRET=$(openssl rand -base64 32)
   ```

2. **Use HTTPS** — Deploy behind a reverse proxy with valid SSL/TLS certificates

3. **Configure OIDC** — Use your organization's identity provider (EntraID, Okta, Auth0)

4. **Network Security** — Never expose directly to the public internet; use firewall rules or VPN

5. **Secrets Management** — Use Docker secrets or encrypted environment files; never commit `.env`

#### HTTPS Deployment (Reverse Proxy)

AionUI runs HTTP internally and supports HTTPS via a reverse proxy that handles SSL
termination. A production-ready nginx config and Docker Compose overlay are provided.

**Quick Start:**

```bash
# 1. Create SSL directory and add your certificates
mkdir -p deploy/docker/ssl
cp /path/to/fullchain.pem deploy/docker/ssl/
cp /path/to/privkey.pem deploy/docker/ssl/

# 2. Edit nginx.conf — replace 'your-domain.example.com' with your hostname
vi deploy/docker/nginx.conf

# 3. Set HTTPS env vars in .env
AIONUI_HTTPS=true
AIONUI_TRUST_PROXY=1

# 4. If using OIDC (SSO), update the redirect URI to use https://
OIDC_REDIRECT_URI=https://your-domain.example.com/api/auth/oidc/callback

# 5. Start with the HTTPS profile
docker compose --profile https up -d
```

**What `AIONUI_HTTPS=true` enables:**

- `Secure` flag on all cookies (browser only sends them over HTTPS)
- `Strict-Transport-Security` header (HSTS — forces browsers to use HTTPS for 1 year)
- `SameSite=strict` on cookies (strongest cross-site protection)

**What `AIONUI_TRUST_PROXY` enables:**

- `req.protocol` correctly returns `https` (reads `X-Forwarded-Proto` from nginx)
- `req.ip` returns the real client IP (reads `X-Forwarded-For` from nginx)
- Rate limiting counts by client IP instead of the proxy's IP

**For Let's Encrypt (free automated certificates):**

```bash
# Initial certificate (stop nginx first)
mkdir -p deploy/docker/certbot
docker run --rm -p 80:80 \
  -v ./deploy/docker/ssl:/etc/letsencrypt \
  -v ./deploy/docker/certbot:/var/www/certbot \
  certbot/certbot certonly --standalone -d your-domain.example.com

# Renewal (nginx running — uses webroot challenge)
docker run --rm \
  -v ./deploy/docker/ssl:/etc/letsencrypt \
  -v ./deploy/docker/certbot:/var/www/certbot \
  certbot/certbot renew --webroot -w /var/www/certbot
```

**Provided files:**

| File                 | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `nginx.conf`         | Full nginx config — SSL, WebSocket upgrade, proxy headers, ACME challenge |
| `docker-compose.yml` | Single compose file — nginx service activated via `--profile https`       |

**Architecture:**

```
Client → nginx:443 (TLS) → aionui:25808 (HTTP, Docker internal network)
         nginx:80  → 301 redirect to HTTPS
```

#### Reverse Proxy Example (standalone nginx)

If you already have an nginx instance (not using the provided Compose overlay):

```nginx
server {
    listen 443 ssl;
    server_name aionui.company.com;

    ssl_certificate /etc/ssl/certs/aionui.crt;
    ssl_certificate_key /etc/ssl/private/aionui.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://aionui:25808;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (required for real-time chat streaming)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Disable buffering for streaming responses
        proxy_buffering off;
    }
}
```

#### Operational

1. **Resource Limits** — Minimum 2GB RAM, 1 CPU core; recommended 4GB RAM, 2 cores
2. **Monitoring** — Health check at `http://localhost:25808/` (returns 200 when ready)
3. **Backup** — Regular automated backups of `aionui_data` volume
4. **Logging** — Uses JSON file driver with 10MB max size, 3 rotated files
5. **Updates** — Pull latest image, recreate container; volume data persists

## Files

| File                                 | Description                          | Git-tracked     |
| ------------------------------------ | ------------------------------------ | --------------- |
| `docker/Dockerfile`                  | Multi-stage Docker build (local dev) | ✅              |
| `docker/Dockerfile.package`          | Packaging-only build (CI)            | ✅              |
| `docker/docker-compose.yml`          | Compose orchestration                | ✅              |
| `docker/docker-entrypoint.sh`        | Container startup script             | ✅              |
| `docker/.env.example`                | Environment variable template        | ✅              |
| `docker/.env`                        | Your local config (secrets)          | ❌ (gitignored) |
| `docker/group-mappings.json`         | Your OIDC group mappings             | ❌ (gitignored) |
| `docker/group-mappings-example.json` | Example group mappings               | ✅              |

## Future Deployments

Additional deployment options may be added:

- `kubernetes/` — Kubernetes manifests
- `helm/` — Helm chart
