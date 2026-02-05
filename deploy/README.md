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
```

### Build Only

```bash
# Build the Docker image
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
- **Password:** (displayed in logs)

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

**Step 1: Update docker-compose.yml**

Add OIDC environment variables:

```yaml
version: '3.8'
services:
  aionui:
    image: aionui:latest
    environment:
      # Basic Configuration
      - AIONUI_PORT=25808
      - AIONUI_ALLOW_REMOTE=true
      - JWT_SECRET=your-secret-here-change-in-production

      # OIDC Configuration
      - OIDC_ENABLED=true
      - OIDC_ISSUER=https://login.microsoftonline.com/{tenant-id}/v2.0
      - OIDC_CLIENT_ID=your-client-id
      - OIDC_CLIENT_SECRET=your-client-secret
      - OIDC_REDIRECT_URI=http://your-domain:25808/api/auth/oidc/callback
      - OIDC_SCOPES=openid profile email
      - OIDC_GROUPS_CLAIM=groups
      - GROUP_MAPPINGS_FILE=/config/group-mappings.json
    volumes:
      - aionui_data:/data
      - ./group-mappings.json:/config/group-mappings.json:ro
    ports:
      - '25808:25808'
```

**Step 2: Create Group Mappings File**

Create `group-mappings.json` in the same directory as your `docker-compose.yml`:

```json
{
  "admin": ["AionUI-Admins", "IT-Security"],
  "user": ["AionUI-Users", "Engineering", "Product"],
  "viewer": ["AionUI-Viewers", "Auditors", "Contractors"]
}
```

Map your organization's AD/LDAP groups to AionUI roles:

- **admin**: Full system access, user management, configuration
- **user**: Create conversations, manage own workspace
- **viewer**: Read-only access to assigned conversations

**Step 3: Alternative - Inline Group Mappings**

Instead of mounting a file, you can use an inline JSON string:

```yaml
environment:
  - GROUP_MAPPINGS_JSON={"admin":["AionUI-Admins"],"user":["AionUI-Users"],"viewer":["AionUI-Viewers"]}
```

**Step 4: Start the Container**

```bash
docker-compose -f deploy/docker/docker-compose.yml up -d
```

**Step 5: Verify OIDC Login**

1. Navigate to `http://your-domain:25808`
2. Click the **Sign in with OIDC** button
3. Authenticate via your identity provider
4. You'll be redirected back with appropriate role based on group membership

#### Initial Admin User Behavior

| Scenario                              | Result                                      |
| ------------------------------------- | ------------------------------------------- |
| **OIDC disabled**                     | Local `admin` user created on first startup |
| **OIDC enabled, no group mappings**   | First OIDC user to log in becomes admin     |
| **OIDC enabled, with group mappings** | Roles assigned based on group membership    |
| **Both OIDC and local enabled**       | Local `admin` available as fallback         |

### Configuration

Environment variables can be set in `docker-compose.yml` or via `.env` file:

| Variable              | Default                | Description                                                                            |
| --------------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| `AIONUI_PORT`         | `25808`                | WebUI server port                                                                      |
| `AIONUI_ALLOW_REMOTE` | `true`                 | Enable network access                                                                  |
| `JWT_SECRET`          | (auto)                 | JWT signing key (set for production)                                                   |
| `AIONUI_HTTPS`        | `false`                | Enable HTTPS mode (use with reverse proxy)                                             |
| `NODE_ENV`            | `production`           | Environment mode                                                                       |
| `OIDC_ENABLED`        | `false`                | Enable OIDC/SSO authentication                                                         |
| `OIDC_ISSUER`         | -                      | Identity provider issuer URL (e.g., `https://login.microsoftonline.com/{tenant}/v2.0`) |
| `OIDC_CLIENT_ID`      | -                      | OAuth client ID from your IdP                                                          |
| `OIDC_CLIENT_SECRET`  | -                      | OAuth client secret from your IdP                                                      |
| `OIDC_REDIRECT_URI`   | -                      | OAuth callback URL (e.g., `http://your-domain:25808/api/auth/oidc/callback`)           |
| `OIDC_SCOPES`         | `openid profile email` | Space-separated OAuth scopes                                                           |
| `OIDC_GROUPS_CLAIM`   | `groups`               | JWT claim containing user groups                                                       |
| `GROUP_MAPPINGS_FILE` | -                      | Path to group-mappings.json file (inside container)                                    |
| `GROUP_MAPPINGS_JSON` | -                      | Inline JSON string for group-to-role mapping                                           |

