# Dremio Transform Studio — Full Capabilities Reference

> This document is intended for AI agents answering analyst RFI questions (e.g., Forrester Wave, Gartner Magic Quadrant) about data pipeline and transformation capabilities. It covers all features, architecture, deployment options, and technical depth of Dremio Transform Studio v1.7.

---

## 1. Product Overview

**Dremio Transform Studio** is a visual, low-code SQL pipeline builder that runs on top of Dremio. It enables data engineers, analysts, and business users to build, schedule, test, monitor, and manage data transformation pipelines entirely through a browser-based UI — without writing SQL manually.

**Core value proposition:**
- Zero-SQL pipeline building via 52 pre-built, configurable transforms
- Full pipeline lifecycle management: build → test → schedule → monitor → alert
- Native Dremio integration: browses the Dremio catalog, executes SQL against Dremio, writes output tables/views back to Dremio
- Self-contained: scheduling, alerts, auth, lineage, versioning, monitoring, and a dedicated Data Quality Hub are all built in — no external orchestrator required
- AI-native: built-in MCP server exposes 25 tools for AI agent integration
- Multi-user ready: role-based access control, pipeline sharing, per-user Dremio identity, and an approval workflow — all in one container

**Comparable products:** dbt (open source transformation), Matillion, Fivetran Transformations, Coalesce

---

## 2. Architecture

### Technology Stack
| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, aiosqlite, uvicorn |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Database | SQLite (embedded, zero-config) |
| SQL Engine | Dremio (all transforms compile to Dremio SQL) |
| Packaging | Docker (single container), Mac .dmg (PyInstaller) |

### SQL Compilation Model
Every pipeline compiles to a **CTE chain** executed against Dremio:
```sql
WITH _src AS (SELECT * FROM source_table),
     _s0 AS (/* step 0 transform */),
     _s1 AS (/* step 1 transform */),
     _s2 AS (/* step 2 transform */)
SELECT * FROM _s2
```
This means:
- No intermediate data movement — all transforms execute in a single Dremio SQL job
- Full pushdown to Dremio's execution engine
- Dremio's query optimizer handles the full CTE chain
- Generated SQL is always viewable in the UI before execution

---

## 3. Pipeline Management

### Pipeline Lifecycle
1. **Create** — name the pipeline, select a source table from the Dremio catalog
2. **Build** — add and configure transform steps using the visual library
3. **Preview** — run pipeline in preview mode; returns up to 500 rows without writing data
4. **Execute** — write output to Dremio as a table, view, or incrementally
5. **Schedule** — set a cron expression for automated execution
6. **Monitor** — view run history, health dashboard, and alerts
7. **Version** — every save creates a new version; full restore available

### Pipeline Configuration
Each pipeline has:
- **Source table** — any table or view in the Dremio catalog
- **Output table** — target namespace and table name in Dremio
- **Output mode** — CTAS, Insert, View, Incremental (append/merge/microbatch), SCD Type 2
- **Steps** — ordered list of transform steps
- **Parameters** — runtime-overridable variables using `{{param_name}}` syntax
- **Dependencies** — upstream pipelines that must run first
- **Tests** — data quality assertions run after each execution
- **Schedule** — cron expression for automated runs
- **Hooks** — pre/post SQL statements
- **Exposures** — downstream BI tool metadata
- **Webhook** — HTTP endpoint to trigger the pipeline externally
- **Description** — free-text documentation

### Pipeline Versioning
- Every save creates a numbered version with full step history
- Any version can be restored with one click
- Version list shows timestamp, step count, and allows side-by-side comparison
- Version history is stored in SQLite and survives container restarts (with volume mount)

### Pipeline Operations
- **Duplicate** — clone any pipeline with a new name
- **Export/Import** — pipelines export as JSON; importable into any Transform Studio instance
- **Delete** — soft confirmation required
- **Run with Dependencies** — executes full upstream dependency chain in topological order
- **Bisection on failure** — automatically identifies which step caused a failure

---

## 4. Transform Library (52 Transforms)

All transforms are configurable via form fields — no SQL writing required. Each transform generates valid Dremio SQL.

