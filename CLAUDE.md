# Dremio Transform Studio — Project Context for Claude Code

This file gives Claude Code full context on this project. Read it entirely before making any changes.

---

## What This Is

**Dremio Transform Studio** is a low-code SQL pipeline builder that sits on top of Dremio. Users browse the Dremio catalog, pick a source table, add transform steps (filter, join, cast, aggregate, etc.), preview results, and execute to write output tables/views — all without writing SQL manually. The app generates and runs the SQL against Dremio's REST API.

It is comparable to dbt in concept but with a visual UI rather than YAML/SQL files.

---

## Architecture

```
dremio-transform-studio/
├── backend/                    # Python / FastAPI
│   ├── main.py                 # All API routes + static file serving
│   ├── config.py               # Settings class (reads env vars, persists to DB)
│   ├── store.py                # SQLite persistence (pipelines, versions, schedules, settings, users, runs, profile cache)
│   ├── models.py               # Pydantic models (Pipeline, TransformStep, PipelineParameter, PipelineTest, TestResult, etc.)
│   ├── auth.py                 # JWT auth — hash_password, verify_password, create_token, get_current_user
│   ├── dremio_client.py        # Dremio REST API client (auth, SQL, job polling)
│   ├── catalog_client.py       # Dremio catalog browsing (namespaces, tables, schemas)
│   ├── iceberg_rest_client.py  # Iceberg REST catalog client
│   ├── scheduler.py            # Cron-based pipeline scheduler (runs every 60s)
│   ├── test_runner.py          # Pipeline test execution (not_null, unique, row_count, accepted_values, custom_sql)
│   ├── dag_utils.py            # Cross-pipeline DAG: topological_sort, find_cycles, build_dag_response
│   ├── desktop_launcher.py     # Entry point for PyInstaller desktop builds
│   ├── requirements.txt        # Python dependencies
│   └── transforms/
│       ├── registry.py         # Transform registry — lists all 52 transforms
│       ├── codegen.py          # compile_pipeline() + compile_execute() + compile_incremental()
│       └── library/
│           ├── clean.py
│           ├── reshape.py
│           ├── datetime_transforms.py
│           ├── enrich.py
│           ├── aggregate.py
│           ├── string_transforms.py
│           └── custom_sql.py   # 52nd transform: custom SQL with {input} placeholder
│
├── frontend/                   # React + TypeScript + Vite + Tailwind
│   ├── src/
│   │   ├── App.tsx             # Main app shell — all state, layout, routing, auth flow
│   │   ├── api/client.ts       # All API calls (axios, typed, JWT interceptor)
│   │   ├── types/index.ts      # TypeScript interfaces
│   │   └── components/
│   │       ├── PipelineBuilder.tsx      # Center panel — step list with drag-and-drop (@dnd-kit)
│   │       ├── TransformLibrary.tsx     # Right panel — browse/add transforms
│   │       ├── TransformConfig.tsx      # Right panel — configure selected step
│   │       ├── LineageView.tsx          # Center panel — visual DAG (source→steps→output)
│   │       ├── VersionHistory.tsx       # Right panel — version list + restore
│   │       ├── ScheduleModal.tsx        # Modal — cron schedule editor
│   │       ├── ConnectionSettingsModal.tsx  # Modal — Connection/Notifications/Storage/Users tabs
│   │       ├── CatalogBrowser.tsx       # Left sidebar — Dremio namespace/table tree
│   │       ├── IcebergCatalogBrowser.tsx    # Left sidebar — Iceberg REST catalog tree
│   │       ├── AddCatalogModal.tsx      # Modal — add Iceberg REST catalog connection
│   │       ├── PreviewTable.tsx         # Bottom panel — query results grid
│   │       ├── SqlPreview.tsx           # Bottom panel — generated SQL viewer
│   │       ├── DataProfilePanel.tsx     # Inline panel — column stats (nulls, distinct, min/max)
│   │       ├── LoginModal.tsx           # Full-screen login overlay (when auth enabled)
│   │       ├── ParametersPanel.tsx      # Right panel tab — define/manage pipeline parameters
│   │       ├── RunWithParamsModal.tsx   # Modal — fill parameter values before execution
│   │       ├── WebhookPanel.tsx         # Right panel tab — webhook URL, curl example, regenerate
│   │       ├── DependencyPanel.tsx      # Right panel tab — add/remove upstream pipeline dependencies
│   │       ├── PipelineDagView.tsx      # Full-screen SVG cross-pipeline DAG visualization
│   │       ├── TestsPanel.tsx           # Right panel tab — define/edit pipeline tests, Run Now button
│   │       ├── CustomSqlEditor.tsx      # Full-screen SQL editor for custom_sql transform + template library
│   │       ├── AlertsPage.tsx           # Full-page alerts management (list, history, run-now)
│   │       └── CreateAlertModal.tsx     # Modal — create/edit alert (custom SQL, pipeline health, data quality)
│   ├── tailwind.config.js      # Custom colors: navy-*, dblue-*, surface-*
│   └── vite.config.ts          # Dev proxy: /api → http://host.docker.internal:8000
│
├── transform_studio.spec       # PyInstaller build spec (Mac .app, Windows .exe, Linux)
├── Dockerfile                  # Production single-container build (npm install, not npm ci)
├── docker-compose.yml          # Production Docker Compose (port 8000, SQLite volume)
├── docker-compose.dev.yml      # Dev: frontend container only (Vite HMR on :5173)
├── install.sh                  # Docker installer for Mac/Linux desktops
├── install.bat                 # Docker installer for Windows desktops
├── build/
│   ├── build_mac.sh            # Builds TransformStudio-mac.dmg locally
│   ├── build_linux.sh          # Builds .tar.gz + .deb locally
│   ├── build_windows.bat       # Builds .exe locally
│   └── rebuild_docker.sh       # --no-cache rebuild + container restart
└── deploy/
    ├── docker-compose.server.yml   # Server deployment with nginx + certbot SSL
    ├── nginx/nginx.conf            # nginx reverse proxy config
    └── setup_server.sh             # One-command server setup script
```

