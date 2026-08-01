#!/usr/bin/env python3
"""Verify the two claims in README.md's Accessibility section that are pure math.

  1. The diverging palette's two poles stay ΔE >= 66 apart (CIE76) under
     simulated protanopia, deuteranopia and tritanopia.
  2. Text over the closing photograph passes WCAG AA, measured through the
     ACTUAL render pipeline -- SVG duotone, then opacity 0.4 over --bg-0, then
     the radial vignette -- not against the raw image.

Claim 2 cannot be measured from the source JPEG: the duotone flattens luminance
and remaps it, the 0.4 opacity composite lifts the black floor, and the vignette
darkens the edges. So it is measured from the live page, with the text nodes
hidden -- otherwise the sample lands on the glyphs and you end up computing the
contrast of the text against itself. Requires a local server and Playwright:

    python3 -m http.server 8765 --directory web &
    python3 tests/cvd_contrast_check.py --live

The palette check runs with no dependencies beyond the standard library, so
`python3 tests/cvd_contrast_check.py` alone always works.

CVD simulation uses Machado, Oliveira & Fernandes (2009), "A Physiologically-
based Model for Simulation of Color Vision Deficiency", IEEE TVCG 15(6).
Matrices are the severity-1.0 (dichromatic) row of their published tables.
"""

import argparse
import sys

# --- the palette under test -------------------------------------------------
# Must match --over / --under in web/css/style.css and PAL in web/js/main.js.
OVER = "#3987e5"   # blue  = happier than expected
UNDER = "#e66767"  # red   = less happy than expected

# --- Machado et al. (2009), severity 1.0 ------------------------------------
CVD = {
    "protanopia": (
        (0.152286, 1.052583, -0.204868),
        (0.114503, 0.786281, 0.099216),
        (-0.003882, -0.048116, 1.051998),
    ),
    "deuteranopia": (
        (0.367322, 0.860646, -0.227968),
        (0.280085, 0.672501, 0.047413),
        (-0.011820, 0.042940, 0.968881),
    ),
    "tritanopia": (
        (1.255528, -0.076749, -0.178779),
        (-0.078411, 0.930809, 0.147602),
        (0.004733, 0.691367, 0.303900),
    ),
}

FAIL = []


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{('  — ' + detail) if detail else ''}")
    if not ok:
        FAIL.append(label)


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def apply_matrix(rgb, m):
    """Machado's matrices operate on LINEAR RGB, so linearize first and re-encode
    after. Applying them to gamma-encoded sRGB is a common shortcut that shifts
    the result enough to matter at these deltas."""
    lin = [srgb_to_linear(c / 255) for c in rgb]
    out = []
    for row in m:
        v = sum(row[i] * lin[i] for i in range(3))
        out.append(round(max(0.0, min(1.0, linear_to_srgb(v))) * 255))
    return tuple(out)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear_to_srgb(c):
    return c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def rgb_to_lab(rgb):
    """sRGB -> CIE L*a*b* via XYZ, D65 white point."""
    r, g, b = (srgb_to_linear(c / 255) for c in rgb)
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.00000
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else (7.787 * t) + (16 / 116)

    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def delta_e76(a, b):
    return sum((x - y) ** 2 for x, y in zip(rgb_to_lab(a), rgb_to_lab(b))) ** 0.5