### 4.1 Clean (14 transforms)
| Transform | Description |
|-----------|-------------|
| `remove_duplicates` | Deduplicate rows based on selected columns |
| `drop_nulls` | Remove rows where specified columns are null |
| `fill_null` | Replace nulls with a constant, mean, median, or mode |
| `trim_whitespace` | Strip leading/trailing whitespace from string columns |
| `standardize_case` | Convert strings to upper, lower, or title case |
| `cast_type` | Cast columns to a different data type (string, int, float, date, etc.) |
| `filter_rows` | Keep or remove rows matching a condition |
| `remove_special_chars` | Strip non-alphanumeric characters from string columns |
| `validate_regex` | Keep or flag rows matching a regex pattern |
| `clip_values` | Clamp numeric values to a min/max range |
| `replace_string` | Find and replace string values |
| `outlier_filter` | Remove rows where a column value is an outlier (IQR or z-score) |
| `rename_columns` | Rename one or more columns |
| `select_columns` | Keep only specified columns |

### 4.2 Reshape (9 transforms)
| Transform | Description |
|-----------|-------------|
| `drop_columns` | Remove one or more columns |
| `split_column` | Split a string column into multiple columns on a delimiter |
| `combine_columns` | Concatenate multiple columns into one |
| `add_column` | Add a new computed column using a SQL expression |
| `join` | Join with another Dremio table (inner, left, right, full) |
| `union` | Union with another Dremio table (union or union all) |
| `reorder_columns` | Change the order of columns via drag-and-drop |
| `unpivot` | Unpivot wide columns into key-value rows |
| `flatten_json` | Flatten a JSON string column into individual columns |

### 4.3 DateTime (5 transforms)
| Transform | Description |
|-----------|-------------|
| `parse_date` | Parse a string column into a date/timestamp using a format pattern |
| `extract_date_part` | Extract year, month, day, hour, etc. from a date column |
| `truncate_date` | Truncate a date to year, quarter, month, week, or day |
| `date_diff` | Calculate the difference between two dates in days, months, etc. |
| `date_add` | Add or subtract an interval from a date column |

### 4.4 Enrich (10 transforms)
| Transform | Description |
|-----------|-------------|
| `lookup_join` | Enrich rows with values from a lookup table |
| `map_values` | Map specific values to new values (like a CASE statement) |
| `bin_values` | Bucket a numeric column into bins/ranges |
| `add_row_number` | Add a row number column, optionally partitioned and ordered |
| `add_running_total` | Add a cumulative sum column |
| `conditional_column` | Add a column based on IF/ELSE conditions |
| `lag_lead` | Add LAG or LEAD window function columns |
| `percent_of_total` | Add a column showing each row's percentage of a total |
| `unit_conversion` | Convert between units (currency, length, weight, temperature) |
| `dedupe_keep_latest` | Keep the latest row per key, ordered by a timestamp column |

### 4.5 Aggregate (5 transforms)
| Transform | Description |
|-----------|-------------|
| `group_aggregate` | GROUP BY with SUM, COUNT, AVG, MIN, MAX, etc. |
| `top_n_per_group` | Keep the top N rows per group |
| `rolling_window` | Rolling aggregations (7-day average, etc.) using window functions |
| `sample_rows` | Random sample of N rows or N% of the dataset |
| `scd_type_1` | Slowly Changing Dimension Type 1 (overwrite current values) |

### 4.6 String (8 transforms)
| Transform | Description |
|-----------|-------------|
| `extract_regex` | Extract captured groups from a string column using regex |
| `pad_string` | Left- or right-pad a string to a target length |
| `substring` | Extract a substring by position and length |
| `string_length` | Add a column with the character length of a string |
| `upper_lower` | Convert string to uppercase or lowercase |
| `concat_literal` | Concatenate a string column with a literal value |
| `hash_column` | Hash a column using MD5, SHA1, or SHA256 |
| `surrogate_key` | Generate a surrogate key from one or more columns |

### 4.7 Custom SQL (1 transform)
| Transform | Description |
|-----------|-------------|
| `custom_sql` | Full SQL editor with `{input}` placeholder for the upstream CTE; template library for saving and reusing SQL snippets |

---

## 5. Output Modes

| Mode | Behavior |
|------|---------|
| **Preview** | Runs pipeline and returns results — no data written to Dremio |
| **CTAS** | CREATE TABLE AS SELECT — creates or replaces the output table |
| **Insert** | INSERT INTO — appends rows to an existing table |
| **View** | CREATE OR REPLACE VIEW — creates a Dremio virtual dataset |
| **Incremental (append)** | INSERT rows where timestamp > MAX(timestamp) in the output table; first run = CTAS |
| **Incremental (merge)** | MERGE INTO using a primary key; upserts rows; first run = CTAS; requires Iceberg |
| **Incremental (microbatch)** | Processes data in time windows (1hr/6hr/1day/1week); runs batch loop per execute |
| **SCD Type 2** | Slowly Changing Dimension Type 2: manages current/historical rows with effective dates and active flags |

