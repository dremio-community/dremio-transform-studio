"""
Generate a custom Transform Studio .icns icon.
Teal gradient background + Dremio narwhal + data constellation + TS badge.
Run: python3 build/make_icon.py
"""
import os, math, subprocess, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE   = 1024
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT    = os.path.join(SCRIPT_DIR, "icon.iconset")
ICNS   = os.path.join(SCRIPT_DIR, "icon.icns")

# Narwhal logo source
NARWHAL_SRC = "/Users/mark/Downloads/dremio_logo.jpeg"

# ── Colors ────────────────────────────────────────────────────────────────────
BG_TOP    = (12,  68,  80)    # dark teal
BG_BOT    = (18,  95, 112)    # medium teal
VIGNETTE  = (5,   30,  38)    # very dark for vignette edges


def rounded_rect_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size-1, size-1], radius=radius, fill=255)
    return mask


def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)

    # ── Background gradient (dark teal top → medium teal bottom) ─────────────
    for y in range(size):
        t = y / size
        r = int(BG_TOP[0] + t * (BG_BOT[0] - BG_TOP[0]))
        g = int(BG_TOP[1] + t * (BG_BOT[1] - BG_TOP[1]))
        b = int(BG_TOP[2] + t * (BG_BOT[2] - BG_TOP[2]))
        d.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Apply rounded-rect mask
    radius = int(size * 0.22)
    mask   = rounded_rect_mask(size, radius)
    img.putalpha(mask)

    # ── Dark vignette edges ───────────────────────────────────────────────────
    vignette = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for step, alpha in [(int(size*0.45), 80), (int(size*0.35), 60), (int(size*0.25), 40)]:
        vd = ImageDraw.Draw(vignette)
        vd.ellipse([size//2 - step, size//2 - step, size//2 + step, size//2 + step],
                   fill=(VIGNETTE[0], VIGNETTE[1], VIGNETTE[2], 0))
    # Radial vignette via blur
    vig_ring = Image.new("RGBA", (size, size), (VIGNETTE[0], VIGNETTE[1], VIGNETTE[2], 140))
    vig_mask = Image.new("L", (size, size), 0)
    for r2, a2 in [(int(size*0.48), 255), (int(size*0.40), 200), (int(size*0.30), 100), (int(size*0.20), 0)]:
        ImageDraw.Draw(vig_mask).ellipse(
            [size//2 - r2, size//2 - r2, size//2 + r2, size//2 + r2],
            fill=255 - a2)
    vig_mask = vig_mask.filter(ImageFilter.GaussianBlur(int(size * 0.06)))
    vig_ring.putalpha(vig_mask)
    img = Image.alpha_composite(img, vig_ring)

    # ── Data constellation (dots + connecting lines) ──────────────────────────
    rng = random.Random(42)
    dot_positions = []
    for _ in range(38):
        # Scatter across the canvas with some margin
        x = int(rng.uniform(size * 0.06, size * 0.94))
        y = int(rng.uniform(size * 0.06, size * 0.88))
        dot_positions.append((x, y))

    star_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(star_layer)

    # Lines between nearby dots
    connected = set()
    for i, (x1, y1) in enumerate(dot_positions):
        for j, (x2, y2) in enumerate(dot_positions):
            if i >= j:
                continue
            dist = math.hypot(x2 - x1, y2 - y1)
            if dist < size * 0.22 and len(connected) < 14:
                sd.line([(x1, y1), (x2, y2)],
                        fill=(255, 255, 255, 28), width=max(1, size // 512))
                connected.add((i, j))

    # Dots
    for x, y in dot_positions:
        r_dot = max(2, size // 200)
        sd.ellipse([x - r_dot, y - r_dot, x + r_dot, y + r_dot],
                   fill=(255, 255, 255, 90))

    star_layer = star_layer.filter(ImageFilter.GaussianBlur(max(1, size // 400)))
    img = Image.alpha_composite(img, star_layer)

    # ── White centre glow behind narwhal ─────────────────────────────────────
    glow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    cx, cy = size // 2, int(size * 0.44)
    for glow_r2, glow_a2 in [(int(size*0.32), 18), (int(size*0.24), 28), (int(size*0.16), 38)]:
        gd.ellipse([cx - glow_r2, cy - glow_r2, cx + glow_r2, cy + glow_r2],
                   fill=(255, 255, 255, glow_a2))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(int(size * 0.06)))
    img = Image.alpha_composite(img, glow_layer)

    # ── Narwhal logo ──────────────────────────────────────────────────────────
    nw_raw = Image.open(NARWHAL_SRC).convert("RGBA")

    # Remove white background
    pixels = nw_raw.load()
    nw_w, nw_h = nw_raw.size
    for py in range(nw_h):
        for px in range(nw_w):
            r2, g2, b2, a2 = pixels[px, py]
            if r2 > 225 and g2 > 225 and b2 > 225:
                pixels[px, py] = (r2, g2, b2, 0)

    # Convert narwhal to a clean solid teal silhouette (removes spots/shading)
    silhouette = Image.new("RGBA", (nw_w, nw_h), (0, 0, 0, 0))
    sil_pixels = silhouette.load()
    src_pixels = nw_raw.load()
    # Use a two-tone fill: body = light teal, horn = white
    for py in range(nw_h):
        for px in range(nw_w):
            r2, g2, b2, a2 = src_pixels[px, py]
            if a2 > 30:  # visible pixel — part of the narwhal
                # Horn area: narrow band near top-left (horn is mostly in upper-left region)
                if px < nw_w * 0.25 and py < nw_h * 0.45:
                    # Horn — white/light
                    sil_pixels[px, py] = (220, 240, 245, a2)
                else:
                    # Body — bright teal-white
                    sil_pixels[px, py] = (140, 215, 230, a2)

    # Light inner highlight pass to give dimension
    for py in range(nw_h):
        for px in range(nw_w):
            r2, g2, b2, a2 = sil_pixels[px, py]
            if a2 > 30:
                # Top half gets slightly lighter
                t_factor = 1.0 - (py / nw_h) * 0.3
                new_r = min(255, int(r2 * t_factor))
                new_g = min(255, int(g2 * t_factor))
                new_b = min(255, int(b2 * t_factor))
                sil_pixels[px, py] = (new_r, new_g, new_b, a2)

    # ── Smooth edges: blur + threshold the alpha channel ─────────────────────
    # Split into RGB and alpha, blur the alpha slightly, then recombine.
    # This anti-aliases the jagged pixel boundary without blurring the fill.
    r_ch, g_ch, b_ch, a_ch = silhouette.split()
    a_smooth = a_ch.filter(ImageFilter.GaussianBlur(2))
    silhouette = Image.merge("RGBA", (r_ch, g_ch, b_ch, a_smooth))

    nw_size = int(size * 0.82)
    aspect  = nw_raw.width / nw_raw.height
    nw_h2   = int(nw_size / aspect)
    # Upscale source 2× before resizing to final size — reduces aliasing further
    sil_big = silhouette.resize((nw_w * 2, nw_h * 2), Image.LANCZOS)
    silhouette = sil_big.resize((nw_size, nw_h2), Image.LANCZOS)

    nw_x = (size - nw_size) // 2
    nw_y = int(size * 0.04)
    nw_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    nw_layer.paste(silhouette, (nw_x, nw_y), silhouette)
    img = Image.alpha_composite(img, nw_layer)

    # ── "TS" badge — mid-right area ───────────────────────────────────────────
    ts_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tsd = ImageDraw.Draw(ts_layer)
    ts_x = int(size * 0.74)
    ts_y = int(size * 0.46)
    ts_font_size = int(size * 0.095)

    # Try to load a bold font
    ts_font = None
    for font_path in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSDisplay-Bold.otf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]:
        try:
            ts_font = ImageFont.truetype(font_path, ts_font_size)
            break
        except Exception:
            pass
    if ts_font is None:
        ts_font = ImageFont.load_default()

    ts_text = "TS"
    try:
        bb = ts_font.getbbox(ts_text)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
    except Exception:
        tw, th = ts_font_size * len(ts_text), ts_font_size

    # Shadow
    tsd.text((ts_x - tw//2 + 3, ts_y - th//2 + 3), ts_text,
             fill=(0, 0, 0, 100), font=ts_font)
    # White text
    tsd.text((ts_x - tw//2, ts_y - th//2), ts_text,
             fill=(255, 255, 255, 230), font=ts_font)
    ts_layer = ts_layer.filter(ImageFilter.GaussianBlur(max(1, size // 512)))
    img = Image.alpha_composite(img, ts_layer)

    # ── "TRANSFORM STUDIO" text — bottom centre ───────────────────────────────
    text_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    txd = ImageDraw.Draw(text_layer)

    label    = "TRANSFORM STUDIO"
    # Start with a font size and shrink until the text fits within 90% of width
    max_text_w = int(size * 0.90)
    font_size  = int(size * 0.058)  # start smaller than before

    label_font = None
    for font_path in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/SFNSDisplay-Bold.otf",
    ]:
        try:
            label_font = ImageFont.truetype(font_path, font_size)
            break
        except Exception:
            pass
    if label_font is None:
        label_font = ImageFont.load_default()

    # Shrink font until text fits
    while font_size > 20:
        try:
            bb = label_font.getbbox(label)
            tw2 = bb[2] - bb[0]
        except Exception:
            tw2 = font_size * len(label)
        if tw2 <= max_text_w:
            break
        font_size -= 2
        for font_path in [
            "/System/Library/Fonts/Helvetica.ttc",
            "/Library/Fonts/Arial Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        ]:
            try:
                label_font = ImageFont.truetype(font_path, font_size)
                break
            except Exception:
                pass

    try:
        bb    = label_font.getbbox(label)
        tw2   = bb[2] - bb[0]
        th2   = bb[3] - bb[1]
        base  = bb[1]
    except Exception:
        tw2, th2, base = font_size * len(label), font_size, 0

    text_x = (size - tw2) // 2
    text_y = int(size * 0.875) - th2 // 2

    # Dark shadow glow
    for sx, sy in [(-2,2),(0,2),(2,2),(-2,0),(2,0),(-2,-2),(0,-2),(2,-2)]:
        txd.text((text_x + sx*2, text_y - base + sy*2), label,
                 fill=(0, 0, 0, 80), font=label_font)
    # White text
    txd.text((text_x, text_y - base), label,
             fill=(255, 255, 255, 230), font=label_font)

    text_layer = text_layer.filter(ImageFilter.GaussianBlur(max(1, size // 600)))
    img = Image.alpha_composite(img, text_layer)

    # ── Re-apply rounded mask ─────────────────────────────────────────────────
    final_mask = rounded_rect_mask(size, radius)
    img_out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img_out.paste(img, mask=final_mask)

    return img_out


# ── Build iconset ─────────────────────────────────────────────────────────────
os.makedirs(OUT, exist_ok=True)

SIZES = [16, 32, 64, 128, 256, 512, 1024]
for sz in SIZES:
    icon = make_icon(SIZE).resize((sz, sz), Image.LANCZOS)
    icon.save(os.path.join(OUT, f"icon_{sz}x{sz}.png"))
    if sz <= 512:
        icon2x = make_icon(SIZE).resize((sz*2, sz*2), Image.LANCZOS)
        icon2x.save(os.path.join(OUT, f"icon_{sz}x{sz}@2x.png"))
    print(f"  {sz}px ✓")

# ── iconutil → .icns ──────────────────────────────────────────────────────────
subprocess.run(["iconutil", "-c", "icns", OUT, "-o", ICNS], check=True)
print(f"\n✅  Icon saved to {ICNS}")

# Also save a 512px PNG preview
preview = make_icon(512)
preview.save("/Users/mark/Desktop/icon_preview.png")
print("✅  Preview PNG saved to ~/Desktop/icon_preview.png")