---

## How to Run (Development)

### Backend (runs directly on host — Python 3.9)
```bash
cd backend
pip3 install -r requirements.txt
python3 -m uvicorn main:app --reload --port 8000
```
The backend auto-reloads on file changes. SQLite DB at `./transforms.db`.

### Frontend (runs in Docker)
```bash
docker compose -f docker-compose.dev.yml up
# Opens at http://localhost:5173
# Proxies /api/* → http://host.docker.internal:8000
```

Or without Docker (needs Node 20):
```bash
cd frontend
npm install
npm run dev
```

---

## Key Design Decisions

### SQL Codegen
Pipelines compile to a CTE chain:
```sql
WITH _src AS (SELECT * FROM source_table),
     _s0 AS (/* step 0 transform */),
     _s1 AS (/* step 1 transform */)
SELECT * FROM _s1
```
`compile_pipeline()` in `codegen.py` handles this. Each transform's `generate()` function receives `(input_cte_name, columns, config)` and returns `(sql_expression, output_columns)`.

### Parameter Substitution
Before SQL codegen, `_substitute_params(config_dict, param_values, parameters)` in `codegen.py` replaces `{{param_name}}` placeholders in any string config value. Parameters have types (string/number/date) and default values. When executing via the UI, a modal collects overrides. Scheduled runs use default values. Webhook triggers can pass `param_values` in the request body.

### Dremio Auth
Two modes controlled by `config.py`:
- **password**: POST `/apiv2/login` → session token → `Authorization: _dremio{token}`
- **PAT**: `Authorization: Bearer {token}` — used for Dremio Cloud

### Dremio Cloud vs Self-hosted
`config.settings.api_prefix` returns:
- Cloud: `/v0/projects/{project_id}`
- Self-hosted: `""` (uses `/api/v3/`)

All client methods use this prefix dynamically.

### Static File Serving (Desktop/Docker builds)
`main.py` detects whether `frontend/dist` exists and mounts it via `StaticFiles`. In dev mode the Vite server handles the frontend. In production/desktop the same FastAPI process serves both.