def rel_luminance(rgb):
    r, g, b = (srgb_to_linear(c / 255) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(fg, bg):
    a, b = rel_luminance(fg), rel_luminance(bg)
    lo, hi = sorted((a, b))
    return (hi + 0.05) / (lo + 0.05)


# --- claim 1: palette separation -------------------------------------------

def check_palette():
    print("\nPalette separation (CIE76 ΔE between the two poles)")
    o, u = hex_rgb(OVER), hex_rgb(UNDER)

    normal = delta_e76(o, u)
    check("normal vision ΔE >= 66", normal >= 66, f"ΔE {normal:.1f}")

    worst, worst_name = float("inf"), None
    for name, m in CVD.items():
        so, su = apply_matrix(o, m), apply_matrix(u, m)
        d = delta_e76(so, su)
        check(f"{name} ΔE >= 66", d >= 66,
              f"ΔE {d:.1f}  ({rgb_hex(so)} vs {rgb_hex(su)})")
        if d < worst:
            worst, worst_name = d, name

    print(f"\n  worst case: {worst_name}, ΔE {worst:.1f}")
    # The README quotes this exact pair. If the palette is ever retuned, this is
    # the assertion that catches the doc going stale.
    check("README's quoted worst case is protanopia", worst_name == "protanopia")
    check("README's quoted ΔE 66.6 still holds", abs(worst - 66.6) < 0.5,
          f"computed {worst:.1f}, README says 66.6")
    return worst


def rgb_hex(rgb):
    return "#" + "".join(f"{c:02x}" for c in rgb)


# --- claim 2: text contrast over the rendered pipeline ---------------------
# Grouped by the section that has to be scrolled into view, because the imagery
# only settles once its scene is active.
#
# (selector, fg, WCAG target). 4.5:1 is AA for body text. Both titles render well
# above 24px, so AA would allow them 3.0:1 -- they are held to 4.5:1 anyway
# rather than claiming a pass on the large-text exemption.
#
# fg is either a single hex, or ("gradient", top_hex, bottom_hex) for text
# painted with a vertical gradient through background-clip. The distinction
# matters: measuring gradient text as "darkest stop vs brightest pixel anywhere
# in the box" scores .hero-title at 3.44:1 and reports a failure that isn't
# real -- the darkest stop is at the BOTTOM of the box, where the photo is dark,
# while the brightest background is at the TOP, where the type is near-white.
# Those two never overlap. Gradient text is therefore measured row by row,
# pairing each row's actual interpolated colour with that row's own brightest
# background pixel, and the worst row wins.
SECTIONS = [
    (".hero", [
        (".hero-title", ("gradient", "#ffffff", "#cdd6e6"), 4.5),
        (".hero-sub", "#b9bdc7", 4.5),
    ]),
    (".close", [
        (".close-title", "#b9c6dc", 4.5),
        (".close-body", "#b9bdc7", 4.5),
    ]),
]

URL = "http://localhost:8765/"


def check_live():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("\nSKIP contrast checks: playwright not installed")
        print("  pip install playwright pillow && playwright install chromium")
        return
    try:
        from PIL import Image
    except ImportError:
        print("\nSKIP contrast checks: Pillow not installed (pip install pillow)")
        return

    print(f"\nText contrast through duotone -> opacity -> vignette ({URL})")

    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        try:
            pg.goto(URL, wait_until="networkidle")
        except Exception as e:
            print(f"  SKIP: no server at {URL} ({type(e).__name__})")
            print("  start one: python3 -m http.server 8765 --directory web")
            b.close()
            return
        pg.wait_for_timeout(1200)

        for section, blocks in SECTIONS:
            pg.locator(section).first.scroll_into_view_if_needed()
            pg.wait_for_timeout(1500)  # let parallax / Ken Burns settle

            boxes = {sel: pg.locator(sel).first.bounding_box()
                     for sel, _, _ in blocks}

            # Hide the type, keep everything behind it. Sampling with the text
            # visible measures the glyphs themselves -- the contrast of the text
            # against the text, which is meaningless and reads as a failure.
            sels = ", ".join(sel for sel, _, _ in blocks)
            pg.eval_on_selector_all(
                sels, "els => els.forEach(e => e.style.visibility = 'hidden')")
            pg.wait_for_timeout(250)
            pg.screenshot(path="/tmp/_cvd_bg.png")
            pg.eval_on_selector_all(
                sels, "els => els.forEach(e => e.style.visibility = '')")

            measure(Image.open("/tmp/_cvd_bg.png").convert("RGB"), boxes, blocks)

        b.close()


def measure(img, boxes, blocks):
    px = img.load()
    w, h = img.size
    for sel, fg, target in blocks:
        box = boxes[sel]
        if not box:
            check(f"{sel} located on page", False, "no bounding box")
            continue
        x0, y0 = max(0, int(box["x"])), max(0, int(box["y"]))
        x1 = min(w, int(box["x"] + box["width"]))
        y1 = min(h, int(box["y"] + box["height"]))
        if x1 <= x0 or y1 <= y0:
            check(f"{sel} box is on screen", False, f"{box}")
            continue

        gradient = isinstance(fg, tuple) and fg[0] == "gradient"
        top = hex_rgb(fg[1]) if gradient else None
        bot = hex_rgb(fg[2]) if gradient else None
        flat = None if gradient else hex_rgb(fg)

        # Worst case per row: brightest background pixel in that row, against the
        # text colour that actually lands on that row. Brightest rather than mean,
        # because the mean hides a blown-out highlight sitting under one word.
        worst = (float("inf"), None, None)
        for y in range(y0, y1, 2):
            row_px, row_lum = None, -1.0
            for x in range(x0, x1, 2):
                p = px[x, y]
                lum = rel_luminance(p)
                if lum > row_lum:
                    row_lum, row_px = lum, p
            if gradient:
                t = (y - y0) / max(1, y1 - y0)
                cur = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
            else:
                cur = flat
            r = contrast_ratio(cur, row_px)
            if r < worst[0]:
                worst = (r, cur, row_px)

        ratio, fg_used, bg_used = worst
        detail = f"{ratio:.2f}:1 (worst row: {rgb_hex(fg_used)} on {rgb_hex(bg_used)})"
        check(f"{sel} >= {target}:1 AA", ratio >= target, detail)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true",
                    help=f"also measure text contrast against {URL}")
    args = ap.parse_args()

    check_palette()
    if args.live:
        check_live()
    else:
        print("\n(no --live given; skipping rendered-contrast checks)")

    print()
    if FAIL:
        print(f"{len(FAIL)} FAILED: " + ", ".join(FAIL))
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
