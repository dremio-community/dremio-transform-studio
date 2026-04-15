# Dremio Transform Studio

A visual, low-code SQL pipeline builder for Dremio. Browse your catalog, build transformation pipelines with 52 pre-built transforms, preview results, and write output tables — all without writing SQL manually.

---

## Quick Start with Docker

### Step 1 — Install Docker Desktop
Download and install from https://www.docker.com/products/docker-desktop. Launch it and wait for it to fully start.

### Step 2 — Run Transform Studio

**With data persistence (recommended):**
```bash
docker run -d -p 8000:8000 -v ~/transform-studio-data:/data mshainman/transform-studio:latest
```
The `-v ~/transform-studio-data:/data` flag saves all your pipelines, settings, and run history to a folder on your machine. Your data survives container restarts and upgrades automatically.

**Without persistence (data lost when container stops):**
```bash
docker run -d -p 8000:8000 mshainman/transform-studio:latest
```
If you use this option, use **Settings → Storage → Download Backup** to save your data before stopping the container.

### Step 3 — Open your browser
```
http://localhost:8000
```

---

## Backup & Restore

Even with a volume mount, you can back up and restore your data from within the app:

- **Settings → Storage → Download Backup** — downloads your full database as a `.db` file
- **Settings → Storage → Restore from Backup** — uploads a previously downloaded backup

Use backups to migrate between machines or recover from a bad state.

---

## Desktop App (Mac)

Download `TransformStudio-mac.dmg`, open it, and drag the app to your Applications folder. Data is stored at `~/.transform_studio/transforms.db` on your Mac and persists across launches — no volume mount needed.

---

## Connecting to Dremio

On first launch, go to **Settings (gear icon) → Connection** and enter your Dremio details:

| Deployment | Auth Type | Settings |
|-----------|-----------|---------|
| Self-hosted | Password | Host, port, username, password |
| Dremio Cloud | PAT | `api.dremio.cloud`, Personal Access Token, Project ID |

---

## Features

- **52 transforms** across 7 categories: Clean, Reshape, DateTime, Enrich, Aggregate, String, Custom SQL
- **Pipeline versioning** with full history and restore
- **Cron scheduling** with enable/disable per pipeline
- **Visual lineage** — column-level DAG from source to output
- **Pipeline tests** — 6 assertion types with optional failure row storage
- **Incremental models** — append, merge, and microbatch strategies
- **Cross-pipeline DAG** with dependency ordering and cycle detection
- **MCP Server** built-in at `/mcp/sse` (22 tools for AI agent integration)
- **Alerts** — custom SQL, pipeline health, data quality, and source freshness
- **Data Quality Hub** — dedicated DQ workspace with monitors, scoring, scheduling, and 14 built-in rules across 6 categories
- **Export documentation** — self-contained HTML doc for all pipelines
- **Multi-user roles** — Admin / Editor / Viewer roles; auth is opt-in via `AUTH_ENABLED=true`
- **Pipeline sharing** — owners can share pipelines with other users (viewer or editor access) via a Share button
- **Per-user Dremio credentials** — each user can set a personal Dremio PAT under User menu → "My Dremio Credentials" so their queries run under their own Dremio identity

---

## Environment Variables

```bash
# Dremio connection (can also be set via UI)
DREMIO_HOST=localhost
DREMIO_PORT=9047
DREMIO_AUTH_TYPE=password      # or "pat"
DREMIO_USER=admin
DREMIO_PASS=password
DREMIO_PAT=                    # Personal Access Token (Dremio Cloud)
DREMIO_PROJECT_ID=             # Dremio Cloud project ID

# Storage
DB_PATH=/data/transforms.db   # Default in Docker; change to use a custom path

# Authentication (disabled by default)
AUTH_ENABLED=false             # Set "true" to require login (recommended for team deployments)
JWT_SECRET=change-me-in-prod   # Change this for production deployments

# CORS (for shared server deployments)
ALLOWED_ORIGINS=*              # Or: "https://transforms.mycompany.com"
```

Once running, admins can also toggle auth on or off live — without restarting Docker — via **Settings → Security**.

---

## Server Deployment (Team Use)

For shared team use with HTTPS:
```bash
git clone https://github.com/dremio-community/dremio-community-connectors
cd dremio-transform-studio
./deploy/setup_server.sh
```
Sets up nginx + SSL via Let's Encrypt. For shared team deployments, set `AUTH_ENABLED=true` and configure `ALLOWED_ORIGINS` to your domain. Admins can toggle auth and manage users live from **Settings → Security** without restarting the container.

---

## Stopping & Restarting

```bash
# Stop
docker stop $(docker ps -q --filter ancestor=mshainman/transform-studio:latest)

# Restart (data is preserved if you used the volume mount above)
docker run -d -p 8000:8000 -v ~/transform-studio-data:/data mshainman/transform-studio:latest
```