### Desktop App
`desktop_launcher.py` is the PyInstaller entry point. It:
1. Sets `TS_DESKTOP_MODE=1` env var (enables Quit button in UI)
2. Creates `~/.transform_studio/` for the SQLite DB
3. Reads `config.json` from data dir for custom DB path (`db_path` key)
4. Finds a free port starting at 8000
5. Opens the browser after 2 seconds
6. Starts uvicorn with the FastAPI app object (NOT string import — required for frozen bundles)

### User Authentication
Controlled by `AUTH_ENABLED` env var (default: `false`). When disabled, all requests get a synthetic default user and the UI has no login screen — fully backward compatible.

When enabled:
- Uses JWT tokens (via `python-jose`), 1-week expiry, stored in `localStorage`
- Passwords hashed with `sha256_crypt` via passlib (NOT bcrypt — bcrypt 4.x has incompatibilities with passlib 1.7.4)
- `auth.py` provides: `hash_password`, `verify_password`, `create_token`, `decode_token`, `get_current_user` (FastAPI dependency)
- First-run seeds an `admin/admin` user if users table is empty
- `require_user` and `require_admin` dependencies enforce access control per route
- Frontend axios interceptor attaches `Authorization: Bearer {token}` to every request; on 401 clears token and emits `ts:unauthorized` event

### Data Profiling
`GET /api/catalog/profile?table=...&refresh=bool` runs a profiling SQL query on Dremio (COUNT, COUNT DISTINCT, MIN, MAX per column, on up to 10,000 rows). Results are cached in `profile_cache` SQLite table for 1 hour. `refresh=true` bypasses cache. First run typically 5–15 seconds; subsequent views instant.

### Webhooks
Each pipeline has a `webhook_token` UUID. `POST /api/webhooks/{token}/trigger` runs the pipeline without requiring user auth (token IS the auth). Supports `mode=sync` (wait for result) or `mode=async` (return job_id immediately). `param_values` can be passed in request body. Tokens are regeneratable via `/api/pipelines/{id}/webhook/regenerate`.

### Scheduling
`scheduler.py` runs a background asyncio loop that checks every 60 seconds whether any enabled schedules are due (using `croniter`). Runs pipelines via `dremio_client.run_query()`. On completion, logs the run to `pipeline_runs` table. If email or Slack notifications are configured in `app_settings`, sends failure alerts.

### Drag-and-Drop Reordering
`PipelineBuilder.tsx` uses `@dnd-kit/core` + `@dnd-kit/sortable`. Steps have a grip handle on the left. `DragOverlay` renders a ghost of the dragged item. ↑↓ buttons remain as fallback. The Dockerfile uses `npm install` (not `npm ci`) so lock-file-absent packages are accepted.

---

## Database Schema (SQLite)

