"""
Take screenshots of Transform Studio for the Visual User Guide.
Run from the repo root: python3 docs/take_screenshots.py
Requires the app to be running at http://localhost:8000
"""
import asyncio
import os
from playwright.async_api import async_playwright

OUT = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUT, exist_ok=True)

BASE = "http://localhost:8000"

async def shot(page, name, msg=""):
    path = os.path.join(OUT, name)
    await page.screenshot(path=path, full_page=False)
    print(f"  ✅  {name}  {msg}")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 820})
        page = await ctx.new_page()

        print("Navigating to app…")
        await page.goto(BASE, wait_until="networkidle")
        await page.wait_for_timeout(1500)

        # ── 01 Main layout (new pipeline, no source) ──────────────────────────
        print("01 — main layout")
        # Click + New Pipeline button
        await page.click("text=+ New Pipeline")
        await page.wait_for_timeout(800)
        await shot(page, "01-main-layout.png", "(new pipeline, catalog loaded)")

        # ── 02 Connection settings modal ─────────────────────────────────────
        print("02 — connection settings")
        # Click the settings/gear icon (⚙️)
        await page.click('button[title="Settings"], button:has(svg[data-lucide="settings"]), button:has(svg[data-lucide="wifi"])')
        await page.wait_for_timeout(600)
        await shot(page, "02-connection-settings.png", "(settings modal open)")
        # Close modal
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(400)

        # ── 03 Pipeline with source + transform library ───────────────────────
        print("03 — pipeline with source / transform library")
        # Open the customer pipeline
        customer = page.locator("text=customer").first
        await customer.click()
        await page.wait_for_timeout(1000)
        # Click ADD tab
        add_tab = page.locator("text=ADD").first
        await add_tab.click()
        await page.wait_for_timeout(400)
        await shot(page, "03-pipeline-with-source.png", "(customer pipeline, ADD tab)")

        # ── 04 Transform library (same view, just renamed) ────────────────────
        import shutil
        shutil.copy(os.path.join(OUT, "03-pipeline-with-source.png"),
                    os.path.join(OUT, "04-transform-library.png"))
        print("  ✅  04-transform-library.png  (copy of 03)")

        # ── 05 Preview results ────────────────────────────────────────────────
        print("05 — preview results")
        await page.click("text=Preview", timeout=5000)
        await page.wait_for_timeout(3000)  # wait for query to return
        await shot(page, "05-preview-results.png", "(preview data grid)")

        # ── 06 Lineage view ───────────────────────────────────────────────────
        print("06 — lineage view")
        await page.click("text=Lineage", timeout=5000)
        await page.wait_for_timeout(800)
        await shot(page, "06-lineage-view.png", "(DAG view)")

        # ── 07 Tests panel ────────────────────────────────────────────────────
        print("07 — tests panel")
        await page.click("text=TESTS", timeout=5000)
        await page.wait_for_timeout(400)
        await shot(page, "07-tests-panel.png", "(tests sub-tab)")

        # ── 08 Schedule modal ─────────────────────────────────────────────────
        print("08 — schedule modal")
        # Click the schedule/calendar icon in toolbar
        sched = page.locator('button[title="Schedule"], button:has(svg[data-lucide="calendar"]), button:has(svg[data-lucide="clock"])')
        await sched.first.click()
        await page.wait_for_timeout(600)
        await shot(page, "08-schedule-modal.png", "(schedule modal)")
        await page.keyboard.press("Escape")

        await browser.close()
        print("\nAll screenshots saved to docs/screenshots/")

asyncio.run(main())
