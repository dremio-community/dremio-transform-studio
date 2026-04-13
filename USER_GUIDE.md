# Dremio Transform Studio — User Guide

**Version 1.5 | April 2026**

---

## What is Transform Studio?

Dremio Transform Studio is a visual pipeline builder for Dremio. Instead of writing SQL by hand, you build data pipelines by clicking through a library of pre-built transforms — filter rows, join tables, cast data types, aggregate, deduplicate, and much more. The tool generates and runs the SQL against your Dremio instance automatically.

Think of it like a visual version of dbt, built specifically for Dremio.

---

## Interface Overview

The interface has four main areas:

```
┌─────────────────────────────────────────────────────────────────┐
│  TOP BAR — Pipeline name, Save, Preview, Execute, SQL, Settings  │
├──────────────┬──────────────────────────────┬───────────────────┤
│              │                              │  ADD | CONFIG     │
│  LEFT        │  CENTER                      │  HISTORY | RUNS   │
│  SIDEBAR     │  PIPELINE BUILDER            │  ─────────────── │
│              │  or LINEAGE VIEW             │  ⚙ 🧪 ⑂ 🔗 ⚡ 📡 ✔ │
│  • Pipelines │                              │  ─────────────── │
│  • Dremio    │                              │  Panel content    │
│    Catalog   │                              │                   │
│  • Iceberg   │                              │                   │
│    Catalogs  │                              │                   │
│              ├──────────────────────────────┤                   │
│              │  BOTTOM — Preview / SQL      │                   │
└──────────────┴──────────────────────────────┴───────────────────┘
```

**Right panel tabs:**
- Primary row: **ADD** (transform library) · **CONFIG** (step settings) · **HISTORY** (versions) · **RUNS** (execution log)
- Icon strip below: **Params** · **Tests** · **Deps** · **Webhook** · **Hooks** · **Expose** · **Reviews** — hover any icon to see its label

---

## Getting Started

### Step 1 — Open the App

How you access Transform Studio depends on how it was installed:

| Installation type | URL to open in your browser |
|-------------------|-----------------------------|
| **Desktop app (Mac / Windows / Linux)** | The browser opens automatically. If it doesn't, go to **`http://localhost:8000`** |
| **Docker Desktop (personal)** | **`http://localhost:8000`** |
| **Server / team deployment** | The URL your admin gave you (e.g. `https://transforms.mycompany.com`) |
| **Dev mode (local)** | **`http://localhost:5173`** |

> **Tip:** Bookmark the URL once the app is open so you can return to it easily.

---

### Step 2 — Log In (if authentication is enabled)

If your administrator has enabled user authentication, you will see a login screen when you first open Transform Studio. Enter your username and password to continue.

- The default admin account created on first launch is **username: `admin` / password: `admin`**
- Change the admin password after your first login
- Administrators can create additional user accounts in **Settings → Users**

> **Note:** Authentication is optional and disabled by default. If your instance doesn't show a login screen, no login is required.

---

### Step 3 — Connect to Dremio

Click the **⚙️ gear icon** in the top-right toolbar to open Connection Settings.

**For self-hosted Dremio:**
- Set Host to your Dremio server address (e.g. `dremio.mycompany.com`)
- Port: `9047`
- Choose **Username / Password** and enter your credentials
- Click **Test Connection** to verify, then **Save & Connect**

**For Dremio Cloud:**
- Click the **Dremio Cloud (US)** or **Dremio Cloud (EU)** preset button
- Switch auth to **Personal Access Token**
- Paste your PAT (found in Dremio Cloud → Account → Personal Access Tokens)
- Enter your Project ID (found in your browser URL: `app.dremio.cloud/project/YOUR-ID/...`)
- Click **Test Connection**, then **Save & Connect**

---

### Step 4 — Browse and Select a Table

In the **left sidebar**, expand the Dremio catalog to find your source table. Click any table name to select it as the pipeline source. The tool will automatically fetch the table's schema.

If you use **Iceberg REST catalogs**, click the **Iceberg** tab in the sidebar to browse those.

---

### Step 5 — Build Your Pipeline

Once a source table is selected, the center panel shows your pipeline. Click **+ Add transform step** or click **Add Transform** in the right panel to open the transform library.

Browse by category or scroll through the list. Click any transform to add it as a step.

---

## Working with Transforms

### Adding a Step
1. Click **Add Transform** in the right panel tab
2. Browse the library — hover over any transform to see its full description
3. Click the transform to add it to the pipeline

### Configuring a Step
Click any step in the pipeline to select it. The right panel switches to **Configure** mode showing all available options for that step. Changes take effect immediately (the step is not saved until you hit **Save**).

### Reordering Steps
**Drag and drop** the **⠿ grip handle** on the left side of any step to drag it to a new position. You can also use the **↑ ↓** arrow buttons on the right side of each step.

### Deleting a Step
Click the **🗑️ trash icon** on a step to remove it.

### Step Labels
Each step shows a summary line describing what it does (e.g. "Filter customer_id equals 123"). This is auto-generated from the configuration.

---