```sql
pipelines
  id TEXT PRIMARY KEY
  name TEXT NOT NULL
  description TEXT                    -- optional pipeline description/notes
  source_table TEXT NOT NULL
  output_table TEXT
  output_mode TEXT DEFAULT 'preview'  -- 'preview'|'ctas'|'insert'|'view'|'incremental'|'scd2'
  current_version INTEGER DEFAULT 1
  parameters TEXT DEFAULT '[]'        -- JSON array of PipelineParameter
  webhook_token TEXT                  -- UUID, auto-generated on create
  user_id TEXT DEFAULT 'default'      -- owner (when auth enabled)
  dependencies TEXT DEFAULT '[]'      -- JSON array of upstream pipeline IDs
  tests_json TEXT DEFAULT '[]'        -- JSON array of PipelineTest definitions
  incremental_strategy TEXT           -- 'merge' | 'append' (when output_mode=incremental)
  incremental_key TEXT                -- key/timestamp column for incremental runs
  created_at TEXT
  updated_at TEXT

pipeline_versions
  id TEXT PRIMARY KEY
  pipeline_id TEXT NOT NULL
  version INTEGER NOT NULL
  steps_json TEXT NOT NULL
  message TEXT
  created_at TEXT

pipeline_schedules
  id TEXT PRIMARY KEY
  pipeline_id TEXT NOT NULL
  cron_expression TEXT NOT NULL
  enabled INTEGER DEFAULT 1
  last_run_at TEXT
  last_run_status TEXT

pipeline_runs
  id TEXT PRIMARY KEY
  pipeline_id TEXT NOT NULL
  pipeline_name TEXT
  run_type TEXT                       -- 'manual' | 'scheduled' | 'webhook'
  status TEXT                         -- 'success' | 'failed'
  row_count INTEGER
  error_message TEXT
  started_at TEXT
  completed_at TEXT
  test_results_json TEXT              -- JSON array of TestResult (populated after execute)

catalog_connections
  id TEXT PRIMARY KEY
  name TEXT NOT NULL
  url TEXT NOT NULL
  auth_type TEXT
  token TEXT
  ...

app_settings
  key TEXT PRIMARY KEY
  value TEXT

users
  id TEXT PRIMARY KEY
  username TEXT UNIQUE NOT NULL
  password_hash TEXT NOT NULL
  is_admin INTEGER DEFAULT 0
  created_at TEXT

profile_cache
  table_name TEXT PRIMARY KEY
  profile_json TEXT NOT NULL
  cached_at TEXT NOT NULL

custom_transforms
  id TEXT PRIMARY KEY
  name TEXT NOT NULL
  sql TEXT NOT NULL
  description TEXT
  created_at TEXT
  updated_at TEXT

alerts
  id TEXT PRIMARY KEY
  name TEXT NOT NULL
  alert_type TEXT NOT NULL            -- 'custom_sql' | 'pipeline_health' | 'data_quality'
  config_json TEXT NOT NULL           -- alert-type-specific config
  cron_expression TEXT NOT NULL
  enabled INTEGER DEFAULT 1
  notify_email TEXT
  notify_slack TEXT
  last_run_at TEXT
  last_run_status TEXT
  created_at TEXT
  updated_at TEXT

alert_history
  id TEXT PRIMARY KEY
  alert_id TEXT NOT NULL
  status TEXT                         -- 'ok' | 'triggered' | 'error'
  message TEXT
  triggered INTEGER DEFAULT 0
  run_at TEXT
```

---

## All 52 Transforms

### Clean (14)
`remove_duplicates`, `drop_nulls`, `fill_null`, `trim_whitespace`, `standardize_case`,
`cast_type`, `filter_rows`, `remove_special_chars`, `validate_regex`, `clip_values`,
`replace_string`, `outlier_filter`, `rename_columns`, `select_columns`

### Reshape (9)
`drop_columns`, `split_column`, `combine_columns`, `add_column`, `join`, `union`,
`reorder_columns`, `unpivot`, `flatten_json`

### DateTime (5)
`parse_date`, `extract_date_part`, `truncate_date`, `date_diff`, `date_add`

### Enrich (10)
`lookup_join`, `map_values`, `bin_values`, `add_row_number`, `add_running_total`,
`conditional_column`, `lag_lead`, `percent_of_total`, `unit_conversion`, `dedupe_keep_latest`

### Aggregate (5)
`group_aggregate`, `top_n_per_group`, `rolling_window`, `sample_rows`, `scd_type_1`

### String (8)
`extract_regex`, `pad_string`, `substring`, `string_length`, `upper_lower`,
`concat_literal`, `hash_column`, `surrogate_key`

### Custom (1)
`custom_sql` — full-screen SQL editor, uses `{input}` placeholder for upstream CTE alias, template library (save/search/load snippets stored in `custom_transforms` table)

---

## API Endpoints

### Auth
```
GET  /api/auth/status           → { auth_enabled, version }
POST /api/auth/login            body: { username, password } → { token, user }
POST /api/auth/logout           (clears server-side state if any)
GET  /api/auth/me               → { user_id, username, is_admin }
GET  /api/auth/users            admin only → [{ id, username, is_admin, created_at }]
POST /api/auth/users            admin only, body: { username, password, is_admin }
DELETE /api/auth/users/{id}     admin only
```

