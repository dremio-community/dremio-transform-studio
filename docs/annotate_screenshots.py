"""
Annotate Transform Studio screenshots with labeled callout circles.
Creates annotated versions alongside the originals.
Run: python3 docs/annotate_screenshots.py
"""
from PIL import Image, ImageDraw, ImageFont
import os, shutil

SHOTS = os.path.join(os.path.dirname(__file__), "screenshots")

# ── Styling ──────────────────────────────────────────────────────────────────
CIRCLE_R   = 26          # circle radius px
FILL       = "#FF6B35"   # orange fill
BORDER     = "#FFFFFF"   # white border
BORDER_W   = 3
TEXT_COLOR = "#FFFFFF"
SHADOW     = "#00000060" # translucent black shadow

# Try to load a nice bold font; fall back to default
def get_font(size):
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()

def draw_callout(draw, x, y, letter, font):
    r = CIRCLE_R
    # Shadow
    draw.ellipse([x-r+2, y-r+2, x+r+2, y+r+2], fill=SHADOW)
    # White border ring
    draw.ellipse([x-r-BORDER_W, y-r-BORDER_W, x+r+BORDER_W, y+r+BORDER_W], fill=BORDER)
    # Orange fill
    draw.ellipse([x-r, y-r, x+r, y+r], fill=FILL)
    # Letter — centered
    bbox = font.getbbox(letter)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((x - tw//2, y - th//2 - bbox[1]), letter, fill=TEXT_COLOR, font=font)

def annotate(filename, callouts, label_font):
    """
    callouts: list of (x, y, 'LETTER')
    Saves annotated version as filename (overwrites).
    """
    src = os.path.join(SHOTS, filename)
    img = Image.open(src).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0,0,0,0))
    draw = ImageDraw.Draw(overlay)
    for (x, y, letter) in callouts:
        draw_callout(draw, x, y, letter, label_font)
    out = Image.alpha_composite(img, overlay).convert("RGB")
    out.save(src)
    print(f"  ✅  {filename}  ({len(callouts)} callouts)")

# ── Load font ─────────────────────────────────────────────────────────────────
font = get_font(22)

# ══════════════════════════════════════════════════════════════════════════════
# 01 — Main layout  (1893 × 948)
# Chrome + app. Sidebar left, catalog below, center canvas, right panel, toolbar.
# ══════════════════════════════════════════════════════════════════════════════
annotate("01-main-layout.png", [
    (92,  205, "A"),   # Pipeline list (PIPELINES section)
    (92,  400, "B"),   # Catalog browser (Dremio/Iceberg tabs + namespaces)
    (760, 440, "C"),   # Center canvas
    (1630, 145, "D"),  # Right config panel
    (950, 118, "E"),   # Toolbar (Preview/Execute)
], font)

# ══════════════════════════════════════════════════════════════════════════════
# 02 — Connection settings modal  (1909 × 835)
# ══════════════════════════════════════════════════════════════════════════════
annotate("02-connection-settings.png", [
    (784, 223, "A"),   # Quick Setup presets
    (720, 278, "B"),   # Host / Port fields
    (784, 370, "C"),   # Auth type toggle (PAT selected)
    (784, 450, "D"),   # Project ID + PAT fields
    (784, 568, "E"),   # Test Connection + Save & Connect buttons
], font)

# ══════════════════════════════════════════════════════════════════════════════
# 03 — Pipeline with source + transform library  (1909 × 835)
# ══════════════════════════════════════════════════════════════════════════════
annotate("03-pipeline-with-source.png", [
    (92,  230, "A"),   # Sidebar — pipeline list
    (92,  390, "B"),   # Sidebar — catalog (expanded customer360)
    (760, 130, "C"),   # Source bar (dremio_samples.customer360.customer)
    (760, 400, "D"),   # Center canvas "No transform steps yet"
    (1450, 170, "E"),  # ADD tab / transform category buttons
], font)

# ══════════════════════════════════════════════════════════════════════════════
# 04 — Transform library (same screenshot, just copy of 03)
# ══════════════════════════════════════════════════════════════════════════════
shutil.copy(os.path.join(SHOTS, "03-pipeline-with-source.png"),
            os.path.join(SHOTS, "04-transform-library.png"))
print("  ✅  04-transform-library.png  (copied from annotated 03)")

# ══════════════════════════════════════════════════════════════════════════════
# 05 — Preview results  (1907 × 837)
# Steps visible, data grid at bottom.
# ══════════════════════════════════════════════════════════════════════════════
annotate("05-preview-results.png", [
    (370, 57,  "A"),   # Source bar
    (760, 220, "B"),   # Step cards (Remove Duplicates / Filter Rows / Standardize Case)
    (1640, 200, "C"),  # Right CONFIG panel (Standardize Case config)
    (350, 490, "D"),   # OUTPUT bar
    (760, 650, "E"),   # Data grid (preview results)
], font)

# ══════════════════════════════════════════════════════════════════════════════
# 06 — Lineage view  (1920 × 823)
# DAG: SOURCE → Remove Duplicates → Filter Rows → Standardize Case
# ══════════════════════════════════════════════════════════════════════════════
annotate("06-lineage-view.png", [
    (1265, 55,  "A"),  # Pipeline / Lineage toggle buttons
    (762,  157, "B"),  # SOURCE node
    (762,  305, "C"),  # Transform step nodes (Remove Duplicates, Filter Rows)
    (762,  460, "D"),  # Standardize Case (selected, blue highlight)
], font)

# ══════════════════════════════════════════════════════════════════════════════
# 07 — Tests panel  (1917 × 832)
# Lineage DAG visible in center; TESTS sub-tab highlighted on right.
# ══════════════════════════════════════════════════════════════════════════════
annotate("07-tests-panel.png", [
    (1422, 79,  "A"),  # TESTS sub-tab (highlighted)
    (1450, 155, "B"),  # Description text (Error / Warn explanation)
    (1535, 167, "C"),  # + Add Test button
    (762,  300, "D"),  # DAG in background (center reference)
], font)

# ══════════════════════════════════════════════════════════════════════════════
# 08 — Schedule modal  (1900 × 823)
# ══════════════════════════════════════════════════════════════════════════════
annotate("08-schedule-modal.png", [
    (820, 310, "A"),   # Quick Presets buttons
    (780, 385, "B"),   # Cron Expression field
    (780, 435, "C"),   # Start active toggle
    (893, 480, "D"),   # Create Schedule button
], font)

print("\nAll done. Open docs/VISUAL_GUIDE.html to review.")