## Transform Library — All 52 Transforms

### 🧹 Clean (14 transforms)
Transforms for fixing data quality issues.

| Transform | What it does |
|-----------|-------------|
| **Remove Duplicates** | Deduplicate rows based on selected columns |
| **Drop Nulls** | Remove rows where specified columns are null |
| **Fill Null Values** | Replace nulls with a constant, mean, median, or mode |
| **Trim Whitespace** | Remove leading/trailing spaces from text columns |
| **Standardize Case** | Convert text to upper, lower, or title case |
| **Cast Type** | Convert a column to a different data type (VARCHAR, INTEGER, DATE, etc.) |
| **Filter Rows** | Keep or remove rows based on a column condition |
| **Remove Special Characters** | Strip non-alphanumeric characters from a text column |
| **Validate Regex** | Keep or remove rows where a column matches a pattern |
| **Clip Values** | Clamp numeric values to a min/max range |
| **Replace String** | Find and replace text (exact or regex) |
| **Outlier Filter** | Remove or keep rows that are statistical outliers (±N standard deviations) |
| **Rename Columns** | Rename one or more columns |
| **Select Columns** | Keep only the columns you specify |

### 🔀 Reshape (9 transforms)
Transforms for changing the structure of your data.

| Transform | What it does |
|-----------|-------------|
| **Drop Columns** | Remove columns you don't need |
| **Split Column** | Split one text column into multiple columns by a delimiter |
| **Combine Columns** | Concatenate multiple columns into one |
| **Add Column** | Add a new column with a custom SQL expression |
| **Join** | Join to another table (INNER, LEFT, RIGHT, FULL OUTER, SEMI, ANTI) |
| **Union** | Append rows from another table |
| **Reorder Columns** | Specify the column order in the output |
| **Unpivot** | Convert wide format to long format (multiple value columns → key/value pairs) |
| **Flatten JSON** | Extract fields from a JSON column into separate columns |

### 📅 DateTime (5 transforms)
Transforms for working with dates and times.

| Transform | What it does |
|-----------|-------------|
| **Parse Date** | Convert a text column to DATE or TIMESTAMP |
| **Extract Date Part** | Pull year, month, day, hour, etc. into a new column |
| **Truncate Date** | Round a date down to year, month, week, day, hour |
| **Date Difference** | Calculate the difference between two dates in days, months, etc. |
| **Date Add/Subtract** | Add or subtract days, months, years from a date column |

### 🔍 Enrich (10 transforms)
Transforms for adding context and derived values.

| Transform | What it does |
|-----------|-------------|
| **Lookup Join** | Join a lookup/dimension table and bring in specific columns |
| **Map Values** | Replace specific values with mapped alternatives (like a lookup table) |
| **Bin Values** | Put numeric values into buckets (e.g. age groups) |
| **Add Row Number** | Add a sequential row number ordered by a column |
| **Running Total** | Add a cumulative sum column |
| **Conditional Column** | Add a column based on CASE WHEN conditions |
| **Lag / Lead** | Reference the previous or next row's value |
| **Percent of Total** | Express a column as a percentage of its group or overall total |
| **Unit Conversion** | Convert between units (length, weight, speed, area, temperature) |
| **Dedupe Keep Latest** | Keep the most recent record per key, based on a timestamp column |

### 📊 Aggregate (5 transforms)
Transforms for summarising and rolling up data.

| Transform | What it does |
|-----------|-------------|
| **Group & Aggregate** | GROUP BY with SUM, AVG, COUNT, MIN, MAX |
| **Top N per Group** | Keep the top N rows within each group |
| **Rolling Window** | Calculate a moving average, sum, min, or max over N rows |
| **Sample Rows** | Randomly sample N rows from the dataset |
| **SCD Type 1** | Slowly Changing Dimension — keep only the latest record per key |

### 🔤 String (8 transforms)
Transforms for advanced text manipulation.

| Transform | What it does |
|-----------|-------------|
| **Extract Regex** | Extract a captured group from a regex pattern into a new column |
| **Pad String** | Left-pad or right-pad a column to a fixed width |
| **Substring** | Extract a portion of a text column by position and length |
| **String Length** | Add a column with the character length of a text column |
| **Upper / Lower** | Convert multiple columns to upper or lower case at once |
| **Concat with Literal** | Add a prefix and/or suffix to a column value |
| **Hash Column** | Hash a column using MD5, SHA1, or SHA256 |
| **Surrogate Key** | Generate a unique MD5 hash key from multiple columns combined |

### ⚙️ Custom (1 transform)

| Transform | What it does |
|-----------|-------------|
| **Custom SQL** | Write any SQL transformation using `{input}` as a placeholder for the previous step's output. Opens a full-screen SQL editor. Save reusable snippets to the template library. |

---

## Output Options

At the bottom of the center panel you can set what happens when the pipeline is **executed**:

| Mode | What it does |
|------|-------------|
| **Preview only** | No output written — just runs a preview |
| **Create Table (CTAS)** | Creates a new Dremio table with the pipeline results |
| **Insert Into** | Appends pipeline results to an existing table |
| **Create View** | Creates a Dremio view that runs the pipeline SQL on demand |
| **Incremental** | On first run creates the table (CTAS); subsequent runs only process new/changed rows. Choose strategy and key column — see [Incremental Models](#incremental-models) below. |

**Setting the output path:** Use the **namespace dropdown** to select your target Dremio space or folder (including nested subfolders — e.g. `my_space › analytics › marts`), then type just the table name in the field next to it. The full path is shown as a live preview below. This avoids typos and ensures the folder already exists in Dremio.

---

## Preview vs Execute

**Preview** (green Play button) — Runs the pipeline against Dremio and shows up to 100 rows in the bottom panel. Does **not** write any data. Use this to validate your pipeline before executing.

**Execute** (blue Zap button) — Runs the full pipeline and writes results to the output table. Requires an output table to be configured. If the pipeline has parameters, a dialog will appear to fill in any values before execution.

**View SQL** (Code button) — Shows the generated SQL without running it. Useful for understanding what the pipeline produces or copying it into Dremio directly.

---

## Saving Pipelines

Click **Save** in the top toolbar. Every save creates a new version in the history. The pipeline name can be changed by hovering over a pipeline in the left sidebar and clicking the **✏️ pencil icon**.

The amber **●** dot next to the pipeline name means you have unsaved changes.

If another pipeline already has the same name, a warning dialog will appear before saving. You can either rename the pipeline first or click **Save Anyway** to allow duplicate names.

---

## Pipeline Descriptions

Each pipeline can have an optional description — useful for documenting what a pipeline does and why. Click inside the description area below the pipeline name in the top bar to add or edit text. Descriptions are saved with each version.

---

## Version History

Click the **History** tab in the right panel to see all saved versions of the current pipeline, newest first.

- Each version shows the version number, save message, and relative time
- The current version has a blue **current** badge
- Click **Restore** on any version and confirm to roll back the pipeline to that state

---

## Run History

Click the **Runs** tab in the right panel to see a log of all execution runs for the current pipeline:

- Each row shows when the run started, how long it took, whether it was triggered manually or by a schedule, and the outcome (success / failed)
- Failed runs show the error message — useful for debugging scheduled jobs
- A global run history across all pipelines is also accessible from the admin panel

---

## Scheduling

To run a pipeline automatically on a schedule, click the **🕐 clock icon** in the top toolbar (only available when a pipeline is loaded).

**Quick presets:** Every hour, Every 6 hours, Daily at midnight, Daily at 6 AM, Weekly Monday 8 AM, Monthly 1st

**Custom cron:** Enter any standard 5-part cron expression (`minute hour day month weekday`). Examples:
- `0 2 * * *` — every day at 2 AM
- `0 9 * * 1-5` — weekdays at 9 AM
- `*/30 * * * *` — every 30 minutes

Schedules can be **paused and resumed** without deleting them. The last run time and status (success/failed) are shown in the schedule panel.

### Failure Notifications

If email or Slack notifications are configured (in **Settings → Notifications**), the app will send an alert whenever a scheduled pipeline run fails. Configure SMTP settings for email alerts or paste a Slack incoming webhook URL for Slack alerts.

---

## Parameterized Pipelines

Pipelines can accept **runtime parameters** — named values that are substituted into transform configuration before the SQL is generated. This lets you reuse one pipeline with different filters, dates, or table names.

### Defining Parameters

1. Click the **Parameters** tab in the right panel (the `{…}` icon)
2. Click **+ Add Parameter**
3. Give the parameter a name (e.g. `start_date`), choose its type (string / number / date), and optionally set a default value and description

### Using Parameters in Steps

In any transform configuration field, type `{{parameter_name}}` to reference the parameter. For example, in a **Filter Rows** step you might set the value to `{{start_date}}`.

### Running with Parameters

When you click **Execute** on a pipeline that has parameters, a dialog appears showing all parameters. Fill in any values you want to override, then click **Run**. Default values are pre-filled automatically.

Parameters also work with **scheduled runs** — the scheduler uses the default values defined on each parameter.

---

## Webhook Triggers

Each pipeline can be triggered externally via an HTTP webhook — useful for integrating Transform Studio into other systems (CI/CD pipelines, Airflow DAGs, event-driven workflows, etc.).

### Getting the Webhook URL

1. Click the **Webhook** tab in the right panel (the 🔗 icon)
2. The webhook URL and a ready-to-use `curl` example are shown

### Triggering a Pipeline

```bash
# Trigger and wait for result (synchronous)
curl -X POST "https://your-server/api/webhooks/YOUR_TOKEN/trigger?mode=sync"

# Trigger and get a job ID back immediately (asynchronous)
curl -X POST "https://your-server/api/webhooks/YOUR_TOKEN/trigger"

# Pass parameter overrides
curl -X POST "https://your-server/api/webhooks/YOUR_TOKEN/trigger?mode=sync" \
  -H "Content-Type: application/json" \
  -d '{"param_values": {"start_date": "2026-01-01"}}'
```

The webhook token acts as authentication — keep it secret. If a token is compromised, click **Regenerate Token** in the Webhook panel to issue a new one.

### Webhook Modes

| Mode | Behaviour |
|------|-----------|
| `async` (default) | Returns `{"job_id": "..."}` immediately. Poll `/api/webhooks/TOKEN/status/JOB_ID` for the result. |
| `sync` | Waits for the pipeline to complete before returning the result (up to ~5 minutes). |

---

## Data Profiling

Click the **📊 bar chart icon** in the source table banner to open the Data Profile panel for your source table.

The first time you click **Profile Table**, the app runs a profiling query on Dremio — this typically takes 5–15 seconds. After that, results are **cached** so subsequent views are instant.

The profile shows for each column:
- **Type** — the data type
- **Nulls %** — the percentage of null values (with a green-to-red bar)
- **Distinct** — count of distinct values
- **Min / Max** — the minimum and maximum values

A **↻ Refresh** button in the panel header forces a fresh profile run from Dremio, bypassing the cache.

---

## Pipeline Lineage

Click the **Lineage** toggle in the source banner (appears when a table is selected) to switch from the step list to a visual node graph:

- **Dark navy node** at top = source table
- **White nodes** in the middle = each transform step (click any to jump to its config)
- **Green node** at bottom = output table (only shown when output is configured)
- **Indigo cards** below the output = downstream exposures (BI tools that consume this pipeline's data)

Switch back to **Pipeline** view to continue editing.

### Column Lineage

Below the node graph, a **Column Lineage** section is available for saved pipelines that have at least one step. Click the **▶ Column Lineage** toggle to expand it.

The column lineage view shows, for each step that modifies columns, a card with:
- The step number and label
- Each output column and which source column(s) it was derived from

Only steps that actually change something are shown — pass-through columns are hidden to keep the view compact. Columns derived from SQL expressions or computed values show `computed` in italic.

Column lineage is computed from the pipeline's configuration and does not require the pipeline to have been run.

---

## Managing Pipelines

**Search:** When you have 5 or more pipelines, a search box appears at the top of the pipeline list. Type any part of the pipeline name to filter the list instantly.

**Rename:** Hover over a pipeline in the left sidebar → click the **✏️ pencil icon** → type new name → press Enter or click Rename.

**Duplicate:** Hover over a pipeline → click the **⧉ copy icon** → a new pipeline is created with `(copy)` appended to the name.

**Export:** Hover over a pipeline → click the **↓ download icon** → a JSON file is downloaded. Use this to share pipelines between instances or back them up.

**Import:** Click the **↑ upload icon** (in the pipeline list header) → select a previously exported JSON file. The pipeline is created as a new entry.

**Delete:** Hover over a pipeline → click the **🗑️ trash icon** → confirm the deletion dialog.

**New pipeline:** Click the **+** button next to "Pipelines" in the left sidebar, or click a new table in the catalog.

---

## User Management (Admin only)

If authentication is enabled, administrators can manage users in **Settings → Users**.

- **Create user:** Enter a username and password, and choose whether the account is an admin
- **Delete user:** Click the trash icon next to any non-admin user
- The `admin` account cannot be deleted

Users see only the pipelines they have created. Admins can see all pipelines.

---

## Settings

Click the **⚙️ gear icon** to open Settings. There are four tabs:

### Connection
Configure how Transform Studio connects to Dremio. See [Getting Started → Step 3](#step-3--connect-to-dremio) above.

### Notifications
Set up email or Slack alerts for scheduled pipeline failures.

- **Email:** Enter SMTP server, port, from/to addresses, and credentials
- **Slack:** Paste an incoming webhook URL from your Slack app
- Click **Test Notification** to send a test alert and verify the settings

### Storage (Desktop app only)
Choose where the SQLite database is stored. By default it's at `~/.transform_studio/transforms.db`. Click **Change** to pick a different path and click **Save** — the app needs to restart to apply the change.

### Users (Admin only, when auth is enabled)
Manage user accounts — create new users or delete existing ones.

---

## Security Configuration (Server Deployments)

If you are running Transform Studio on a shared server with multiple users, set these two environment variables before starting the container:

```bash
AUTH_ENABLED=true
JWT_SECRET=your-long-random-secret-here
ALLOWED_ORIGINS=https://transforms.mycompany.com
```

**Why `ALLOWED_ORIGINS` matters:** By default, CORS is open (`*`), which is fine for personal/local use. On a shared server, leaving it open means any website can make API calls to your Transform Studio instance on behalf of a logged-in user. Setting it to your actual domain closes that gap.

If you need to allow multiple domains (e.g. different internal tools), separate them with spaces:
```bash
ALLOWED_ORIGINS=https://transforms.mycompany.com https://admin.mycompany.com
```

---

## Desktop App — Quit Button

When running the desktop version, a **power icon** (⏻) appears in the top-right toolbar. Click it to gracefully shut down the Transform Studio server and close the app.

---

## Incremental Models

Incremental mode lets you process only new or changed data on each run, rather than reprocessing the entire source table. This is much faster for large datasets.

### Setting Up Incremental

1. Set the output mode to **Incremental**
2. Choose a **strategy**:
   - **Append** — inserts only rows where the key column is greater than the current maximum in the output table (e.g. a timestamp or auto-increment ID). Best for append-only sources.
   - **Merge** — performs a `MERGE INTO` using the key column to upsert rows. Requires an Iceberg table as output. Best for sources where rows can be updated.
   - **Microbatch** — breaks the time range from the last processed timestamp to now into fixed-size batches and processes each batch as a separate INSERT. Best for high-volume event streams where you want bounded memory usage per run.
3. Set the **key column** — the column used to identify new/changed rows (e.g. `updated_at`, `event_id`)
4. For **Microbatch** only: choose a **window size** — `1 hour`, `6 hours`, `1 day` (default), or `1 week`. Each run processes one window at a time in a loop until it catches up to the current time.

### First Run Behaviour

On the very first run, the output table doesn't exist yet. Transform Studio automatically runs a full `CREATE TABLE AS SELECT` to build it, then switches to incremental logic on all subsequent runs.

### Microbatch Details

When using the Microbatch strategy:
- The first run creates the output table with a full load
- Subsequent runs query `MAX(key_column)` from the output table to find the last processed timestamp
- Batches are then inserted from that timestamp to the current time, one window at a time
- The execute result shows how many batches were processed (e.g. `14 microbatches`)
- If the pipeline is caught up (no new data), 0 batches run and the result is reported immediately

---

## Pipeline Tests

Pipeline tests let you define data quality assertions that run automatically after every successful execute. If a test with severity **error** fails, the run is marked as failed and any downstream pipelines are blocked.

### Defining Tests

1. Click the **Tests** tab in the right panel
2. Click **+ Add Test**
3. Choose a test type:

| Test Type | What it checks |
|-----------|---------------|
| **not_null** | No nulls in the specified column |
| **unique** | All values in the specified column are distinct |
| **row_count_between** | Row count is within a min/max range |
| **accepted_values** | Column only contains values from an allowed list |
| **relationships** | Every value in a column exists as a value in a reference table's column (referential integrity) |
| **custom_sql** | Your SQL returns zero rows (any rows returned = test failure) |

4. Set **severity**: `error` (blocks execution, marks run failed) or `warn` (logged but non-blocking)
5. Optionally set a **where filter** — a SQL condition that scopes the test to a subset of rows (e.g. `status = 'active'` or `created_at >= '2026-01-01'`). Only rows matching the filter are tested.
6. Optionally enable **Store Failures** — when checked, any failing rows are written to a table named `_failures_{test_name}` in the same namespace as your output table. A clickable badge appears in the test result so you can copy the table name and query it in Dremio.

### Running Tests

Tests run automatically after every Execute. You can also click **Run Now** in the Tests panel to run them manually against the current output table.

Results appear in the **Execute** tab of the bottom panel, showing which tests passed, warned, or failed.

### Relationships Test

The relationships test verifies referential integrity — that every value in a column actually exists in another table. Configure it with:
- **Column** — the column in your output table to check (e.g. `customer_id`)
- **Reference table** — the table that should contain the valid values (e.g. `my_space.customers`)
- **Reference column** — the column in the reference table (e.g. `id`)

Any values in your output table that don't exist in the reference table are returned as failures.

### Store Failures

When **Store Failures** is enabled on a test that fails, Transform Studio:
1. Runs a `DROP TABLE IF EXISTS` on the failures table
2. Creates a new `_failures_{test_name}` table using the rows that caused the test to fail
3. Shows an orange **📋 table_name** badge in the test result — click it to copy the table name to clipboard

Query the failures table directly in Dremio to understand what data is causing the issue.

---

## Cross-Pipeline DAG

When you have multiple pipelines that depend on each other (e.g. pipeline B uses the output of pipeline A as its source), you can declare those dependencies explicitly. Transform Studio will detect cycles, show execution order, and block execution if a dependency failed.

### Declaring Dependencies

1. Open a pipeline
2. Click the **Deps** tab in the right panel
3. Click **+ Add Dependency** and select upstream pipelines from the list

### Viewing the DAG

Click the **branch icon** (GitBranch) in the top toolbar to open the full-screen **Pipeline DAG** view. This shows:
- All pipelines as nodes
- Dependency arrows between them
- Execution order (topological sort)
- Any detected cycles (highlighted in red)

Click any node to jump directly to that pipeline.

---

## Alerts

The Alerts system lets you proactively monitor your data and pipelines, sending notifications when conditions are met.

Click the **bell icon** in the top toolbar to open the Alerts page.

### Alert Types

| Type | What it monitors |
|------|-----------------|
| **Custom SQL** | Runs any SQL query on Dremio; triggers when rows are returned (or value crosses a threshold) |
| **Pipeline Health** | Triggers on pipeline failure, run duration exceeded, row count change >X%, or pipeline hasn't run in X hours |
| **Data Quality** | Monitors min/max row count, null rate per column, or a custom SQL check against any table |
| **Source Freshness** | Triggers when the maximum value of a timestamp column in a table is older than a configured threshold (e.g. alert if `events.created_at` hasn't been updated in the last 2 hours) |

### Source Freshness Alert

Configure a Source Freshness alert with:
- **Table** — the table to check (e.g. `my_space.events`)
- **Timestamp column** — the column that indicates when rows were last inserted or updated (e.g. `created_at`)
- **Max age** — how old the latest timestamp can be before triggering (e.g. `2 hours`, `1 day`)

This is useful for detecting when upstream data pipelines have stalled or when a feed has stopped delivering data.

### Creating an Alert

1. Click **+ New Alert**
2. Choose an alert type and configure the condition
3. Set a **cron schedule** for how often to check
4. Optionally add an **email** address or **Slack webhook URL** for notifications
5. Click **Save**

### Managing Alerts

- Each alert has a **Run Now** button to trigger an immediate check
- Click any alert to expand its **history log** showing past evaluations and whether they triggered
- Alerts can be enabled/disabled without deleting them

---

## Run with Dependencies

When a pipeline has upstream dependencies declared, a **GitMerge chain icon** appears in the top toolbar (blue, next to the GitBranch icon). Click it to open the **Run with Dependencies** dialog.

This runs the full pipeline chain in topological order — all upstream pipelines first, then the target pipeline. If any upstream step fails, downstream steps are automatically skipped.

The dialog shows:
- The full chain as a breadcrumb trail (upstream → target highlighted in blue)
- Live status icons as each step runs (✓ success, ✗ failed, → skipped)
- Per-pipeline results: rows written, duration, and any error message
- A summary row: X succeeded · Y failed · Z skipped

---

## Seed Table from CSV

Click the **🌱 sprout icon** in the top toolbar to open the **Seed Table** dialog. This lets you upload a CSV file and create a Dremio table from it — useful for loading reference data, lookup tables, or test datasets.

1. Drag and drop a `.csv` file onto the drop zone, or click to browse
2. The table name is auto-filled from the filename — change it to `namespace.tablename` format (e.g. `my_space.seed_customers`)
3. A preview of the first 5 rows is shown so you can verify the data
4. Click **Seed Table** to create or replace the table in Dremio

**Notes:**
- Maximum 5,000 rows per upload
- Column types are inferred automatically (INTEGER, DOUBLE, or VARCHAR)
- If the table already exists, it is replaced

---

## Environments (Dev / Staging / Prod)

The **environment switcher** in the top toolbar (server icon + environment name) lets you save and switch between multiple Dremio connection profiles — useful for testing pipelines against a dev instance before running them in production.

### Creating an Environment

1. Click the environment name in the top bar → **Manage Environments**
2. Fill in the connection details: name, host, port, auth type, credentials, SSL
3. Click **Add Environment**

### Switching Environments

Click the environment name in the top bar → click any environment in the list to activate it. The connection switches immediately — all subsequent previews and executes use the new connection.

The active environment is shown with a blue **ACTIVE** badge in the manage panel.

---

## Exposures

Exposures let you tag a pipeline with the downstream BI tools, dashboards, or reports that consume its output. This makes it easy to understand the full impact of a pipeline — from source table to the business users viewing the data.

### Adding Exposures

1. Click the **Exposures** tab in the right panel (the link icon)
2. Click **+ Add Exposure**
3. Fill in:
   - **Name** — a label for this downstream consumer (e.g. `Weekly Revenue Dashboard`)
   - **Tool** — the BI tool: Tableau, Looker, Metabase, Power BI, Mode, Superset, Redash, or Custom
   - **URL** — a direct link to the dashboard or report
   - **Description** (optional) — any notes about how this exposure uses the data
4. Click the **↗ external link icon** to open the URL directly from the panel
5. Save the pipeline to persist the exposures

### Exposures in Lineage View

When a pipeline has exposures, they appear as indigo cards below the output node in the Lineage view. Each card shows the tool icon, name, and tool type. Click any card to open the URL in a new tab.

---

## Pre/Post Hooks

Hooks let you run arbitrary SQL before or after a pipeline executes. This is useful for tasks like:
- **Pre-hook:** Truncating a staging table before loading, setting a session variable, or checking a prerequisite condition
- **Post-hook:** Refreshing a downstream view, updating a metadata log table, or sending a signal to another system

### Configuring Hooks

Hooks are configured in the **Parameters** tab of the right panel, in the **Hooks** section below the parameter list.

- **Pre-hook SQL** — runs before the main pipeline SQL. If the pre-hook fails, the pipeline is aborted and the run is marked as failed.
- **Post-hook SQL** — runs after a successful pipeline execution. If the post-hook fails, the pipeline itself is still marked as succeeded, but the error is surfaced in the execute result panel.

Both hooks support full Dremio SQL including DDL statements (e.g. `DROP TABLE IF EXISTS my_space.temp_staging`).

---

## Iceberg Metadata Push

After every successful pipeline execute, Transform Studio automatically stamps metadata onto the output table as Iceberg table properties. This records which pipeline created the table and when.

The following properties are written:
- `ts.pipeline_id` — the pipeline's internal ID
- `ts.pipeline_name` — the pipeline name
- `ts.source_table` — the source table
- `ts.last_run` — timestamp of this execution
- `ts.rows_written` — number of rows written
- `ts.transform_studio_version` — version that ran the pipeline

**This only works if the output table is in an Iceberg-enabled source** (Arctic, Nessie, S3/ADLS with Iceberg format enabled). For tables in regular Dremio Spaces (Parquet format), the push is silently skipped.

The result is shown in the **Execute** tab of the bottom panel after each run:
- ✓ **Iceberg metadata stamped** — SQL method succeeded
- ✓ **Iceberg metadata stamped via REST catalog (name)** — REST catalog fallback succeeded
- **Iceberg metadata: not stamped** — table is not Iceberg format (normal for Space tables)

### Two Methods

Transform Studio tries two methods in order:

1. **Dremio SQL** — `ALTER TABLE SET TBLPROPERTIES` — works for tables in Arctic/Nessie/Iceberg sources managed by Dremio
2. **Iceberg REST catalog** — if SQL fails, falls back to any Iceberg REST catalog connections you have configured in the sidebar. This works for external catalogs (Nessie, Polaris, AWS Glue) even without Dremio ALTER privileges

---

## Export Documentation

Click the **📄 document icon** in the top toolbar to download a self-contained HTML documentation page for all your pipelines. No external dependencies — the file can be shared, emailed, or saved to a wiki.

Each pipeline card shows:
- Source and output table
- Output mode
- Number of steps and the step list
- Upstream dependencies
- Schedule (if configured)

---

## AI Agent Integration (MCP Server)

Transform Studio includes a built-in **MCP (Model Context Protocol) server** that lets AI agents like Claude drive the app directly — creating pipelines, running previews, executing, testing, seeding data, and more — all via natural language.

The MCP server is always running alongside the app. No setup required.

### Connecting Claude Desktop (local)

Add this to your `claude_desktop_config.json` (found at `~/Library/Application Support/Claude/claude_desktop_config.json` on Mac, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

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

Restart Claude Desktop. **Transform Studio** will appear in the tools list.

### Connecting Claude Desktop (server deployment with auth)

First get your JWT token:
```bash
curl -X POST https://transforms.mycompany.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your-username", "password": "your-password"}'
```

Then add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "transform-studio": {
      "url": "https://transforms.mycompany.com/mcp/sse",
      "transport": "sse",
      "headers": { "Authorization": "Bearer eyJ..." }
    }
  }
}
```

### What the Agent Can Do

Once connected, you can ask Claude things like:

> *"Look at the orders table in my_space, build a pipeline that filters to orders from the last 30 days and aggregates revenue by region, preview it, and if it looks right execute it"*

Available tools:

| Tool | What it does |
|------|-------------|
| Browse Dremio catalog | List namespaces, tables, schemas |
| Profile a table | Row count, null %, min/max per column |
| Create / save pipelines | Full pipeline CRUD including steps |
| Preview pipeline | Validate output before writing |
| Execute pipeline | Write results to Dremio |
| Run with dependencies | Execute full upstream chain |
| Run pipeline tests | Validate data quality |
| Seed a table | Create table from CSV content |
| Switch environments | Activate dev/staging/prod connection |
| Schedule pipeline | Set cron schedule |
| View run history | Check past execution results |
| View DAG | See cross-pipeline dependency graph |

### Standalone MCP Server (alternative)

A standalone `mcp_server.py` is also included in the `backend/` folder for tools that only support stdio-based MCP (rather than HTTP/SSE). To use it:

```bash
pip install httpx
python /path/to/backend/mcp_server.py --url http://localhost:8000
```

For stdio-based Claude Desktop config:
```json
{
  "mcpServers": {
    "transform-studio": {
      "command": "python3",
      "args": ["/path/to/backend/mcp_server.py"],
      "env": {
        "TS_URL": "http://localhost:8000",
        "TS_TOKEN": "optional-jwt-token"
      }
    }
  }
}
```

---

## API Reference

The full REST API is documented at **`/docs`** (e.g. `http://localhost:8000/docs`). This is a live Swagger UI — you can try every endpoint directly from the browser.

The API is organized into these groups:
- **pipelines** — CRUD, preview, execute, tests, history
- **dag** — dependency graph, execute-with-deps
- **catalog** — browse namespaces, schemas, profiles
- **transforms** — list available transform types
- **seeds** — CSV upload
- **environments** — connection profiles
- **schedules** — cron schedules
- **alerts** — data quality and health monitoring
- **iceberg** — Iceberg REST catalog connections
- **auth** — login, users
- **system** — health, settings, docs export, MCP server

---

## Debugging a Failed Execute — Step Bisection

When a pipeline execute fails and the error message isn't enough to pinpoint the problem, Transform Studio automatically narrows down which step caused the failure.

### How It Works

When an execute fails, the backend runs a **bisection** process:

1. It executes the pipeline up to each step boundary in turn, using a binary search strategy
2. The first step that causes the SQL to fail is identified
3. The execute result shows **"Failed at step N: [step name]"** in the error message, along with the problematic SQL

### What to Do

1. Check the execute result panel for the failed step name
2. Click that step in the pipeline to open its configuration
3. Review the step settings and the generated SQL (View SQL button)
4. Fix the configuration or switch to a different transform approach
5. Re-run the preview to validate before executing again

> **Tip:** You can also use the **Preview** button while building — it runs the pipeline up to the current state and shows results in the bottom panel, making it easy to catch issues step by step.

---

## Pipeline Health Dashboard

Click the **📊 Dashboard icon** in the top toolbar to open the Pipeline Health Dashboard — a full-screen view showing the real-time health of every pipeline in your workspace at a glance.

### Health Status

Each pipeline card shows one of four health states:

| Status | Meaning |
|--------|---------|
| ✅ **Healthy** | Last run succeeded and overall success rate ≥ 80% over 30 days |
| ⚠️ **Degraded** | Mixed results — success rate between 50–80%, or recent failures despite good history |
| 🔴 **Failing** | Last run failed and overall success rate < 50% — needs attention |
| — **Never Run** | No execution history yet |

Cards are sorted by urgency: **Failing → Degraded → Healthy → Never Run**, so the pipelines that need attention are always at the top.

### Dashboard Features

- **Success bar** — color-coded bar on each card shows the 30-day success rate visually
- **Last run time** — shows when the pipeline last executed
- **Next scheduled run** — shows the next scheduled execution time (if a schedule is enabled)
- **Click to open** — click any card to jump directly to that pipeline in the editor
- **Auto-refresh** — the dashboard refreshes every 30 seconds automatically

---

## Approval Workflow

For sensitive or production pipelines, admins can require that all changes go through a review process before being saved. This prevents unauthorized changes from going live.

### Enabling Approval Required (Admins only)

1. Open the pipeline you want to protect
2. In the toolbar save area (top right), toggle **Approval Required** on
3. The pipeline is now protected — non-admin users will see **Submit for Review** instead of **Save**

### Submitting a Change for Review (Editor flow)

1. Make your changes to the pipeline as normal
2. Click **Submit for Review** in the toolbar
3. A **Review Pending** badge replaces the button — your changes are queued for admin review

### Reviewing Changes (Admin flow)

1. Click the **✔ Reviews** icon in the right panel icon strip to open the approval queue
2. Select a pending review to see a step-by-step diff:
   - 🟢 **Added** steps (new)
   - 🔴 **Removed** steps (deleted)
   - 🟡 **Changed** steps (modified config)
   - ⬜ **Unchanged** steps (no change)
3. Add an optional comment and click **Approve** or **Reject**
   - **Approve** — the proposed changes are saved and become the live version
   - **Reject** — the changes are discarded; the pipeline stays on its current version

### Review History

The Reviews panel has filter tabs — **Pending**, **Approved**, **Rejected**, and **All** — so you can see the full audit trail of all change requests for every pipeline.

> **Note:** Full per-user enforcement requires authentication to be enabled (`AUTH_ENABLED=true`). When auth is disabled, all users are treated as admin.

---

## Tips

- **Build incrementally** — add one or two steps and Preview before continuing. Easier to catch issues early.
- **Use "Add Column"** for anything complex — if no built-in transform does exactly what you need, Add Column lets you write any SQL expression.
- **Join early** — if you need data from multiple tables, add a Join step near the beginning so later transforms can use all columns.
- **Check the SQL** — clicking "View SQL" shows exactly what Dremio will run. If something looks wrong in a preview, the SQL view makes it easy to spot the issue.
- **Schedule after testing** — always Preview and Execute manually at least once before setting up a schedule.
- **Use parameters for reusable pipelines** — instead of duplicating a pipeline for each date range or region, define a parameter and override it at run time or via webhook.
- **Profile before transforming** — use Data Profiling to understand null rates and value ranges before deciding which transforms to apply.
- **Use environments to test safely** — build and preview against a dev Dremio instance, then switch to production to execute.
- **Add tests to every pipeline** — at minimum add a `row_count_between` test so you'll know immediately if a pipeline produces unexpectedly few or many rows.
- **Enable Store Failures on important tests** — when a `not_null` or `unique` test fails, the failures table lets you query exactly which rows violated the assertion.
- **Add exposures to document impact** — tagging pipelines with their downstream dashboards makes it immediately obvious which reports are affected when a source changes.
- **Use column lineage for impact analysis** — before renaming or dropping a column, open Lineage → Column Lineage to see every downstream step that references it.
- **Use microbatch for high-volume event data** — instead of reprocessing the whole table or a single large INSERT, microbatch keeps memory usage bounded and gives you granular progress tracking.
- **Let the agent help** — if you're not sure which transforms to use, describe what you want to Claude and let it build the pipeline for you via the MCP integration.
- **Check the Dashboard first** — before diving into a failed pipeline, open the Dashboard to get the full picture of which pipelines are healthy and which need attention.
- **Use approvals for production pipelines** — enable Approval Required on any pipeline that feeds a dashboard or report. It adds a lightweight review gate without slowing down development on other pipelines.