### System
```
GET  /api/health                → { status, dremio }
GET  /api/is-desktop            → { desktop: bool }
POST /api/quit                  desktop only — graceful shutdown
```

### Settings
```
GET  /api/settings/connection
PUT  /api/settings/connection
POST /api/settings/connection/test
GET  /api/settings/storage      → { db_path, default_db_path, is_custom, is_desktop }
PUT  /api/settings/storage      body: { db_path }
GET  /api/settings/notifications
PUT  /api/settings/notifications
POST /api/settings/notifications/test
```

### Catalog
```
GET  /api/catalog/namespaces
GET  /api/catalog/namespaces/{ns}
GET  /api/catalog/table-schema?table=ns.table
GET  /api/catalog/profile?table=ns.table&refresh=false
```

### Transforms
```
GET  /api/transforms
GET  /api/transforms/{id}
```

### Pipelines
```
POST   /api/pipelines           body: PipelineCreate → Pipeline
GET    /api/pipelines           → [Pipeline]
GET    /api/pipelines/{id}      → Pipeline
PUT    /api/pipelines/{id}      body: PipelineSave → Pipeline
DELETE /api/pipelines/{id}
GET    /api/pipelines/{id}/history
GET    /api/pipelines/{id}/versions/{version}
POST   /api/pipelines/{id}/preview      body: { param_values? }
POST   /api/pipelines/{id}/execute      body: { param_values? }
GET    /api/pipelines/{id}/runs         → [PipelineRun]
POST   /api/pipelines/{id}/duplicate   → Pipeline
GET    /api/pipelines/{id}/export      → JSON blob
POST   /api/pipelines/import           body: export JSON → Pipeline
POST   /api/pipelines/{id}/webhook/regenerate → { webhook_token }
GET    /api/pipelines/{id}/schedules
POST   /api/pipelines/{id}/schedules
```

### Schedules
```
GET    /api/schedules
PUT    /api/schedules/{id}
DELETE /api/schedules/{id}
POST   /api/schedules/{id}/run
```

### Run History
```
GET  /api/runs                  → [PipelineRun] (all pipelines)
```

### Webhooks
```
POST /api/webhooks/{token}/trigger?mode=async|sync   body: { param_values? }
GET  /api/webhooks/{token}/status/{job_id}
```

### Iceberg Catalogs
```
GET    /api/iceberg-catalogs
POST   /api/iceberg-catalogs
GET    /api/iceberg-catalogs/{id}
PUT    /api/iceberg-catalogs/{id}
DELETE /api/iceberg-catalogs/{id}
POST   /api/iceberg-catalogs/{id}/test
GET    /api/iceberg-catalogs/{id}/namespaces
GET    /api/iceberg-catalogs/{id}/namespaces/{ns}
GET    /api/iceberg-catalogs/{id}/table-schema
```

### Ad-hoc SQL
```
POST /api/sql/preview           body: { source_table, steps }
POST /api/sql/generate          body: { source_table, steps }
```

### Cross-Pipeline DAG
```
GET  /api/dag                               → { nodes, edges, cycles, execution_order }
PUT  /api/pipelines/{id}/dependencies       body: { dependencies: [pipeline_id, ...] }
```

### Pipeline Tests
```
POST /api/pipelines/{id}/run-tests          → { test_results, tests_passed, tests_failed }
```
Tests also run automatically after every successful execute. `blocked_by_tests: true` when a severity=error test fails.

Test types: `not_null`, `unique`, `row_count_between`, `accepted_values`, `relationships`, `custom_sql`
Optional fields: `filter` (WHERE clause to scope test), `store_failures` (CTAS failing rows to `_failures_{name}` table)

### Column Lineage
```
GET /api/pipelines/{id}/column-lineage      → { pipeline_id, source_columns, steps: [{ step_index, step_type, step_label, input_columns, output_columns, column_map }] }
```
Computed from pipeline configuration; does not require the pipeline to have been run.

### Custom SQL Templates
```
GET    /api/custom-transforms               → [{ id, name, sql, description }]
POST   /api/custom-transforms               body: { name, sql, description }
PUT    /api/custom-transforms/{id}
DELETE /api/custom-transforms/{id}
```