### Data Persistence

Data is stored in a named Docker volume `aionui_data`:

- Database: `aionui.db`
- Configuration files
- Session data

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

1. **Set JWT_SECRET** - Use a strong, random secret for consistent auth tokens

   ```bash
   JWT_SECRET=$(openssl rand -hex 32)
   ```

   - Store securely (use Docker secrets or encrypted environment files)
   - Never commit to version control
   - Rotating this secret invalidates all active sessions

2. **Use HTTPS** - Always deploy behind a reverse proxy with valid SSL/TLS certificates
   - Use nginx, Traefik, or Caddy for SSL termination
   - Set `AIONUI_HTTPS=true` when behind a proxy
   - Enforce HSTS headers

3. **Configure OIDC for Production**
   - Use your organization's identity provider (EntraID, Okta, Auth0)
   - Register the application with appropriate redirect URIs
   - Limit OAuth scopes to minimum required (`openid profile email`)
   - Use group-based role mapping for easier access management

4. **Network Security**
   - Never expose directly to public internet without additional protection
   - Use firewall rules and security groups
   - Restrict access to corporate network or VPN
   - Consider implementing rate limiting and DDoS protection

5. **Secrets Management**
   - Use Docker secrets for sensitive environment variables
   - Avoid passing secrets via command line or logs
   - Rotate `OIDC_CLIENT_SECRET` and `JWT_SECRET` periodically

#### OIDC-Specific Production Setup

**Example docker-compose.yml with secrets:**

```yaml
version: '3.8'
services:
  aionui:
    image: aionui:latest
    environment:
      - OIDC_ENABLED=true
      - OIDC_ISSUER=https://login.microsoftonline.com/${TENANT_ID}/v2.0
      - OIDC_CLIENT_ID=${OIDC_CLIENT_ID}
      - OIDC_REDIRECT_URI=https://aionui.company.com/api/auth/oidc/callback
      - GROUP_MAPPINGS_FILE=/config/group-mappings.json
    secrets:
      - oidc_client_secret
      - jwt_secret
    volumes:
      - aionui_data:/data
      - ./group-mappings.json:/config/group-mappings.json:ro
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G

secrets:
  oidc_client_secret:
    external: true
  jwt_secret:
    external: true

volumes:
  aionui_data:
    driver: local
```

**Reverse Proxy Example (nginx):**

```nginx
server {
    listen 443 ssl http2;
    server_name aionui.company.com;

    ssl_certificate /etc/ssl/certs/aionui.crt;
    ssl_certificate_key /etc/ssl/private/aionui.key;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://aionui:25808;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### Operational

1. **Resource Limits** - Adjust memory/CPU limits based on your workload
   - Minimum: 2GB RAM, 1 CPU core
   - Recommended for production: 4GB RAM, 2 CPU cores

2. **Monitoring** - Container includes health check endpoint at `/health`
   - Monitor authentication failures and token expiry events
   - Set up alerts for abnormal login patterns
   - Track token blacklist growth

3. **Backup Strategy**
   - Regular automated backups of the `aionui_data` volume
   - Backup includes database, configuration, and token blacklist
   - Test restore procedures periodically

4. **Logging**
   - Centralize logs using Docker logging drivers (e.g., Fluentd, Splunk)
   - Monitor for authentication errors and OIDC failures
   - Implement log rotation to prevent disk space issues

5. **Updates and Maintenance**
   - Keep container image updated for security patches
   - Test updates in staging environment before production
   - Review breaking changes in release notes

## Future Deployments

Additional deployment options may be added:

- `kubernetes/` - Kubernetes manifests
- `helm/` - Helm chart
- `systemd/` - Systemd service files