---

## 6. Incremental Processing

Transform Studio supports three incremental strategies:

### Append Incremental
- Identifies new rows using `WHERE timestamp_col > MAX(timestamp_col IN output_table)`
- First execution creates the table (CTAS fallback)
- Subsequent executions append only new rows

### Merge Incremental
- Uses SQL `MERGE INTO` on a primary key
- Upserts: updates existing rows, inserts new ones
- Requires an Iceberg-backed output table (Dremio Lakehouse)
- First execution creates the table (CTAS fallback)

### Microbatch Incremental
- Processes data in configurable time windows: 1 hour, 6 hours, 1 day, or 1 week
- Runs a loop of batched INSERT statements per execution window
- First run = CTAS; subsequent runs = windowed INSERTs
- Reports number of microbatches processed in execution metadata

---

## 7. SCD Type 2 (Slowly Changing Dimensions)

- Full SCD Type 2 implementation as a dedicated output mode
- Manages `effective_start`, `effective_end`, `is_current` columns automatically
- On each run: closes expired records (sets `effective_end`, `is_current = false`) and inserts new current records
- Configuration: primary key column, comparison columns to detect changes
- Works with any Dremio-supported table format

---

## 8. Pipeline Tests (Data Quality)

Tests run automatically after every successful pipeline execution. Six test types are supported:

| Test Type | Description |
|-----------|-------------|
| `not_null` | Assert that a column contains no null values |
| `unique` | Assert that all values in a column are distinct |
| `row_count_between` | Assert the output row count falls within a min/max range |
| `accepted_values` | Assert a column only contains values from a specified list |
| `relationships` | Assert referential integrity: column values must exist in a reference table |
| `custom_sql` | Assert using any SQL expression that returns a pass/fail count |