### Alerts
```
GET    /api/alerts                          → [Alert]
POST   /api/alerts                          body: AlertCreate → Alert
GET    /api/alerts/{id}                     → Alert
PUT    /api/alerts/{id}                     body: AlertUpdate
DELETE /api/alerts/{id}
GET    /api/alerts/{id}/history             → [AlertHistoryEntry]
POST   /api/alerts/{id}/run                 → { result, triggered, message }
```

---

## Environment Variables

```bash
# Dremio connection
DREMIO_HOST=localhost
DREMIO_PORT=9047
DREMIO_SSL=false
DREMIO_AUTH_TYPE=password      # or "pat"
DREMIO_USER=admin
DREMIO_PASS=password
DREMIO_PAT=                    # Personal Access Token (Dremio Cloud)
DREMIO_PROJECT_ID=             # Dremio Cloud project ID

# Storage
DB_PATH=./transforms.db        # SQLite path (desktop sets ~/.transform_studio/transforms.db)

# Authentication (opt-in)
AUTH_ENABLED=false             # Set to "true" to require login
JWT_SECRET=transform-studio-dev-secret-change-in-prod   # CHANGE IN PRODUCTION

# CORS (important for shared server deployments)
ALLOWED_ORIGINS=*              # Default: open (fine for local/desktop use)
                               # For server use, set to your domain(s), space-separated:
                               # ALLOWED_ORIGINS=https://transforms.mycompany.com

# Desktop mode (set by desktop_launcher.py)
TS_DESKTOP_MODE=1              # Enables Quit button + storage settings in UI
TS_DEFAULT_DB_PATH=            # Default DB path shown in storage settings
```

---

## Build Desktop Installers

### Linux (run on this machine)
```bash
# Install prerequisites (Linux Mint / Ubuntu / Debian)
sudo apt install python3 python3-pip nodejs npm dpkg

# Build
cd /path/to/dremio-transform-studio
chmod +x build/build_linux.sh
./build/build_linux.sh

# Output:
#   dist/TransformStudio-linux.tar.gz   (extract and run)
#   dist/TransformStudio-linux.deb      (sudo dpkg -i to install)
```

### Mac (run on Mac)
```bash
./build/build_mac.sh
# Output: dist/TransformStudio-mac.dmg
```

### Windows (run on Windows)
```bat
build\build_windows.bat
:: Output: dist\TransformStudio.exe
```

### Docker (rebuild with no cache)
```bash
./build/rebuild_docker.sh
# Builds with --no-cache, stops old container, recreates it
```

---

## Deployment Options

| Mode | Command | URL |
|------|---------|-----|
| Dev (local) | uvicorn + vite | http://localhost:5173 |
| Docker (single user) | `docker compose up` | http://localhost:8000 |
| Docker (server/team) | `deploy/setup_server.sh` | https://your-domain.com |
| Desktop app | Run the installer | http://localhost:8000 (auto-opens) |

---

## Important Implementation Notes

- **Python 3.9**: Uses `Optional[X]` not `X | None` — keep this in mind for new Pydantic models
- **Tailwind custom colors**: `navy-*`, `dblue-*`, `surface-*` defined in `tailwind.config.js`. Custom colors like `dblue-700` do NOT exist (only 50, 400, 500, 600). For colors outside those shades, use inline `style={{}}`.
- **Tailwind purging**: Dynamically constructed class names get purged. Use complete class names or inline styles for dynamic values.
- **Frontend API base URL**: Empty string in production (relative URLs) — Vite proxy handles dev
- **passlib / bcrypt**: Using `sha256_crypt` scheme, NOT `bcrypt`. bcrypt 4.x is incompatible with passlib 1.7.4. Requirements include `bcrypt==4.0.1` as a separate dep for other uses.
- **PyInstaller frozen bundles**: `desktop_launcher.py` adds `sys._MEIPASS` to `sys.path` and passes the FastAPI `app` object directly to uvicorn (NOT a string like `"main:app"` — string imports fail in frozen bundles).
- **Docker builds**: Use `npm install` (not `npm ci`) in Dockerfile so packages added after initial lockfile generation are picked up.
- **Docker stale cache**: Always use `./build/rebuild_docker.sh` for rebuilds. `docker restart` does NOT switch images. Must do `docker build --no-cache` + `docker stop/rm` + `docker compose up`.
- **CORS on shared servers**: Default `ALLOWED_ORIGINS=*` is fine for local/desktop. For server deployments with `AUTH_ENABLED=true`, always set `ALLOWED_ORIGINS` to your actual domain — `allow_credentials=True` + `*` is both a security hole and invalid per the CORS spec. The app sets `allow_credentials=False` automatically when origins is `*`.

