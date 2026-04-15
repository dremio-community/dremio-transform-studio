# Transform Studio — Server Deployment Guide

This guide walks through deploying Transform Studio on a cloud server so your
whole team can access it via a browser at a shared URL — no installs required
for end users.

---

## What You'll Need

| Requirement | Notes |
|---|---|
| A cloud VM | AWS EC2, DigitalOcean Droplet, GCP Compute Engine, Azure VM — any works. A 2-core / 4GB RAM instance is plenty for a small team. |
| A domain name | e.g. `transformstudio.yourcompany.com` — you'll point this at your server's IP |
| Docker + Docker Compose | Installed on the server (instructions below) |
| Docker Hub access | The `mshainman/transform-studio` image must be public, or you must `docker login` first |

---

## Step 1 — Provision a Server

Spin up a Linux VM (Ubuntu 22.04 recommended) on your cloud provider of choice.
Make note of its **public IP address**.

Open the following ports in your firewall / security group:
- **Port 80** (HTTP — Caddy uses this for certificate verification)
- **Port 443** (HTTPS — where users will access the app)

> Port 8000 does NOT need to be open publicly — Caddy proxies to it internally.

---

## Step 2 — Point Your Domain at the Server

In your DNS provider (Route 53, Cloudflare, GoDaddy, etc.), create an **A record**:

```
Type:  A
Name:  transformstudio       (or whatever subdomain you want)
Value: <your server's public IP>
TTL:   300
```

The full URL will be `https://transformstudio.yourcompany.com`.

> DNS propagation can take a few minutes to a few hours.

---

## Step 3 — Install Docker on the Server

SSH into your server and run:

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Log out and back in so group changes take effect
exit
```

Verify it works:
```bash
docker --version
docker compose version
```

---

## Step 4 — Upload the Deployment Files

From your local machine, copy the `deploy/` folder to the server:

```bash
scp -r deploy/ user@<your-server-ip>:~/transform-studio/
```

Or clone your repo directly on the server if it's on GitHub.

---

## Step 5 — Configure Your Domain in the Caddyfile

On the server, edit `~/transform-studio/Caddyfile` and replace the placeholder
with your actual domain:

```
# Before:
transformstudio.yourdomain.com {

# After (example):
transformstudio.acme-corp.com {
```

---

## Step 6 — Configure Environment Variables

Before starting, set the required environment variables in your
`docker-compose.server.yml` (or export them in your shell session):

```yaml
environment:
  AUTH_ENABLED: "true"
  JWT_SECRET: "your-strong-random-secret-here"
  ALLOWED_ORIGINS: "https://transformstudio.yourcompany.com"
```

Generate a strong random secret with:
```bash
openssl rand -hex 32
```

> **CORS note:** When `AUTH_ENABLED=true`, always set `ALLOWED_ORIGINS` to your
> actual domain. The `allow_credentials=True` CORS requirement is incompatible
> with wildcard `*` origins — setting your domain explicitly is both correct and
> required by the CORS spec.

---

## Step 7 — Start Everything

```bash
cd ~/transform-studio

# Pull the latest image
docker pull mshainman/transform-studio:latest

# Start all services in the background
docker compose up -d
```

Caddy will automatically obtain a free SSL certificate from Let's Encrypt.
This takes about 30 seconds on the first start.

Check that everything is running:
```bash
docker compose ps
```

You should see both `transform-studio` and `caddy` with status `Up`.

---

## Step 8 — Enable User Authentication

Transform Studio v1.7 includes full built-in authentication with role-based
access control. This is the recommended approach for all team deployments.

### Enabling Auth

**Option A — via environment variables (recommended):**

Set `AUTH_ENABLED=true` and a strong `JWT_SECRET` in your docker-compose file
before starting (see Step 6). Auth will be active on first launch.

**Option B — live toggle from the UI (no restart needed):**

Start the app without setting `AUTH_ENABLED`, then go to
**Settings → Security tab** and toggle auth on from the interface. Changes take
effect immediately without restarting the container.

### First Login

- Default credentials on first launch: **admin / admin**
- **Change this password immediately** after logging in.

### Roles

| Role | Permissions |
|---|---|
| Admin | Full access — manage users, settings, all pipelines |
| Editor | Create and own pipelines, run and edit their own pipelines |
| Viewer | Read-only access; can submit pipelines for review but cannot execute |

### Creating Users

Admins create and manage user accounts under **Settings → Users**. From there
you can add users, assign roles, and delete accounts.

### Per-User Dremio Credentials

Each user can set their own Dremio Personal Access Token (PAT) independently.
Go to **User menu → My Dremio Credentials** to enter your PAT. This replaces
the shared connection config for that user's sessions — no admin involvement
needed.

---

## Step 9 — Access the App

Open a browser and go to:
```
https://transformstudio.yourcompany.com
```

That's it! Share this URL with your team — no installs needed on their end.
If auth is enabled, users will see a login screen before accessing the app.

---

## Ongoing Operations

### View logs
```bash
# All services
docker compose logs -f

# Just Transform Studio
docker compose logs -f transform-studio
```

### Update to the latest version
```bash
docker compose pull
docker compose up -d
```

### Stop the app
```bash
docker compose down
```

### Restart the app
```bash
docker compose restart
```

---

## Data Persistence

Pipeline data (transforms, connection settings, users, credentials) is stored in
a SQLite database inside a Docker volume called `ts-data`. This survives:
- Container restarts
- Image updates (`docker compose pull` + `up -d`)

It does NOT survive:
- `docker compose down -v` (the `-v` flag removes volumes — avoid this)

### Backup the database
```bash
docker run --rm \
  -v transform-studio_ts-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/ts-data-backup.tar.gz /data
```

---

## Recommended Server Sizing

| Team Size | CPU | RAM | Storage |
|---|---|---|---|
| 1–5 users | 1 core | 2 GB | 20 GB |
| 5–20 users | 2 cores | 4 GB | 40 GB |
| 20+ users | 4 cores | 8 GB | 80 GB |

---

## Notes

- **Single-tenant** — For isolation between teams, run separate instances on
  separate subdomains (e.g. `team-a.transformstudio.com`, `team-b.transformstudio.com`).
- **Auth is optional for local/desktop use** — `AUTH_ENABLED` defaults to `false`.
  Desktop and single-user Docker deployments work without any login configuration.
- **JWT token expiry** — Tokens are valid for 1 week. Users are prompted to log
  in again when their token expires.

---

*Transform Studio — Built on Dremio*
