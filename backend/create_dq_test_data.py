"""
Creates synthetic data VDS in local Dremio for DQ testing.
Runs against: localhost:9047 (user: mark, pass: critter77)

Creates in the "@mark" home space as Virtual Datasets (VDS):
  1. dq_customers      — clean customer data (50 rows, good DQ)
  2. dq_orders         — orders with ~15% null customer_id + invalid statuses
  3. dq_products       — products with duplicates + negative prices
  4. dq_transactions   — transactions with out-of-range amounts

Usage:
  cd backend
  # First update Transform Studio connection settings to point at local Dremio,
  # OR run with env vars:
  DREMIO_USER=mark DREMIO_PASS=critter77 DREMIO_HOST=localhost python3 create_dq_test_data.py
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

# Override settings before importing clients
os.environ.setdefault("DREMIO_USER", "mark")
os.environ.setdefault("DREMIO_PASS", "critter77")
os.environ.setdefault("DREMIO_HOST", "localhost")
os.environ.setdefault("DREMIO_PORT", "9047")
os.environ.setdefault("DREMIO_AUTH_TYPE", "password")

from dremio_client import DremioClient
from config import settings

settings.dremio_user = os.environ["DREMIO_USER"]
settings.dremio_pass = os.environ["DREMIO_PASS"]
settings.dremio_host = os.environ["DREMIO_HOST"]
settings.dremio_port = int(os.environ["DREMIO_PORT"])
settings.dremio_auth_type = os.environ["DREMIO_AUTH_TYPE"]


async def run_vds(client: DremioClient, sql: str, label: str):
    """Run a CREATE OR REPLACE VDS statement."""
    try:
        await client.run_query(sql)
        print(f"  ✅ {label}")
    except Exception as e:
        print(f"  ❌ {label}: {e}")


async def main():
    client = DremioClient()

    print("\n🔧 Creating DQ test VDS in @mark home space...\n")

    # ── 1. dq_customers (50 rows, clean — good DQ baseline) ───────────────────
    cust_rows = []
    countries = ["US", "UK", "CA", "AU", "DE"]
    for i in range(1, 51):
        name = f"Customer{i:03d}"
        email = f"customer{i:03d}@example.com"
        country = countries[i % 5]
        age = 20 + (i % 50)
        score = round(50 + (i % 50), 1)
        cust_rows.append(
            f"SELECT {i} AS customer_id, '{name}' AS name, '{email}' AS email, "
            f"'{country}' AS country, {age} AS age, CAST({score} AS DOUBLE) AS credit_score"
        )

    customers_sql = (
        "CREATE OR REPLACE VDS \"@mark\".dq_customers AS\n" +
        "\nUNION ALL\n".join(cust_rows)
    )
    await run_vds(client, customers_sql, "dq_customers (50 rows, clean)")

    # ── 2. dq_orders (60 rows, ~15% null customer_id, some bad statuses) ──────
    valid_statuses = ["pending", "shipped", "delivered", "cancelled"]
    order_rows = []
    for i in range(1, 61):
        order_id = i
        # every 7th row has no customer_id (NULL)
        cust_id = f"{(i % 50) + 1}" if i % 7 != 0 else "NULL"
        amount = round(10 + (i * 3.7) % 490, 2)
        # introduce INVALID status for rows 10, 20, 30
        if i in (10, 20, 30):
            status = "INVALID_STATUS"
        elif i % 7 == 0:
            status = "NULL_VAL"  # invalid
        else:
            status = valid_statuses[i % 4]
        status_val = f"'{status}'" if status != "NULL" else "NULL"
        order_rows.append(
            f"SELECT {order_id} AS order_id, {cust_id} AS customer_id, "
            f"CAST({amount} AS DOUBLE) AS amount, {status_val} AS status"
        )

    orders_sql = (
        "CREATE OR REPLACE VDS \"@mark\".dq_orders AS\n" +
        "\nUNION ALL\n".join(order_rows)
    )
    await run_vds(client, orders_sql, "dq_orders (60 rows, some null customer_id, invalid statuses)")

    # ── 3. dq_products (30 rows, duplicate IDs and negative prices) ───────────
    product_rows = []
    categories = ["Electronics", "Clothing", "Food", "Books", "Sports"]
    for i in range(1, 31):
        # row 11 duplicates row 1, row 21 duplicates row 11
        prod_id = i if i not in (11, 21, 22) else (i - 10)
        name = f"Product{i:03d}"
        # rows 5, 15, 25 have negative prices
        price = -9.99 if i in (5, 15, 25) else round(10 + (i * 5.5) % 190, 2)
        cat = categories[i % 5]
        product_rows.append(
            f"SELECT {prod_id} AS product_id, '{name}' AS name, "
            f"CAST({price} AS DOUBLE) AS price, '{cat}' AS category"
        )

    products_sql = (
        "CREATE OR REPLACE VDS \"@mark\".dq_products AS\n" +
        "\nUNION ALL\n".join(product_rows)
    )
    await run_vds(client, products_sql, "dq_products (30 rows, 3 dup product_ids, 3 negative prices)")

    # ── 4. dq_transactions (80 rows, out-of-range amounts) ────────────────────
    txn_rows = []
    for i in range(1, 81):
        txn_id = i
        cust_id = (i % 50) + 1
        # 5 rows have negative amounts, 3 rows have huge amounts
        if i in (10, 20, 30, 40, 50):
            amount = round(-100.0 - i, 2)
        elif i in (60, 70, 80):
            amount = round(99999.0 + i * 100, 2)
        else:
            amount = round(5 + (i * 12.3) % 995, 2)
        txn_rows.append(
            f"SELECT {txn_id} AS txn_id, {cust_id} AS customer_id, "
            f"CAST({amount} AS DOUBLE) AS amount, "
            f"'TXN-{i:04d}' AS txn_ref"
        )

    txns_sql = (
        "CREATE OR REPLACE VDS \"@mark\".dq_transactions AS\n" +
        "\nUNION ALL\n".join(txn_rows)
    )
    await run_vds(client, txns_sql, "dq_transactions (80 rows, 5 negative + 3 huge amounts)")

    print("\n✅ Test VDS created in @mark space:\n")
    print("  • \"@mark\".dq_customers     — 50 rows, clean baseline")
    print("  • \"@mark\".dq_orders        — 60 rows, ~15% null customer_id, invalid statuses")
    print("  • \"@mark\".dq_products      — 30 rows, duplicate product_ids, negative prices")
    print("  • \"@mark\".dq_transactions  — 80 rows, out-of-range amounts")
    print()
    print("Suggested DQ monitors to create in Transform Studio:")
    print()
    print("  Monitor 1: @mark.dq_customers")
    print("    Rules: Row Count (min=40), Not Null Strict (email), Column Uniqueness (customer_id)")
    print()
    print("  Monitor 2: @mark.dq_orders")
    print("    Rules: Null Rate (customer_id, max 5%), Accepted Values (status: pending,shipped,delivered,cancelled)")
    print()
    print("  Monitor 3: @mark.dq_products")
    print("    Rules: Duplicate Rows (key=product_id), Numeric Range (price, min=0, max=5000)")
    print()
    print("  Monitor 4: @mark.dq_transactions")
    print("    Rules: Numeric Range (amount, min=0, max=10000), Row Count (min=70)")
    print()


if __name__ == "__main__":
    asyncio.run(main())