---

## Current State (as of 2026-04-12)

All features working and tested against Dremio Cloud:

### Core Features
- ✅ 52 transforms across 7 categories
- ✅ Pipeline versioning with restore
- ✅ Cron scheduling with enable/disable
- ✅ Pipeline lineage view (visual DAG)
- ✅ Dremio Cloud support (PAT + project ID)
- ✅ Iceberg REST catalog support
- ✅ Connection settings UI with test
- ✅ Desktop installer (Mac .dmg built, Windows/Linux via build scripts)
- ✅ Docker production build (mshainman/transform-studio:latest)
- ✅ Rename + delete pipelines

### Features Added in v1.1
- ✅ Drag-and-drop step reordering (@dnd-kit)
- ✅ Data profiling with caching (profile_cache table, 1-hour TTL)
- ✅ Run history log (pipeline_runs table, per-pipeline + global view)
- ✅ Pipeline search (filters list when 5+ pipelines)
- ✅ User authentication (opt-in via AUTH_ENABLED, JWT, sha256_crypt)
- ✅ User management (admin UI to create/delete users)
- ✅ Parameterized pipelines ({{param}} substitution in step config)
- ✅ Webhook triggers (per-pipeline token, sync/async modes)
- ✅ Pipeline descriptions/notes
- ✅ Pipeline duplication
- ✅ Pipeline export/import (JSON)
- ✅ Email + Slack failure notifications
- ✅ Desktop Quit button (⏻, desktop mode only)
- ✅ Storage path setting in UI (desktop mode only)

### Features Added in v1.2 (dbt-style)
- ✅ Cross-pipeline DAG — `dependencies` field per pipeline, topological sort + cycle detection, full-screen SVG DAG view (GitBranch icon in top bar), click node to open pipeline
- ✅ Pipeline Tests — assertion system per pipeline (not_null, unique, row_count_between, accepted_values, custom_sql); severity: error (blocking) or warn (non-blocking); runs auto after execute; TestsPanel.tsx in right panel
- ✅ Incremental Models — new output_mode `incremental`; strategies: merge (MERGE INTO, Iceberg) and append (INSERT WHERE ts > max(ts)); first-run CTAS fallback
- ✅ Custom SQL Transform — 52nd transform; full-screen editor with `{input}` placeholder; template library (save/search/load snippets)
- ✅ Alerts System — 3 alert types (custom SQL, pipeline health, data quality); cron schedule per alert; email/Slack notifications; run-now button; full history log per alert

### Features Added in v1.3
- ✅ Environments — multiple named Dremio connection profiles; switcher in toolbar; ACTIVE badge; all executes use active environment
- ✅ Run with Dependencies — GitMerge icon in toolbar; runs full upstream chain in topological order; live status per pipeline; skips on upstream failure
- ✅ Seed Table from CSV — drag-and-drop CSV upload; auto-inferred types; 5,000 row limit; creates/replaces Dremio table
- ✅ Iceberg Metadata Push — auto-stamps ts.* properties after execute; SQL method + REST catalog fallback; silent skip for non-Iceberg tables
- ✅ Export Documentation — single HTML file for all pipelines; no external deps; pipeline cards with steps, params, schedule, tests
- ✅ MCP Server — built-in SSE at /mcp/sse; 22 tools; standalone stdio mcp_server.py fallback; JWT auth support