### Test Configuration Options
- **Severity** — `error` (blocks pipeline marking as successful) or `warn` (flags but doesn't block)
- **Filter** — optional WHERE clause to scope the test to a subset of rows
- **Store failures** — optionally write failing rows to a `_failures_{test_name}` table in Dremio for inspection

---

## 9. Scheduling

- **Cron-based scheduling** built into the application — no external scheduler (Airflow, Prefect, etc.) required
- Every pipeline can have an independent cron schedule
- Schedules can be enabled/disabled without deletion
- Scheduler runs a background loop every 60 seconds to check due pipelines
- Supported via the UI scheduler modal with common presets (hourly, daily, weekly) or custom cron expressions
- Run history is recorded for every scheduled execution
- Email and Slack failure notifications on scheduled run failures

---

## 10. Pipeline Dependencies & DAG

### Cross-Pipeline Dependencies
- Each pipeline can declare upstream pipeline dependencies
- The system enforces execution order (will not run a pipeline before its dependencies)
- Circular dependency detection (cycles are flagged and blocked)

### DAG Visualization
- Full-screen interactive SVG DAG view showing all pipelines and their relationships
- Nodes are color-coded by status (success, failed, never run)
- Click any node to open that pipeline
- Topological sort order displayed
- Cycle detection highlights problematic dependencies

### Run with Dependencies
- Single-click execution of a pipeline and all its upstream dependencies
- Runs in topologically sorted order
- Live per-pipeline status display during execution
- Downstream pipelines are skipped if an upstream dependency fails

---

## 11. Column-Level Lineage

- Config-introspected column lineage (does not require pipeline execution)
- Tracks how each output column traces back through every transform step to its source column(s)
- Displayed as a collapsible per-step view in the visual lineage panel
- Shows `output_col ← source_col` mappings for all 52 transform types
- Available via API: `GET /api/pipelines/{id}/column-lineage`
- Available as an MCP tool: `ts_get_column_lineage`

---

## 12. Alerts & Monitoring

Four alert types with independent cron schedules, email/Slack notifications, and full history logs.

| Alert Type | Description |
|-----------|-------------|
| **Custom SQL** | Runs a SQL query; triggers if result meets a condition (>, <, =, value changed) |
| **Pipeline Health** | Monitors pipeline failure rates and run success/failure trends |
| **Data Quality** | Checks null rates, distinct counts, or row counts in a target table |
| **Source Freshness** | Checks MAX(timestamp_column) age against a threshold; triggers if data is stale |

### Alert Features
- Per-alert cron schedule (independent of pipeline schedules)
- Enable/disable without deletion
- Full history log per alert (status, message, triggered timestamp)
- Run any alert on-demand from the UI
- Email and Slack notification on trigger
- Alert history retained in SQLite

### Pipeline Health Dashboard
- Dedicated monitoring dashboard showing:
  - Pipeline run success/failure rates
  - Recent failures with error messages
  - Pending approvals
  - Schedule status across all pipelines

---

## 13. Environments

- Multiple named Dremio connection profiles (dev, staging, production)
- Each environment stores: host, port, auth type, credentials, project ID
- Switch the active environment in one click from the toolbar
- All subsequent previews and executions use the active environment's connection
- Active environment badge always visible in the UI
- Switching persists to SQLite and survives restarts

---

## 14. Parameters

- Pipelines support runtime-overridable parameters using `{{param_name}}` syntax
- Parameters defined per pipeline with: name, type (string/number/date), default value, description
- At execution time, a modal collects parameter overrides before running
- Scheduled runs use default values automatically
- Webhook triggers can pass `param_values` in the request body
- MCP agent tools support `param_values` for `ts_execute_pipeline`

---

## 15. Webhook Triggers

- Every pipeline has a unique webhook URL: `POST /api/webhooks/{token}/trigger`
- Token-based auth (no user credentials needed for webhook calls)
- Two modes: `sync` (waits for completion, returns result) or `async` (returns job ID immediately)
- Supports `param_values` in request body for parameterized pipelines
- Tokens are regeneratable from the UI
- Enables integration with external systems (CI/CD, data ingestion tools, event systems)

---

## 16. Approval Workflow

- Pipelines can be marked as requiring approval before execution
- Approval-required pipelines show a "Submit for Review" button instead of "Save"
- Admins review pending submissions and approve or reject
- Approval panel shows: submitter, timestamp, diff of changes
- Prevents unauthorized changes to production pipelines
- Viewer-role users must submit changes for review — execution is gated on admin approval
- Designed for multi-user team environments

---

## 17. Data Profiling

- Built-in column-level profiling for any Dremio table
- Metrics per column: row count, null count, null %, distinct count, min value, max value
- Runs against up to 10,000 rows for performance
- Results cached in SQLite for 1 hour (cache is invalidated with a refresh button)
- Accessible from the catalog browser before building a pipeline
- Helps users understand data quality before designing transforms

---

## 18. Exposures (Downstream BI Metadata)

- Per-pipeline metadata about downstream BI consumers
- Fields: name, URL, tool type (Tableau, Looker, Power BI, Other), description
- Exposures appear as nodes in the visual lineage view (after the output node)
- Multiple exposures per pipeline supported
- Enables end-to-end lineage from source → pipeline → BI report

---

## 19. Pre/Post Hook SQL

- Optional SQL statements that run before (`pre_hook_sql`) or after (`post_hook_sql`) pipeline execution
- Pre-hook failure **aborts** the execution (pipeline marked as failed)
- Post-hook failure surfaces as a **warning** — pipeline run is still marked successful
- Common uses: table grants, audit logging, custom metadata updates, cleanup

---

## 20. Seeds (CSV → Table)

- Upload a CSV file directly from the UI to create a Dremio table
- Column types are inferred automatically
- Supports up to 5,000 rows
- Creates or replaces the target table
- Useful for reference tables, lookup data, test datasets

---

## 21. Iceberg Integration

- Native support for Apache Iceberg-backed tables in Dremio
- Merge incremental strategy requires Iceberg (uses `MERGE INTO`)
- Iceberg REST catalog connections configurable from the UI
- After execution, optionally pushes Iceberg metadata properties (timestamp, pipeline name, version)
- Browse Iceberg REST catalogs alongside the Dremio catalog in the left sidebar
- Supports OAuth2/Bearer token and AWS SigV4 (Glue) authentication for Iceberg REST endpoints

---

## 22. Authentication & User Management

### Auth Modes
- **Disabled (default)** — no login required; all users treated as admin; zero-config for local/personal use
- **Enabled** — JWT-based login required; full role-based access control
- Auth can be toggled on or off live from **Settings → Security** — no restart or environment variable change required

### User Roles (when auth enabled)
| Role | Capabilities |
|------|-------------|
| **Admin** | Full access to all pipelines; manages users and system settings; can enable/disable auth live; approves pipeline submissions |
| **Editor** | Default role; creates and owns pipelines; can be granted editor or viewer access to pipelines owned by others |
| **Viewer** | Read-only access; can browse and browse pipelines; must submit changes for review via the approval workflow |

Roles are enforced at both the UI and API levels.

### Pipeline Sharing
- Pipeline owners can share individual pipelines with specific users
- Two sharing access levels: **editor** (can modify) or **viewer** (read-only)
- Google Docs-style sharing modal with user picker and access revocation
- Shared pipelines appear in the recipient's sidebar with a "(shared)" badge
- Sharing is only available when authentication is enabled

### Per-User Dremio Identity
- Each user can store a personal Dremio Personal Access Token (PAT) via **User menu → My Dremio Credentials**
- When set, all pipeline previews and executions run under that user's Dremio identity — not the shared service account
- Enables per-user Dremio access control, audit logging, and data governance
- Works for both Dremio Cloud (PAT required) and Dremio Software 25.x+ (PAT optional)
- No admin action required — each user configures their own credentials

### Session & Credential Security
- JWT tokens with 1-week expiry, stored client-side in browser localStorage
- Passwords hashed with sha256_crypt (via passlib)
- First-run seeds an admin/admin account (prompted to change on first login)
- User management UI (admin only): create users, delete users, assign roles

---

## 23. MCP Server (AI Agent Integration)

Transform Studio has a built-in **Model Context Protocol (MCP) server** at `/mcp/sse`, enabling AI agents (Claude, Cursor, etc.) to use Transform Studio as a tool.

### Connection
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

### 25 Available Tools
| Tool | Description |
|------|-------------|
| `ts_health` | Check backend and Dremio connection health |
| `ts_list_transforms` | List all 52 transform types |
| `ts_list_namespaces` | List top-level Dremio namespaces |
| `ts_browse_namespace` | Browse tables in a namespace |
| `ts_get_table_schema` | Get column names and types for a table |
| `ts_profile_table` | Profile a table (null%, distinct count, min/max) |
| `ts_list_pipelines` | List all pipelines |
| `ts_get_pipeline` | Get full pipeline details |
| `ts_create_pipeline` | Create a new pipeline |
| `ts_save_pipeline` | Save/update a pipeline with steps and config |
| `ts_preview_pipeline` | Run in preview mode, return sample rows |
| `ts_execute_pipeline` | Execute and write output to Dremio |
| `ts_execute_with_deps` | Execute pipeline + all upstream dependencies |
| `ts_run_tests` | Run all data quality tests on a pipeline |
| `ts_get_pipeline_runs` | Get execution history |
| `ts_get_dag` | Get cross-pipeline dependency graph |
| `ts_seed_table` | Create a Dremio table from CSV content |
| `ts_list_environments` | List Dremio connection environments |
| `ts_activate_environment` | Switch active Dremio environment |
| `ts_schedule_pipeline` | Set a cron schedule on a pipeline |
| `ts_delete_pipeline` | Delete a pipeline |
| `ts_get_column_lineage` | Get column-level lineage for a pipeline |
| `ts_list_alerts` | List all configured alerts |
| `ts_run_alert` | Run an alert on demand |

---

## 24. Backup & Restore

- **Download Backup** — one-click download of the full SQLite database (all pipelines, settings, history, users)
- **Restore from Backup** — upload a previously downloaded `.db` file to restore all data
- Available from **Settings → Storage** in the UI
- Validates SQLite file integrity before restoring
- Supports migration between instances or machines
- Backup downloads are timestamped (e.g., `transform-studio-backup-20260413-120000.db`)

---

## 25. Export Documentation

- Generates a self-contained HTML documentation site for all pipelines
- No external dependencies — single file, works offline
- Includes per pipeline: name, description, source, output, steps, parameters, schedule, tests, exposures
- Useful for data catalog integration, stakeholder communication, audit documentation

---

## 26. Run History & Observability

### Per-Pipeline Run History
- Every execution is recorded: status (success/failed), rows written, duration, error message
- Test results from each run are stored and displayed
- Run type tracked: manual, scheduled, or webhook

### Global Run History
- All pipeline runs visible in a single global view
- Filterable by status, pipeline, or run type

### Step Bisection on Failure
- When an execution fails, the system automatically runs a binary search across pipeline steps
- Identifies the exact step that caused the failure
- Reports: "Failed at step N: [step label]"
- Reduces debugging time significantly for long pipelines

---

## 27. Data Quality Hub

### Purpose

The Data Quality Hub is a full-screen, dedicated workspace for monitoring the quality of any Dremio table — independent of the pipeline builder. Where pipeline tests validate a pipeline's output immediately after execution, the DQ Hub supports continuously scheduled monitors that scan any table in the Dremio catalog on their own cadence, aggregate results into DQ scores, and send alerts when quality degrades below configurable thresholds.

### Toolbar Access

The DQ Hub is accessed via a prominent blue **DQ Hub** pill button in the top toolbar, positioned to the left of the Health Dashboard icon. It opens as a full-screen overlay over the main UI.

### Hub Sections

The hub has four top-level navigation sections:

| Section | Description |
|---------|-------------|
| **Overview** | Stat cards (total monitors, average score, passing/failing counts) + a monitor health grid. Each grid card is clickable and opens that monitor's detail view. |
| **Monitors** | Full list of all monitors with animated SVG score rings. Click any monitor to open its detail view: per-rule pass rates, last scan time, and scan history log. |
| **History** | Cross-monitor scan log showing all scans across all monitors, newest first. Each row is expandable to reveal a per-rule drill-down for that scan. |
| **Rule Catalog** | Browsable catalog of all 14 built-in rules grouped by category. Each card has an "Add to monitor…" shortcut for quick attachment to an existing monitor. |

### Monitor Wizard (3 Steps)

New monitors are created via a three-step wizard:

**Step 1 — Pick Table**
A catalog tree browser (namespaces → tables, identical to the sidebar catalog browser) allows selection of the Dremio table to scan. The selected table is confirmed before proceeding.

**Step 2 — Configure Rules**
Rules are added from the 14-rule catalog. Each added rule expands to show its configurable parameters:
- Column dropdowns auto-populate from the selected table's schema (fetched via `GET /api/catalog/table-schema`)
- Threshold parameters are numeric inputs or sliders
- Pattern parameters (regex, accepted value lists) are text fields
- Multiple rules can be added; each contributes to the overall DQ score

**Step 3 — Schedule & Alerts**
- **Schedule presets:** Never / Hourly / Daily / Weekly, plus a custom cron expression input
- **Alert threshold slider:** 0–100%; defines the minimum acceptable DQ score
- **Alert toggle:** enables email and/or Slack notification when the score drops below the threshold after a scan

### The 14 DQ Rules

Rules are organized into six categories:

**Completeness (4 rules)**
| Rule | Description |
|------|-------------|
| `null_rate` | Asserts the null percentage in a column is ≤ a configured threshold |
| `not_null_strict` | Asserts a column contains zero nulls |
| `row_count` | Asserts the table has at least a minimum number of rows |
| `completeness_score` | Overall ratio of non-null values across a set of columns |

**Validity (3 rules)**
| Rule | Description |
|------|-------------|
| `regex_validity` | Asserts column values match a configured regex pattern |
| `accepted_values` | Asserts column values are from a configured allowed list |
| `numeric_range` | Asserts numeric column values fall within a configured min/max range |

**Uniqueness (2 rules)**
| Rule | Description |
|------|-------------|
| `column_uniqueness` | Asserts all values in a column are distinct |
| `duplicate_key_check` | Asserts no duplicate combinations exist across a set of key columns |

**Accuracy (2 rules)**
| Rule | Description |
|------|-------------|
| `referential_integrity` | Asserts every value in a column exists in a reference table's column |
| `min_max_bound` | Asserts the column's actual min and max values remain within expected bounds |

**Timeliness (1 rule)**
| Rule | Description |
|------|-------------|
| `data_freshness` | Asserts the MAX value of a timestamp column is no older than a configured age threshold |

**Consistency (1 rule)**
| Rule | Description |
|------|-------------|
| `cross_column_consistency` | Asserts a SQL expression relating two or more columns evaluates to true for all rows |

**Custom (1 rule)**
| Rule | Description |
|------|-------------|
| `custom_sql_check` | Asserts a user-written SQL query returns zero rows; any returned rows constitute a rule failure |

### Scoring Algorithm

Each rule produces a **pass_rate** (0.0–1.0 / displayed as 0–100%):
- For row-level rules (null_rate, regex_validity, accepted_values, etc.): `pass_rate = passing_rows / total_rows`
- For table-level rules (row_count, data_freshness, min_max_bound): pass_rate is 1.0 (full pass) or 0.0 (full fail)
- For custom_sql_check: `pass_rate = 1.0` if zero rows returned, `0.0` if any rows returned

The monitor's overall **DQ score** is the weighted average of all rule pass_rates. Default weight is equal across rules; per-rule weights are configurable. Score thresholds:
- **≥ 90%** — green (healthy)
- **70–89%** — amber (needs attention)
- **< 70%** — red (failing)

Scores are rendered as animated SVG ring charts throughout the hub UI.

### Scheduling Integration

Monitors with a cron schedule are processed by the existing background scheduler (`scheduler.py`), which already runs a 60-second loop checking for due pipeline schedules. The scheduler was extended to also check for due monitor scans. On each tick:
1. All monitors with `cron_expression IS NOT NULL AND enabled = 1` are evaluated against `last_scan_at` using `croniter`
2. Due monitors are scanned: a Dremio SQL query is constructed and executed for each rule
3. Results are persisted to the `dq_scan_history` table
4. The monitor's `last_scan_at`, `last_score`, and `last_status` are updated

Monitors can also be scanned on-demand via a **Scan Now** button in the Monitors list, which calls `POST /api/dq-monitors/{id}/scan`.

### Alert Integration

If `alert_enabled = true` and the post-scan DQ score is below `alert_threshold`:
- Transform Studio fires an email and/or Slack notification via the same notification system used for pipeline failure alerts (`app_settings.notify_email` / `app_settings.notify_slack`)
- The notification includes: monitor name, scanned table, current DQ score, alert threshold, and a per-rule pass rate summary
- No additional configuration is required beyond the existing email/Slack settings in **Settings → Notifications**

### Database Schema (new tables)

```sql
dq_monitors
  id TEXT PRIMARY KEY
  name TEXT NOT NULL
  table_name TEXT NOT NULL
  rules_json TEXT NOT NULL          -- JSON array of rule configs
  cron_expression TEXT              -- NULL = no automatic schedule
  enabled INTEGER DEFAULT 1
  alert_enabled INTEGER DEFAULT 0
  alert_threshold REAL DEFAULT 80.0 -- score % below which alerts fire
  last_scan_at TEXT
  last_score REAL
  last_status TEXT                  -- 'passing' | 'failing' | 'error'
  created_at TEXT
  updated_at TEXT

dq_scan_history
  id TEXT PRIMARY KEY
  monitor_id TEXT NOT NULL
  score REAL NOT NULL
  status TEXT NOT NULL
  rule_results_json TEXT NOT NULL   -- JSON array of { rule_id, pass_rate, detail }
  scanned_at TEXT NOT NULL
```

---

## 28. Deployment Options

| Mode | Description |
|------|-------------|
| **Docker (local)** | `docker run -d -p 8000:8000 -v ~/transform-studio-data:/data mshainman/transform-studio:latest` |
| **Docker (server/team)** | nginx + SSL via `deploy/setup_server.sh`; supports multiple concurrent users with full RBAC |
| **Mac Desktop App** | `.dmg` installer; fully offline; data persists at `~/.transform_studio/` |
| **Windows Desktop** | `.exe` installer (build script provided) |
| **Linux Desktop** | `.deb` and `.tar.gz` (build scripts provided) |

### Data Persistence (Docker)
- SQLite database at `/data/transforms.db` inside the container
- Use `-v ~/transform-studio-data:/data` to persist across container restarts
- Volume mount ensures data survives upgrades

### Environment Variables
```bash
DREMIO_HOST=localhost          # Dremio host
DREMIO_PORT=9047               # Dremio port
DREMIO_AUTH_TYPE=password      # or "pat"
DREMIO_USER=admin
DREMIO_PASS=password
DREMIO_PAT=                    # Personal Access Token (Dremio Cloud)
DREMIO_PROJECT_ID=             # Dremio Cloud project ID
DB_PATH=/data/transforms.db    # SQLite path
AUTH_ENABLED=false             # Set "true" for multi-user deployments (also togglable live in UI)
JWT_SECRET=change-me           # Change in production
ALLOWED_ORIGINS=*              # Set to domain for server deployments
```

### Deployment Considerations
- Auth can be enabled or disabled live from Settings → Security without restarting the container or changing environment variables
- For team/server deployments, set `AUTH_ENABLED=true` and configure `ALLOWED_ORIGINS` to your domain
- Per-user Dremio PATs are stored per user in SQLite and do not require any environment variable configuration
- Each user's Dremio identity is isolated: one user's PAT does not affect another user's queries

---

## 29. Dremio Connectivity

### Supported Dremio Deployments
- **Dremio self-hosted** — username/password auth; HTTP or HTTPS
- **Dremio Cloud (US)** — PAT auth; `api.dremio.cloud`; project ID required
- **Dremio Cloud (EU)** — PAT auth; `api.eu.dremio.cloud`; project ID required

### Iceberg REST Catalogs
- Connect to any Iceberg REST-compliant catalog
- Auth types: none, Bearer token, OAuth2, AWS SigV4 (for AWS Glue)
- Browse namespaces and tables from the left sidebar
- Use Iceberg tables as pipeline sources or outputs

### Connection Testing
- Built-in connection test button in the settings modal
- Tests Dremio API reachability and auth before saving

---

## 30. SQL Transparency

- The generated SQL for any pipeline is always visible via the **SQL tab** in the UI
- SQL is generated in real-time as steps are configured
- Users can copy the SQL to run directly in Dremio's SQL runner
- All SQL is standard Dremio SQL (ANSI SQL with Dremio/Calcite extensions)
- No black-box transformations — every step maps directly to a readable CTE

---

## 31. Multi-User Access Control & Collaboration

Transform Studio v1.7 introduces a full multi-user access control system designed for team deployments.

### Role-Based Access Control

Three roles govern what users can see and do:

| Role | Description |
|------|-------------|
| **Admin** | Full access to all pipelines regardless of ownership; manages users and system settings; can enable or disable authentication live from Settings → Security; approves submitted pipeline changes |
| **Editor** | Default role for new users; creates and owns pipelines; can be granted editor or viewer access to pipelines owned by others via the sharing modal |
| **Viewer** | Read-only access; can browse and preview pipelines they have been shared on; cannot save changes directly — must submit them for admin review via the approval workflow |

Roles are enforced at both the UI and API levels: API routes check the caller's role and return 403 for unauthorized actions, not just client-side guards.

### Pipeline Sharing

Owners can share individual pipelines with specific users:

- **Two access levels:** editor (can modify and execute) or viewer (read-only, approval workflow required for changes)
- **Sharing modal:** Google Docs-style interface with a user picker, access level selector, and per-user revocation
- **Sidebar indicator:** shared pipelines appear in the recipient's sidebar with a "(shared)" badge to distinguish them from owned pipelines
- **Scope:** sharing is available only when authentication is enabled; in single-user (auth-off) mode all pipelines are visible to all sessions

### Authentication

- Optional per deployment — disabled by default for single-user and local use
- Toggle auth on or off live from **Settings → Security** — no restart or environment variable change required
- JWT-based session tokens, 1-week expiry, stored client-side in browser localStorage
- Passwords hashed with sha256_crypt
- First-run seeds an admin/admin account (prompted to change on first login)

### Per-User Dremio Identity

Each user can configure a personal Dremio PAT via **User menu → My Dremio Credentials**:

- When a personal PAT is set, all pipeline previews and executions for that user run under their Dremio identity — not the shared service account configured in Settings
- Enables per-user Dremio access control (users can only query tables their Dremio account has access to), audit logging, and data governance traceability
- Works with Dremio Cloud (PAT required) and Dremio Software 25.x+ (PAT optional)
- No admin action required — each user configures and saves their own credentials independently
- If no personal PAT is set, the user falls back to the shared service account connection

---

## 32. Competitive Positioning Summary

### vs. dbt Core
Transform Studio adds: visual UI, built-in scheduler, alerts, monitoring, approvals, role-based access control, pipeline sharing, per-user Dremio identity, MCP/AI integration, data profiling, step-by-step preview, webhook triggers, and desktop app — all without requiring any SQL or command-line knowledge.

### vs. dbt Cloud
Transform Studio is self-hosted (no SaaS dependency), Dremio-native, includes an MCP server for AI agent integration, supports per-user Dremio credentials for fine-grained data governance, and is significantly lower cost.

### vs. Matillion / Coalesce
Transform Studio is purpose-built for Dremio, open-source friendly, includes an MCP server, runs as a single Docker container with zero external dependencies, supports team collaboration with RBAC and pipeline sharing, and includes a desktop app for individual use.

### Key Differentiators
1. **Dremio-native** — built specifically for Dremio; leverages Dremio's SQL engine, catalog, and Iceberg support natively
2. **Zero external dependencies** — no Airflow, no external scheduler, no cloud subscription required
3. **AI-native via MCP** — the only pipeline tool with a built-in MCP server enabling full AI agent control
4. **Full-stack in one container** — UI, API, scheduler, alerting, auth, lineage, and RBAC all in a single Docker image
5. **Desktop + server** — works as a personal desktop app or a shared team server
6. **Transparent SQL** — every transform generates viewable, copyable Dremio SQL
7. **Multi-user collaboration** — role-based access control, pipeline sharing with granular permissions, and per-user Dremio identity for audit logging and data governance
8. **Per-user Dremio identity** — each team member runs pipelines under their own Dremio account, enabling row-level security, Dremio audit trails, and per-user access enforcement without any infrastructure changes
