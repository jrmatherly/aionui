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

### Configuration

Environment variables can be set in `docker-compose.yml` or via `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `AIONUI_PORT` | `25808` | WebUI server port |
| `AIONUI_ALLOW_REMOTE` | `true` | Enable network access |
| `JWT_SECRET` | (auto) | JWT signing key (set for production) |
| `AIONUI_HTTPS` | `false` | Enable HTTPS mode (use with reverse proxy) |
| `NODE_ENV` | `production` | Environment mode |

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

1. **Set JWT_SECRET** - Use a strong, random secret for consistent auth tokens
2. **Use HTTPS** - Deploy behind nginx/Traefik with SSL termination
3. **Resource Limits** - Adjust memory/CPU limits based on your workload
4. **Monitoring** - Container includes health check endpoint

## Future Deployments

Additional deployment options may be added:

- `kubernetes/` - Kubernetes manifests
- `helm/` - Helm chart
- `systemd/` - Systemd service files