### Features Added in v1.4 (dbt gap closure + lineage)
- ✅ Microbatch incremental strategy — 3rd strategy (append/merge/microbatch); configurable window (1hr/6hr/1day/1week); processes batch loop per execute; first run = CTAS; reports N microbatches in result
- ✅ Exposures — per-pipeline downstream BI metadata (name, URL, tool_type, description); Expose tab in right panel; indigo cards in LineageView below output node; exposed_json stored in SQLite
- ✅ Column-level lineage — config-introspection for all 52 transforms; `_column_map_for_step()` + `compute_column_lineage()` in codegen.py; GET /api/pipelines/{id}/column-lineage; collapsible per-step UI in LineageView showing output←source per changed column
- ✅ Test Store Failures — `store_failures: bool` per test; CTAS via `run_ddl()` (not `run_query()`); uses DROP + CREATE pattern (Dremio doesn't support CREATE OR REPLACE TABLE); clickable orange badge in TestsPanel copies table name
- ✅ Relationships test — 6th test type; checks referential integrity (column A values must exist in reference_table.reference_column); failure_sql returns orphaned rows
- ✅ Test where filter — `filter: Optional[str]` on PipelineTest; appended as AND condition to all test WHERE clauses
- ✅ Pre/Post hook SQL — `pre_hook_sql` / `post_hook_sql` on Pipeline; pre-hook failure aborts execute; post-hook failure surfaces as warning but doesn't mark run as failed
- ✅ Source Freshness alerts — 4th alert type; checks MAX(timestamp_column) age against threshold; `evaluate_source_freshness_alert()` in alert_runner.py
- ✅ Step bisection on failure — `_bisect_pipeline_failure()` in main.py; binary-searches steps to identify which step caused execute failure; reports "Failed at step N: [label]" in error message

### Bug Fixes & SQL Compatibility (2026-04-11)
- ✅ Execute auto-saves pipeline first (backend reads from DB, not local state)
- ✅ Execute passes output_table/output_mode in request body (no pre-save needed)
- ✅ SQL tab auto-generates SQL when clicked (not just via View SQL button)
- ✅ Axios error interceptor extracts backend `detail` message (not generic "400" text)
- ✅ CTAS row count: queries COUNT(*) after create since Dremio doesn't report outputRecords for DDL
- ✅ Execute success message is mode-aware (CTAS/Insert/View wording differs)
- ✅ Remove Duplicates: fixed `ORDER BY (SELECT 0)` → uses partition cols (Dremio rejects scalar subqueries in window ORDER BY)
- ✅ Eliminated all 20+ `SELECT * EXCEPT` usages across 6 transform files (Dremio/Calcite does not support this syntax)
- ✅ JSON_VALUE in Flatten JSON: added `lax` mode (`'$.field'` → `'lax $.field'`) for Dremio compatibility
- ✅ Sample Rows: removed `RAND(seed)` → `RAND()` (Dremio does not support seeded RAND)

### Dremio SQL Compatibility Notes
- `SELECT * EXCEPT (col)` — NOT supported. All transforms use explicit column lists via `replace_select()` / `drop_select()` helpers in `transforms/utils.py`
- `ORDER BY (SELECT 0)` in window functions — NOT supported. Use actual column references
- `JSON_VALUE(col, '$.path')` — requires `lax` mode: `JSON_VALUE(col, 'lax $.path')`
- `RAND(seed)` — NOT supported. Use `RAND()` only
- `REGEXP_LIKE`, `REGEXP_REPLACE`, `REGEXP_EXTRACT` — ✅ supported in Dremio
- `TO_DATE`, `TO_TIMESTAMP`, `DATE_TRUNC`, `DATEDIFF` — ✅ supported in Dremio
- `LPAD`, `RPAD`, `SPLIT_PART`, `MD5`, `SHA1`, `SHA256` — ✅ supported in Dremio
- `INITCAP` — ✅ supported in Dremio (title case)
- All window functions (`ROW_NUMBER`, `LAG`, `LEAD`, `SUM OVER`, frame specs) — ✅ supported
