# Dremio Transform Studio

A visual, low-code SQL pipeline builder for Dremio. Browse your catalog, build transformation pipelines with 53 pre-built transforms, preview results, and write output tables — all without writing SQL manually.

📖 **[Visual User Guide](https://htmlpreview.github.io/?https://github.com/dremio-community/dremio-transform-studio/blob/main/docs/VISUAL_GUIDE.html)** — step-by-step walkthrough with screenshots

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

## Desktop Apps

| Platform | Download |
|----------|----------|
| **Mac** | [TransformStudio-mac.dmg](https://github.com/dremio-community/dremio-transform-studio/releases/latest/download/TransformStudio-mac.dmg) — open and drag to Applications |
| **Linux (Mint / Ubuntu / Debian)** | [TransformStudio-linux.deb](https://github.com/dremio-community/dremio-transform-studio/releases/latest/download/TransformStudio-linux.deb) — double-click to install, or `sudo dpkg -i TransformStudio-linux.deb` |
| **Linux (any distro)** | [TransformStudio-linux.tar.gz](https://github.com/dremio-community/dremio-transform-studio/releases/latest/download/TransformStudio-linux.tar.gz) — extract and run `./TransformStudio/TransformStudio` |

Data is stored at `~/.transform_studio/transforms.db` and persists across launches — no volume mount needed.

> All releases and previous versions: [github.com/dremio-community/dremio-transform-studio/releases](https://github.com/dremio-community/dremio-transform-studio/releases)

---

## Connecting to Dremio

On first launch, go to **Settings (gear icon) → Connection** and enter your Dremio details:

| Deployment | Auth Type | Settings |
|-----------|-----------|---------|
| Self-hosted | Password | Host, port, username, password |
| Dremio Cloud | PAT | `api.dremio.cloud`, Personal Access Token, Project ID |

---

## Features

- **53 transforms** across 7 categories: Clean, Reshape, DateTime, Enrich, Aggregate, String, Custom SQL
- **Pipeline versioning** with full history and restore
- **Cron scheduling** with enable/disable per pipeline
- **SLA / deadline alerting** — alert if a pipeline hasn't completed by a configured time each day (e.g. "done by 8 AM")
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
- **dbt compatibility** — export all pipelines as a runnable dbt project ZIP; import any dbt project ZIP as Transform Studio pipelines (no dbt installation required)
- **SSO / Single Sign-On** — OIDC-based SSO for Okta, Azure AD, Google Workspace, and any OIDC-compatible identity provider; configure via Settings → SSO; users see "Sign in with…" buttons on the login screen
- **Pipeline templates** — 8 pre-built pipeline templates (Daily Sales Summary, Customer 360, Churn Candidates, User Activity Funnel, etc.); one click to deploy with your source table
- **Retry logic** — scheduled pipelines automatically retry with exponential backoff (1 min, 2 min, 4 min…) before alerting; configurable per pipeline (0–5 retries)
- **Pipeline tags & folders** — tag pipelines with free-form labels and group them into folders for easy navigation when managing large numbers of pipelines
- **Audit log** — full admin-visible log of all create, save, execute, delete, share, schedule, and SLA-breach events with user, timestamp, IP, and details; CSV export; auto-pruned after 90 days
- **Global search** — press ⌘K (Mac) or Ctrl+K to search all pipeline names, step configs, source tables, and notes
- **Inline step notes** — add a free-text note to any transform step (visible on the step card and searchable)
- **Rich parameter types** — parameters now support boolean toggles, single-select dropdown, multi-select checkboxes, and date picker — in addition to text and number

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

## dbt Compatibility

### Export to dbt
Click the **📦 Package icon** in the toolbar to download your pipelines as a standard dbt project ZIP. The ZIP includes:
- One `.sql` model file per pipeline (with `{{ config() }}`, `{{ source() }}`, `{{ ref() }}` Jinja)
- `sources.yml` for all external Dremio tables
- `schema.yml` with all column tests
- `dbt_project.yml` and `profiles.yml` ready to configure

Install `dbt-dremio`, edit `profiles.yml` with your connection, and run `dbt run`.

### Import from dbt
Click the **⬆ Upload icon** to import a dbt project ZIP. Transform Studio parses the Jinja without requiring dbt installed:
- Resolves `{{ source() }}` → Dremio table references
- Resolves `{{ ref() }}` → pipeline dependencies (wired automatically)
- Converts `{{ config(materialized=...) }}` → output mode
- Maps schema.yml tests → pipeline tests
- Each model becomes a pipeline with one Custom SQL step

---

## SSO / Single Sign-On

Transform Studio supports OIDC-based single sign-on so users can log in with their corporate identity provider instead of a local username and password.

**Supported providers:** Okta, Azure AD (Microsoft Entra ID), Google Workspace, or any standard OIDC-compatible provider.

### Setup

1. Go to **Settings → SSO** (gear icon in toolbar)
2. Click **Add Provider** and choose your identity provider type
3. Enter the **Client ID**, **Client Secret**, and the **OIDC Discovery URL** (the `/.well-known/openid-configuration` endpoint for your IdP)
4. Configure the **redirect URI** shown at the bottom of the form in your IdP's application settings
5. Save — users will immediately see a "Sign in with…" button on the login screen

### What happens at sign-in
- User clicks "Sign in with [Provider]" → redirected to the IdP login page
- After authentication, the IdP redirects back to Transform Studio
- Transform Studio looks up the user by their SSO subject ID, or falls back to email match, or provisions a new account automatically
- New SSO users are assigned the **default role** configured for that provider (Editor by default)

> **Note:** Auth must be enabled (`AUTH_ENABLED=true` or toggled on in Settings → Security) for SSO to take effect.

---

## Pipeline Templates

Click the **📐 Templates button** (grid icon) in the toolbar to open the template library. Templates are pre-built pipelines you can deploy with one click.

**Included templates:**

| Template | Category | Steps |
|----------|----------|-------|
| Daily Sales Summary | Analytics | 4 |
| Customer 360 | Analytics | 5 |
| Top Products by Revenue | Analytics | 4 |
| Revenue by Region | Analytics | 4 |
| Churn Candidates | Marketing | 5 |
| User Activity Funnel | Product | 5 |
| Monthly Cohort Retention | Product | 6 |
| Data Freshness Audit | Operations | 3 |

**How to deploy a template:**
1. Click the Templates button in the toolbar
2. Browse by category or scroll through all templates
3. Click a template to see the steps it includes
4. Enter your **source table** name (fully qualified: `namespace.table_name`)
5. Optionally enter an **output table** name
6. Click **Deploy Template** — the pipeline opens immediately, ready to preview or adjust

Templates are starting points — every step is fully editable after deployment.

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
