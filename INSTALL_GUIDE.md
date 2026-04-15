# Dremio Transform Studio — Installation Guide

**Version 1.9 | April 2026**

---

## Overview

Transform Studio can be deployed in several ways depending on your environment:

| Option | Best for | Technical level |
|--------|----------|-----------------|
| [Mac Desktop](#mac-desktop) | Individual Mac users | None |
| [Windows Desktop](#windows-desktop) | Individual Windows users | None |
| [Linux Desktop](#linux-desktop) | Individual Linux users | Low |
| [Docker — Personal](#docker-personal) | Any laptop/desktop with Docker | Low |
| [Docker — Shared Server](#docker-shared-server) | Teams sharing one instance | Medium |

All options connect to the same Dremio instance. Your pipelines and settings are stored locally on the machine running Transform Studio.

---

## Mac Desktop

**Requirements:** macOS 10.14 or later (Intel or Apple Silicon)

### Installation

1. Download **`TransformStudio-mac.dmg`**
2. Double-click the `.dmg` file to open it
3. Drag **TransformStudio** into the **Applications** folder
4. Close the installer window
5. Open **Launchpad** or **Applications** and click **Transform Studio**

> **First launch:** macOS may show a security warning saying the app is from an unidentified developer. If this happens:
> - Go to **System Settings → Privacy & Security**
> - Scroll down and click **Open Anyway** next to the Transform Studio message
> - Click **Open** in the confirmation dialog

### What happens when you launch

The app starts a local server on your machine and automatically opens your browser to `http://localhost:8000`. You'll see the Transform Studio interface.

### Quitting the app

Click the **⏻ power icon** in the top-right corner of the Transform Studio interface to shut down the server cleanly. You can also quit by closing the Terminal window that opened with the app, or force-quitting via Activity Monitor.

### Your data

Pipelines and settings are saved at: `~/.transform_studio/transforms.db`

This file persists across app updates. To back it up, just copy that file.

You can change the storage location in **Settings → Storage** from within the app.

### Uninstalling

1. Drag **TransformStudio** from Applications to the Trash
2. Optionally delete your data: `rm -rf ~/.transform_studio`

---

## Windows Desktop

**Requirements:** Windows 10 or later (64-bit)

### Installation

1. Download **`TransformStudio-windows.exe`**
2. Double-click the `.exe` file
3. If Windows SmartScreen appears, click **More info** → **Run anyway**
4. The app starts immediately — your browser opens to `http://localhost:8000`

> There is no traditional install wizard. The `.exe` is self-contained and runs directly.
> You can copy it to your Desktop or any folder for easy access.

### Your data

Pipelines and settings are saved at: `C:\Users\YourName\.transform_studio\transforms.db`

### Uninstalling

Simply delete the `.exe` file. To also remove your data, delete the `.transform_studio` folder in your user directory.

---

## Linux Desktop

**Requirements:** Ubuntu 20.04+, Linux Mint 20+, or any Debian-based distribution (64-bit)

### Option A — .deb package (recommended for Linux Mint / Ubuntu)

1. Download **`TransformStudio-linux.deb`**
2. Double-click the file — your package manager will open
3. Click **Install**
4. Launch from your application menu: search for **Transform Studio**

Or install from terminal:
```bash
sudo dpkg -i TransformStudio-linux.deb
```

Launch:
```bash
transform-studio
```

### Option B — tar.gz (any Linux distribution)

1. Download **`TransformStudio-linux.tar.gz`**
2. Extract it:
```bash
tar -xzf TransformStudio-linux.tar.gz
```
3. Run:
```bash
./TransformStudio/TransformStudio
```

To make it easy to launch, create a shortcut:
```bash
# Add to your PATH (add this to ~/.bashrc)
export PATH="$PATH:/path/to/TransformStudio"
```

### Building from Source (if no pre-built package is available)

If you have the project source code:

```bash
# Install prerequisites
sudo apt install python3 python3-pip nodejs npm

# Build
cd dremio-transform-studio
chmod +x build/build_linux.sh
./build/build_linux.sh

# Output will be in dist/
```

### Your data

Pipelines and settings are saved at: `~/.transform_studio/transforms.db`

### Uninstalling

```bash
# If installed via .deb
sudo dpkg -r transform-studio

# If using tar.gz, just delete the folder
rm -rf /path/to/TransformStudio

# Remove data (optional)
rm -rf ~/.transform_studio
```

---

## Docker — Personal

This option runs Transform Studio in a Docker container on your laptop or desktop. It works identically on Mac, Windows, and Linux.

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (free)

### Step 1 — Install Docker Desktop

Download and install Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/). It's a standard GUI installer. Once installed, make sure it's running (look for the Docker whale icon in your system tray/menu bar).

### Step 2 — Install Transform Studio

**Mac / Linux** — open Terminal and run:
```bash
curl -fsSL https://your-download-url/install.sh | bash
```

Or download `install.sh` and run it:
```bash
chmod +x install.sh
./install.sh
```

**Windows** — double-click `install.bat`

The script will:
1. Pull the Transform Studio Docker image (~200MB, one-time download)
2. Start the container
3. Open your browser to `http://localhost:8000`

### Managing the container

```bash
# Stop
docker stop transform-studio

# Start again
docker start transform-studio

# Update to latest version
./install.sh          # (Mac/Linux)
install.bat           # (Windows)

# View logs
docker logs transform-studio
```

### Your data

Pipelines are stored in a Docker volume called `ts-data`. This persists even if you stop or remove the container. To back it up:

```bash
docker run --rm -v ts-data:/data -v $(pwd):/backup alpine \
  tar -czf /backup/transform-studio-backup.tar.gz /data
```

### Changing the port

By default the app runs on port 8000. To use a different port:
```bash
TS_PORT=9000 ./install.sh
# Then open http://localhost:9000
```

### Enabling authentication (Docker Personal)

By default, no login is required. To require users to log in:

1. Stop and remove the container:
   ```bash
   docker stop transform-studio && docker rm transform-studio
   ```
2. Restart with authentication enabled:
   ```bash
   docker run -d \
     --name transform-studio \
     -p 8000:8000 \
     -v ts-data:/data \
     -e AUTH_ENABLED=true \
     -e JWT_SECRET=change-this-to-a-random-secret \
     mshainman/transform-studio:latest
   ```
3. Open `http://localhost:8000` — you'll see the login screen
4. Log in with **admin / admin** and change the password immediately

---

## Docker — Shared Server

This option runs Transform Studio on a server so your whole team can access it via a web browser at a URL like `https://transforms.yourcompany.com`. It includes automatic SSL certificates (HTTPS) via Let's Encrypt — free.

**Requirements:**
- A Linux server (Ubuntu 20.04+ recommended) — cloud VM (AWS EC2, Azure, GCP) or on-premises
- A domain name pointed at the server (DNS A record)
- Ports 80 and 443 open in your firewall/security group
- SSH access to the server

### Automated Setup (recommended)

SSH into your server and run:

```bash
curl -fsSL https://your-download-url/deploy/setup_server.sh | bash
```

Or copy `deploy/setup_server.sh` to your server and run it:

```bash
# Set your domain and email first
DOMAIN=transforms.yourcompany.com \
EMAIL=admin@yourcompany.com \
bash setup_server.sh
```

The script will:
1. Install Docker (if not already installed)
2. Configure nginx as a reverse proxy
3. Obtain a free SSL certificate from Let's Encrypt
4. Start Transform Studio
5. Set up automatic certificate renewal

Once complete, open `https://transforms.yourcompany.com` in any browser.

### Manual Setup

If you prefer to set up manually:

**1. Install Docker on your server:**
```bash
curl -fsSL https://get.docker.com | bash
systemctl enable --now docker
```

**2. Copy the deploy folder to your server:**
```bash
scp -r deploy/ user@your-server:/opt/transform-studio/
```

**3. Edit the nginx config** (`deploy/nginx/nginx.conf`):
Replace `transforms.yourcompany.com` with your actual domain.

**4. Start the stack:**
```bash
cd /opt/transform-studio
docker compose -f docker-compose.server.yml up -d
```

**5. Get your SSL certificate:**
```bash
docker exec ts-certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d transforms.yourcompany.com \
  --email admin@yourcompany.com \
  --agree-tos --non-interactive
docker compose -f docker-compose.server.yml restart nginx
```

### Managing the server

```bash
# Check status
docker compose -f docker-compose.server.yml ps

# View logs
docker compose -f docker-compose.server.yml logs -f transform-studio

# Update to latest version
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d

# Stop everything
docker compose -f docker-compose.server.yml down

# Restart
docker compose -f docker-compose.server.yml restart
```

### Pre-configuring Dremio connection and authentication

For a shared server you can pre-set the Dremio connection and enable authentication so users are required to log in. Edit `docker-compose.server.yml` and configure the environment variables:

```yaml
environment:
  - DB_PATH=/data/transforms.db
  # Dremio connection
  - DREMIO_HOST=your-dremio-server.com
  - DREMIO_USER=admin
  - DREMIO_PASS=yourpassword
  # For Dremio Cloud:
  # - DREMIO_AUTH_TYPE=pat
  # - DREMIO_PAT=your-personal-access-token
  # - DREMIO_PROJECT_ID=your-project-id
  # Authentication (recommended for shared/team deployments)
  - AUTH_ENABLED=true
  - JWT_SECRET=change-this-to-a-long-random-string
  # CORS — set to your actual domain when AUTH_ENABLED=true
  - ALLOWED_ORIGINS=https://transforms.yourcompany.com
```

Then restart: `docker compose -f docker-compose.server.yml up -d`

First time with auth enabled, log in with **admin / admin** at your server URL and change the password.

### Backups

Data is stored in the `ts-data` Docker volume. To back it up:

```bash
# Create backup
docker run --rm \
  -v ts-data:/data \
  -v /your/backup/path:/backup \
  alpine tar -czf /backup/transform-studio-$(date +%Y%m%d).tar.gz /data

# Restore from backup
docker run --rm \
  -v ts-data:/data \
  -v /your/backup/path:/backup \
  alpine tar -xzf /backup/transform-studio-20260410.tar.gz -C /
```

### Enabling User Authentication

For team deployments, you should enable the built-in authentication system:

**Option A — Enable via the UI (no restart needed):**
1. Start the server and open the app
2. Click the **⚙️ gear icon → Security** tab
3. Toggle authentication on
4. The first-time admin account is **username: admin / password: admin** — change it immediately
5. Create user accounts in **Settings → Users**

**Option B — Enable via environment variable (before first start):**
Add to your docker-compose or docker run command:
```
-e AUTH_ENABLED=true
-e JWT_SECRET=your-strong-random-secret-here
```

**Roles:**
- **Admin** — full access; manages users, settings, and all pipelines
- **Editor** — default role; creates and owns pipelines; can share with others
- **Viewer** — read-only access; can preview but not execute; must submit changes for review

**Important for production:**
- Always set `JWT_SECRET` to a long random string (32+ chars) — the default secret is public
- Set `ALLOWED_ORIGINS` to your domain (e.g. `https://transforms.mycompany.com`) when auth is enabled
- These can be set as environment variables or toggled from the Security tab

### Configuring SSO (Single Sign-On)

Transform Studio supports OIDC-based SSO. When configured, users see "Sign in with [Provider]" buttons on the login screen instead of (or alongside) the username/password form.

**Requirements:**
- `AUTH_ENABLED=true` must be set (SSO requires authentication to be enabled)
- Your identity provider must support OIDC (OpenID Connect)

**Setup steps:**
1. Open Transform Studio and log in as admin
2. Go to **Settings → SSO** (gear icon → SSO tab)
3. Click **Add Provider**, choose your provider type (Okta / Azure AD / Google / Custom)
4. Enter the Client ID, Client Secret, and OIDC Discovery URL from your IdP
5. Copy the **Redirect URI** shown in the form and register it in your IdP application settings
6. Click **Add Provider** — SSO is immediately active

**Redirect URI format:**
```
https://your-domain.com/api/auth/sso/{provider_name}/callback
```
For local testing: `http://localhost:8000/api/auth/sso/{provider_name}/callback`

**Common discovery URLs:**
- Okta: `https://{your-domain}.okta.com/oauth2/default/.well-known/openid-configuration`
- Azure AD: `https://login.microsoftonline.com/{tenant-id}/v2.0/.well-known/openid-configuration`
- Google: `https://accounts.google.com/.well-known/openid-configuration`

---

## Environment Variables Reference

All environment variables and their defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `./transforms.db` | Path to the SQLite database file |
| `DREMIO_HOST` | `localhost` | Dremio server hostname or IP |
| `DREMIO_PORT` | `9047` | Dremio server port |
| `DREMIO_SSL` | `false` | Use HTTPS for Dremio connection |
| `DREMIO_AUTH_TYPE` | `password` | `password` or `pat` |
| `DREMIO_USER` | — | Dremio username (password auth) |
| `DREMIO_PASS` | — | Dremio password (password auth) |
| `DREMIO_PAT` | — | Personal Access Token (Dremio Cloud) |
| `DREMIO_PROJECT_ID` | — | Dremio Cloud project ID |
| `AUTH_ENABLED` | `false` | Set to `true` to require user login |
| `JWT_SECRET` | *(dev default)* | Secret key for JWT tokens — **change in production** |
| `ALLOWED_ORIGINS` | `*` | Allowed CORS origins. Set to your domain(s) on shared servers, e.g. `https://transforms.yourcompany.com` |

> **Note on CORS:** The default `*` (allow all) is fine for local and desktop use. For shared server deployments with `AUTH_ENABLED=true`, always set `ALLOWED_ORIGINS` to your actual domain. Browsers block credentialed requests to wildcard origins per the CORS spec.

---

## v1.3 Features — What's New

Version 1.3 adds several new capabilities on top of the v1.2 feature set:

### Environments (dev/prod profiles)
Switch between multiple Dremio connection profiles from the toolbar. Create separate dev and prod environments pointing to different Dremio instances or schemas. The active environment is shown in the top bar and all pipeline executions use it. Useful for testing pipelines on dev data before promoting to production.

### Run with Dependencies
When a pipeline has upstream dependencies, the **Run Chain** button (merge icon in the toolbar) runs them in topological order before executing the current pipeline. Dependencies are defined per pipeline in the **Dependencies** tab of the right panel.

### Seed Table from CSV
Upload a `.csv` file to create or replace a Dremio table directly from the UI. Click the **Sprout** icon in the toolbar to open the seed dialog. Useful for loading lookup tables, reference data, or test fixtures without leaving Transform Studio.

### Iceberg Metadata Push
When a pipeline executes and writes to a table that already exists in an Iceberg REST catalog, Transform Studio automatically stamps the output table's metadata (row count, last updated timestamp) back into the catalog. The execute result panel shows whether metadata was stamped and via which method.

### Export Documentation
Click the **FileText** icon in the toolbar to generate a Markdown documentation file for all pipelines in the current workspace. The export includes pipeline descriptions, source tables, output tables, steps, parameters, and tests. Save it to your data catalog, wiki, or version control.

### MCP Server (AI Agent Integration)
Transform Studio includes a built-in MCP (Model Context Protocol) server at `/mcp/sse`. This allows AI assistants such as Claude Desktop to connect to your Transform Studio instance and operate it via natural language — listing pipelines, running previews, executing pipelines, checking run history, and more.

See the [MCP Server Setup](#mcp-server-setup) section below for configuration instructions.

---

## v1.4 Features — What's New

Version 1.4 closes the remaining gaps versus dbt with a focus on data quality, observability, and lineage.

### Microbatch Incremental Strategy
A third incremental strategy alongside Append and Merge. Instead of one large INSERT, the pipeline breaks the time range from the last processed timestamp to now into fixed-size windows (1 hour, 6 hours, 1 day, or 1 week) and processes each as a separate INSERT. Ideal for high-volume event streams. The execute result shows how many batches were run.

### Exposures — Downstream BI Documentation
Tag any pipeline with the dashboards and reports that consume its output. Each exposure has a name, tool type (Tableau, Looker, Metabase, Power BI, Mode, Superset, Redash, or Custom), URL, and optional description. Exposures appear as indigo cards below the output node in the Lineage view, linking the data pipeline directly to the business consumers.

### Column-Level Lineage
The Lineage view now includes a **Column Lineage** section that shows, for each transform step, which source columns contribute to each output column. Supports all 52 transform types. Useful for impact analysis — before renaming or dropping a column, see every downstream step that references it. No pipeline execution required; lineage is computed from the pipeline configuration.

### Test Store Failures
Pipeline tests can now optionally write failing rows to a Dremio table when they fail. Enable **Store Failures** on any test and a `_failures_{test_name}` table is created (or replaced) each time the test fails. A clickable orange badge in the test result panel copies the table name to clipboard so you can query it in Dremio.

### Relationships Test
A new test type that checks referential integrity — every value in a column must exist as a value in a column of another table. Equivalent to a foreign key constraint check. Configure with a source column, a reference table, and a reference column.

### Test Where Filter
Any test can now be scoped to a subset of rows using a SQL WHERE condition. For example, run a `not_null` test only on rows where `status = 'active'`, or a `unique` test only on records from the current month.

### Pre/Post Hook SQL
Each pipeline can now define SQL statements to run before and after execution. The pre-hook runs first — if it fails, the pipeline is aborted. The post-hook runs after a successful execute — if it fails, the pipeline is still marked as succeeded but the error is surfaced. Useful for truncating staging tables, updating log tables, or refreshing views.

### Source Freshness Alerts
A new fourth alert type monitors when source data goes stale. Checks the maximum value of a timestamp column against a configured age threshold (e.g. alert if no data newer than 2 hours). Useful for detecting when upstream feeds or ETL jobs have stopped delivering data.

### Step Bisection on Failure
When a pipeline execute fails, Transform Studio automatically runs a bisection search to identify which specific step caused the failure. The execute result message now includes "Failed at step N: [step name]", pinpointing the problem without manual trial and error.

---

## What's New in v1.9

- **SSO / Single Sign-On** — OIDC integration for Okta, Azure AD, Google Workspace, and any standard OIDC provider. Configure in Settings → SSO. Users see "Sign in with…" buttons on the login screen.
- **Pipeline Templates** — 8 pre-built pipeline templates accessible from the toolbar (📐 icon). Deploy with one click by specifying a source table.
- **Pivot Transform** — True row-to-column pivot using conditional aggregation SQL. Added to the Reshape category (53 transforms total).
- **Global Search** — Press ⌘K (Mac) or Ctrl+K to search across all pipeline names, step configurations, source tables, and step notes.
- **Inline Step Notes** — Add a free-text note to any transform step for documentation. Notes are visible on the step card and included in global search.
- **Rich Parameter Types** — Pipeline parameters now support boolean toggles, single-select dropdowns, multi-select checkboxes, and date pickers.
- **Scheduled Retry Logic** — Scheduled pipelines can automatically retry on failure with exponential backoff (configurable 0–5 retries) before sending an alert.

---

## v1.8 Features — What's New

Version 1.8 adds **bidirectional dbt compatibility** — export Transform Studio pipelines as a runnable dbt project, or import any dbt project ZIP as Transform Studio pipelines.

### Export as dbt Project

Click the **📦 Package icon** in the top toolbar. Transform Studio generates and downloads a complete dbt project ZIP containing:
- One `.sql` model file per pipeline, with proper `{{ config() }}`, `{{ source() }}`, and `{{ ref() }}` Jinja syntax
- `sources.yml` declaring all external Dremio tables
- `schema.yml` with all column-level tests translated to dbt test syntax
- `dbt_project.yml` and `profiles.yml` ready to configure and run

Output modes map to dbt materializations: CTAS → `table`, Incremental → `incremental` (with `unique_key` and strategy), View → `view`.

### Import from dbt

Click the **⬆ Upload icon** in the top toolbar, then drag a dbt project `.zip` file into the drop zone. Transform Studio:
- Resolves all Jinja (`{{ source() }}`, `{{ ref() }}`, `{{ config() }}`, `{% if is_incremental() %}`) without requiring dbt to be installed
- Creates one pipeline per model, with a Custom SQL step containing the resolved SQL
- Wires up pipeline dependencies from `{{ ref() }}` calls automatically
- Converts schema.yml tests to pipeline tests
- Shows a preview table before committing — you can review every model and see any warnings before clicking Import

---

## v1.7 Features — What's New

Version 1.7 adds **multi-user access control, roles, pipeline sharing, and per-user Dremio credentials** for team deployments.

See the [Server Deployment Guide](deploy/SERVER_DEPLOYMENT.md) for full setup instructions. Key additions:

- **Roles:** Admin, Editor (default), Viewer — enforced on all pipeline CRUD operations
- **Pipeline sharing:** owners share with specific users at editor or viewer access level via the Share button
- **Live auth toggle:** Settings → Security tab; no Docker restart needed
- **Per-user Dremio PAT:** each user sets their own PAT under User menu → My Dremio Credentials

---

## v1.6 Features — What's New

Version 1.6 introduces the **Data Quality Hub** — a full-screen workspace dedicated to monitoring the health and quality of your Dremio data, independent of the pipeline builder.

### Data Quality Hub

The DQ Hub is accessed via the blue **DQ Hub** pill button in the top toolbar (to the left of the Health Dashboard icon). It opens as a full-screen overlay with four sections:

**Overview**
A dashboard of stat cards showing total monitors, average DQ score across all monitors, and a count of passing vs. failing monitors. Below the cards is a monitor health grid — click any card to jump directly to that monitor's detail view.

**Monitors**
A list of all DQ monitors with an animated score ring for each. The ring is green (≥90%), amber (70–89%), or red (<70%) depending on the monitor's current score. Click any monitor to open its full detail view, showing per-rule results, the last scan time, and scan history.

**History**
A cross-monitor scan log showing all past scans across all monitors in a single table. Each row can be expanded to show a rule-by-rule drill-down: which rules passed, which failed, and their individual pass rates.

**Rule Catalog**
Browse all 14 built-in DQ rules grouped by category. Each rule card has an **Add to monitor…** shortcut so you can quickly attach it to an existing monitor without going through the full wizard.

### Creating a DQ Monitor

Click **+ New Monitor** from the Overview or Monitors section to launch a three-step wizard:

1. **Pick Table** — Browse your Dremio catalog using the namespace tree (identical to the sidebar catalog browser) and select the table you want to monitor.

2. **Configure Rules** — Add rules from the 14-rule catalog. Each rule has configurable parameters: column names, threshold values, regex patterns, and so on. Column dropdowns auto-populate from the selected table's schema so you don't have to type column names manually.

3. **Schedule & Alerts** — Set how often the monitor runs using a preset (never / hourly / daily / weekly) or a custom cron expression. Use the alert threshold slider (0–100%) to set the minimum acceptable DQ score, and toggle email and Slack alerts on if you want notifications when the score drops below that threshold.

### The 14 DQ Rules

Rules are grouped into six categories:

| Category | Rules |
|----------|-------|
| **Completeness** | Null Rate, Not Null (Strict), Row Count, Completeness Score |
| **Validity** | Regex Validity, Accepted Values, Numeric Range |
| **Uniqueness** | Column Uniqueness, Duplicate Key Check |
| **Accuracy** | Referential Integrity, Min/Max Bound |
| **Timeliness** | Data Freshness |
| **Consistency** | Cross-Column Consistency |
| **Custom** | Custom SQL Check |

### Scoring

Each rule produces a pass rate (0–100%). The overall DQ score for a monitor is the weighted average across all its rules. Scores are displayed as animated SVG ring charts and colour-coded: green (≥90%), amber (70–89%), or red (<70%).

### Scheduling and Alerts

Monitors with a cron schedule are scanned automatically by the background scheduler (which already powers pipeline scheduling). If a monitor has alerts enabled and the score drops below the configured threshold, Transform Studio sends an email and/or Slack notification using the same notification settings as pipeline alerts.

---

## MCP Server Setup

Transform Studio's MCP server is always running — no extra process or configuration required. The server exposes 22 tools that cover the full pipeline lifecycle.

### Option A — Local deployment (no auth)

Use this when running Transform Studio locally (`http://localhost:8000`) without `AUTH_ENABLED`.

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "transform-studio": {
      "url": "http://localhost:8000/mcp/sse",
      "transport": "sse"
    }
  }
}
```

Restart Claude Desktop. You'll see **transform-studio** appear in the MCP tools panel.

### Option B — Shared server with authentication

Use this when Transform Studio is deployed on a server with `AUTH_ENABLED=true`.

**Step 1** — Get a JWT token. Log in and copy it from your browser's developer tools (Application → Local Storage → `ts_token`), or call the login API:

```bash
curl -s -X POST https://transforms.yourcompany.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your-username","password":"your-password"}' \
  | jq -r '.token'
```

**Step 2** — Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "transform-studio": {
      "url": "https://transforms.yourcompany.com/mcp/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR_JWT_TOKEN_HERE"
      }
    }
  }
}
```

Restart Claude Desktop.

### Option C — Standalone stdio server (advanced)

If your MCP client only supports stdio (not SSE), use the standalone `mcp_server.py`:

```bash
# Install dependencies
pip install httpx

# Local (no auth)
python backend/mcp_server.py --url http://localhost:8000

# Server with auth
python backend/mcp_server.py \
  --url https://transforms.yourcompany.com \
  --token YOUR_JWT_TOKEN
```

Claude Desktop config for stdio:

```json
{
  "mcpServers": {
    "transform-studio": {
      "command": "python",
      "args": [
        "/path/to/dremio-transform-studio/backend/mcp_server.py",
        "--url", "https://transforms.yourcompany.com",
        "--token", "YOUR_JWT_TOKEN"
      ]
    }
  }
}
```

### Available MCP Tools

| Tool | What it does |
|------|-------------|
| `list_pipelines` | List all pipelines |
| `get_pipeline` | Get a single pipeline with its steps |
| `create_pipeline` | Create a new pipeline |
| `update_pipeline` | Update an existing pipeline |
| `delete_pipeline` | Delete a pipeline |
| `preview_pipeline` | Run a preview (no output written) |
| `execute_pipeline` | Execute a pipeline and write output |
| `get_pipeline_runs` | Get run history for a pipeline |
| `get_all_runs` | Get run history across all pipelines |
| `list_namespaces` | Browse top-level Dremio namespaces |
| `list_namespace_contents` | Browse a Dremio namespace |
| `get_table_schema` | Get column names and types for a table |
| `list_transforms` | List all available transform types |
| `get_transform` | Get details for a specific transform |
| `list_schedules` | List all pipeline schedules |
| `run_schedule_now` | Trigger a scheduled pipeline immediately |
| `list_catalogs` | List Iceberg REST catalog connections |
| `list_alerts` | List all configured alerts |
| `run_alert_now` | Trigger an alert check immediately |
| `get_health` | Check API and Dremio connectivity |
| `list_custom_transforms` | List saved custom SQL templates |
| `get_dag` | Get the cross-pipeline dependency graph |

### Example prompts for Claude

Once connected, you can ask Claude things like:

- *"List all my pipelines and show which ones ran successfully today"*
- *"Preview the `customer_enrichment` pipeline and tell me how many rows it returns"*
- *"Create a pipeline that filters orders from the last 30 days and groups by region"*
- *"What does the DAG look like for pipelines that depend on `dim_customers`?"*
- *"Run the full chain for `weekly_report` including all its dependencies"*

---

## First-Time Configuration (all versions)

After installing and opening Transform Studio for the first time:

1. Click the **⚙️ gear icon** in the top-right corner
2. Enter your Dremio connection details (see the [User Guide](USER_GUIDE.md) for details)
3. Click **Test Connection** to verify
4. Click **Save & Connect**

Your connection settings are saved and will be remembered across restarts.

---

## Troubleshooting

### App won't open (Mac)
- Make sure Docker Desktop is running (for Docker version)
- For the .dmg version: go to System Settings → Privacy & Security → click "Open Anyway"
- Try opening Terminal and running: `open -a TransformStudio`

### Can't connect to Dremio
- Verify the host, port, and credentials in Connection Settings
- Click "Test Connection" — the error message will explain the issue
- Check that your Dremio server is reachable from this machine
- For Dremio Cloud, make sure your PAT hasn't expired

### Port 8000 already in use (Docker/desktop)
- The desktop app automatically finds the next available port
- For Docker: change the port in `install.sh` or `docker-compose.yml`

### Browser doesn't open automatically
- Manually open your browser and go to `http://localhost:8000`

### Login screen won't accept credentials
- Default credentials are **admin / admin** — make sure auth is enabled (`AUTH_ENABLED=true`)
- If you've lost admin access, stop the container, delete the `ts-data` volume, and restart (this resets all data)
- Check logs: `docker logs transform-studio`

### Pipeline preview fails
- Check the SQL using the "View SQL" button — the error from Dremio is shown there
- Verify your source table exists and you have read permissions in Dremio

### Lost my data
- Desktop app: data is at `~/.transform_studio/transforms.db` — check it's not been deleted
- Docker: data is in the `ts-data` volume — run `docker volume inspect ts-data` to confirm

### Scheduled pipelines aren't running
- Check the schedule is enabled (not paused) in the schedule panel
- Check run history in the **Runs** tab for error messages
- Ensure the container is running: `docker ps`

### MCP server not connecting
- Confirm Transform Studio is running and accessible at the configured URL
- For auth-enabled deployments, verify your JWT token is valid (tokens expire after 1 week)
- Test the SSE endpoint directly: `curl -N http://localhost:8000/mcp/sse` — you should see an `event: endpoint` line
- Check container logs for errors: `docker logs transform-studio`

---

## System Requirements Summary

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 512 MB | 2 GB |
| Disk | 500 MB | 2 GB |
| Browser | Chrome 90+, Firefox 90+, Safari 15+, Edge 90+ | Latest Chrome |
| Network | Access to Dremio server | — |
