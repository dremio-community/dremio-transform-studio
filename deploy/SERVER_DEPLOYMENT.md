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

## Step 6 — Start Everything

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

## Step 7 — Access the App

Open a browser and go to:
```
https://transformstudio.yourcompany.com
```

That's it! Share this URL with your team — no installs needed on their end.

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

Pipeline data (transforms, connection settings) is stored in a SQLite database
inside a Docker volume called `ts-data`. This survives:
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

## Notes & Current Limitations

- **Shared connection config** — All users on a server instance share the same
  Dremio connection settings. Per-user authentication is on the roadmap.
- **Single-tenant** — For isolation between teams, run separate instances on
  separate subdomains (e.g. `team-a.transformstudio.com`, `team-b.transformstudio.com`).
- **No built-in auth** — The app is accessible to anyone with the URL. For
  internal use, consider putting it behind a VPN or adding HTTP basic auth via
  Caddy (see below).

### Optional: Add HTTP Basic Auth via Caddy

If you want a simple login gate before users reach the app, add this to your
`Caddyfile`:

```
transformstudio.yourcompany.com {
    basicauth {
        # Generate password hash with: caddy hash-password
        alice $2a$14$Zkx19XLiW6VYouLHR5NmfOFU0z2GTNmpkT/5qqR7hx4IjWJPDhjvG
    }
    reverse_proxy transform-studio:8000
    encode gzip
}
```

Generate a password hash on the server:
```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpassword'
```

---

*Transform Studio — Built on Dremio*
