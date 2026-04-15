"""
Built-in pipeline template library for Transform Studio.

Each template is a self-contained pipeline spec with placeholder source tables.
When deployed, the user picks the actual table and the pipeline is created
with steps pre-wired. The source_table in each step is a human-readable hint
that the user replaces before running.
"""
from __future__ import annotations
import uuid

TEMPLATES = [
    {
        "id": "daily_sales_summary",
        "name": "Daily Sales Summary",
        "description": "Aggregate revenue, order count, and average order value by day. "
                       "Connect to any orders/transactions table.",
        "category": "Analytics",
        "icon": "💰",
        "tags": ["sales", "daily", "aggregation"],
        "source_hint": "your_schema.orders",
        "steps": [
            {
                "transform_type": "filter_rows",
                "label": "Exclude cancelled orders",
                "notes": "Adjust the status field name to match your schema",
                "config": {"condition": "status != 'cancelled'"},
            },
            {
                "transform_type": "group_aggregate",
                "label": "Aggregate by day",
                "config": {
                    "group_by": ["order_date"],
                    "aggregations": [
                        {"function": "COUNT", "column": "*",        "output_name": "order_count"},
                        {"function": "SUM",   "column": "revenue",  "output_name": "total_revenue"},
                        {"function": "AVG",   "column": "revenue",  "output_name": "avg_order_value"},
                        {"function": "SUM",   "column": "quantity", "output_name": "total_units"},
                    ],
                },
            },
            {
                "transform_type": "add_column",
                "label": "Revenue 7-day rolling avg",
                "config": {
                    "name": "revenue_7d_avg",
                    "expression": "AVG(total_revenue) OVER (ORDER BY order_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)",
                },
            },
        ],
        "output_mode": "ctas",
    },
    {
        "id": "customer_360",
        "name": "Customer 360",
        "description": "Join customers with their latest order, lifetime value, and order count "
                       "into a single wide record per customer.",
        "category": "Analytics",
        "icon": "👤",
        "tags": ["customers", "join", "lifetime value"],
        "source_hint": "your_schema.customers",
        "steps": [
            {
                "transform_type": "join",
                "label": "Join latest order date",
                "notes": "Replace 'your_schema.orders' with your actual orders table",
                "config": {
                    "join_type": "LEFT",
                    "right_table": "your_schema.orders",
                    "join_keys": {"customer_id": "customer_id"},
                    "right_columns": "order_date, revenue, status",
                },
            },
            {
                "transform_type": "add_column",
                "label": "Days since last order",
                "config": {
                    "name": "days_since_last_order",
                    "expression": "DATEDIFF(CURRENT_DATE, MAX(order_date))",
                },
            },
            {
                "transform_type": "group_aggregate",
                "label": "Lifetime value per customer",
                "config": {
                    "group_by": ["customer_id", "email", "name", "signup_date"],
                    "aggregations": [
                        {"function": "COUNT", "column": "order_date",  "output_name": "order_count"},
                        {"function": "SUM",   "column": "revenue",     "output_name": "lifetime_value"},
                        {"function": "MAX",   "column": "order_date",  "output_name": "last_order_date"},
                        {"function": "MIN",   "column": "order_date",  "output_name": "first_order_date"},
                    ],
                },
            },
        ],
        "output_mode": "ctas",
    },
    {
        "id": "churn_candidates",
        "name": "Churn Candidates",
        "description": "Flag customers who haven't ordered in the last 90 days but were previously active.",
        "category": "Marketing",
        "icon": "⚠️",
        "tags": ["churn", "retention", "marketing"],
        "source_hint": "your_schema.customers",
        "steps": [
            {
                "transform_type": "join",
                "label": "Join last order date",
                "config": {
                    "join_type": "LEFT",
                    "right_table": "your_schema.orders",
                    "join_keys": {"customer_id": "customer_id"},
                    "right_columns": "order_date",
                },
            },
            {
                "transform_type": "group_aggregate",
                "label": "Last order per customer",
                "config": {
                    "group_by": ["customer_id", "email", "name"],
                    "aggregations": [
                        {"function": "MAX",   "column": "order_date", "output_name": "last_order_date"},
                        {"function": "COUNT", "column": "order_date", "output_name": "order_count"},
                    ],
                },
            },
            {
                "transform_type": "filter_rows",
                "label": "Churned: no order in 90 days",
                "notes": "Adjust the 90-day threshold as needed",
                "config": {"condition": "DATEDIFF(CURRENT_DATE, last_order_date) > 90 AND order_count > 0"},
            },
            {
                "transform_type": "add_column",
                "label": "Days since last order",
                "config": {
                    "name": "days_churned",
                    "expression": "DATEDIFF(CURRENT_DATE, last_order_date)",
                },
            },
        ],
        "output_mode": "ctas",
    },
    {
        "id": "user_activity_funnel",
        "name": "User Activity Funnel",
        "description": "Count users at each stage of a funnel (sign-up → activation → purchase → repeat).",
        "category": "Product",
        "icon": "📊",
        "tags": ["funnel", "product", "events"],
        "source_hint": "your_schema.events",
        "steps": [
            {
                "transform_type": "group_aggregate",
                "label": "Unique users per event type",
                "notes": "Assumes an 'event_type' column. Adjust to match your event schema.",
                "config": {
                    "group_by": ["event_type"],
                    "aggregations": [
                        {"function": "COUNT_DISTINCT", "column": "user_id", "output_name": "unique_users"},
                        {"function": "COUNT",          "column": "user_id", "output_name": "total_events"},
                    ],
                },
            },
            {
                "transform_type": "add_column",
                "label": "% of total users",
                "config": {
                    "name": "pct_of_total",
                    "expression": "ROUND(100.0 * unique_users / SUM(unique_users) OVER (), 1)",
                },
            },
        ],
        "output_mode": "ctas",
    },
    {
        "id": "monthly_cohort_retention",
        "name": "Monthly Cohort Retention",
        "description": "Group users by sign-up month (cohort) and measure how many come back each month.",
        "category": "Product",
        "icon": "📅",
        "tags": ["cohort", "retention", "monthly"],
        "source_hint": "your_schema.user_sessions",
        "steps": [
            {
                "transform_type": "join",
                "label": "Join cohort month from users",
                "notes": "Replace 'your_schema.users' with your actual users table",
                "config": {
                    "join_type": "LEFT",
                    "right_table": "your_schema.users",
                    "join_keys": {"user_id": "user_id"},
                    "right_columns": "signup_date",
                },
            },
            {
                "transform_type": "add_column",
                "label": "Cohort month",
                "config": {
                    "name": "cohort_month",
                    "expression": "DATE_TRUNC('MONTH', signup_date)",
                },
            },
            {
                "transform_type": "add_column",
                "label": "Activity month",
                "config": {
                    "name": "activity_month",
                    "expression": "DATE_TRUNC('MONTH', session_date)",
                },
            },
            {
                "transform_type": "group_aggregate",
                "label": "Users retained per cohort-month pair",
                "config": {
                    "group_by": ["cohort_month", "activity_month"],
                    "aggregations": [
                        {"function": "COUNT_DISTINCT", "column": "user_id", "output_name": "retained_users"},
                    ],
                },
            },
        ],
        "output_mode": "ctas",
    },
    {
        "id": "top_products",
        "name": "Top Products by Revenue",
        "description": "Rank products by total revenue, with category breakdown.",
        "category": "Analytics",
        "icon": "🏆",
        "tags": ["products", "ranking", "revenue"],
        "source_hint": "your_schema.order_items",
        "steps": [
            {
                "transform_type": "group_aggregate",
                "label": "Revenue per product",
                "config": {
                    "group_by": ["product_id", "product_name", "category"],
                    "aggregations": [
                        {"function": "SUM",   "column": "revenue",  "output_name": "total_revenue"},
                        {"function": "COUNT", "column": "order_id", "output_name": "order_count"},
                        {"function": "AVG",   "column": "revenue",  "output_name": "avg_revenue"},
                    ],
                },
            },
            {
                "transform_type": "add_column",
                "label": "Revenue rank",
                "config": {
                    "name": "revenue_rank",
                    "expression": "RANK() OVER (ORDER BY total_revenue DESC)",
                },
            },
            {
                "transform_type": "add_column",
                "label": "Category rank",
                "config": {
                    "name": "category_rank",
                    "expression": "RANK() OVER (PARTITION BY category ORDER BY total_revenue DESC)",
                },
            },
        ],
        "output_mode": "ctas",
    },
    {
        "id": "data_freshness_audit",
        "name": "Data Freshness Audit",
        "description": "Check when each table in a schema was last updated. "
                       "Great for pipeline health monitoring.",
        "category": "Operations",
        "icon": "🔍",
        "tags": ["data quality", "freshness", "audit"],
        "source_hint": "your_schema.your_table",
        "steps": [
            {
                "transform_type": "group_aggregate",
                "label": "Max timestamp per partition",
                "notes": "Change 'updated_at' to your actual timestamp column",
                "config": {
                    "group_by": ["partition_date"],
                    "aggregations": [
                        {"function": "MAX",   "column": "updated_at", "output_name": "last_updated"},
                        {"function": "COUNT", "column": "*",          "output_name": "row_count"},
                    ],
                },
            },
            {
                "transform_type": "add_column",
                "label": "Hours since last update",
                "config": {
                    "name": "hours_stale",
                    "expression": "DATEDIFF(CURRENT_TIMESTAMP, last_updated) * 24",
                },
            },
            {
                "transform_type": "add_column",
                "label": "Freshness status",
                "config": {
                    "name": "freshness_status",
                    "expression": "CASE WHEN hours_stale < 25 THEN 'fresh' WHEN hours_stale < 72 THEN 'stale' ELSE 'critical' END",
                },
            },
        ],
        "output_mode": "preview",
    },
    {
        "id": "revenue_by_region",
        "name": "Revenue by Region",
        "description": "Join orders with a geography/store dimension to break revenue down by region.",
        "category": "Analytics",
        "icon": "🌍",
        "tags": ["revenue", "region", "geo"],
        "source_hint": "your_schema.orders",
        "steps": [
            {
                "transform_type": "join",
                "label": "Join region from stores",
                "notes": "Replace 'your_schema.stores' with your geography/store dimension table",
                "config": {
                    "join_type": "LEFT",
                    "right_table": "your_schema.stores",
                    "join_keys": {"store_id": "store_id"},
                    "right_columns": "region, country, city",
                },
            },
            {
                "transform_type": "group_aggregate",
                "label": "Revenue per region",
                "config": {
                    "group_by": ["region", "country"],
                    "aggregations": [
                        {"function": "SUM",   "column": "revenue",   "output_name": "total_revenue"},
                        {"function": "COUNT", "column": "order_id",  "output_name": "order_count"},
                        {"function": "COUNT_DISTINCT", "column": "customer_id", "output_name": "unique_customers"},
                    ],
                },
            },
            {
                "transform_type": "add_column",
                "label": "Revenue share %",
                "config": {
                    "name": "revenue_share_pct",
                    "expression": "ROUND(100.0 * total_revenue / SUM(total_revenue) OVER (), 2)",
                },
            },
        ],
        "output_mode": "ctas",
    },
]


def list_templates() -> list:
    return TEMPLATES


def get_template(template_id: str) -> dict | None:
    return next((t for t in TEMPLATES if t["id"] == template_id), None)


def instantiate_template(template: dict, source_table: str) -> dict:
    """
    Build a pipeline-create payload from a template.
    Injects new UUIDs for each step and sets the source_table.
    """
    steps = []
    for s in template["steps"]:
        steps.append({
            "id":             str(uuid.uuid4()),
            "transform_type": s["transform_type"],
            "label":          s.get("label"),
            "notes":          s.get("notes"),
            "config":         s.get("config", {}),
        })
    return {
        "name":        template["name"],
        "source_table": source_table,
        "output_mode": template.get("output_mode", "preview"),
        "steps":       steps,
    }
