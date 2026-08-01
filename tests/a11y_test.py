from playwright.sync_api import sync_playwright
import sys

URL = "http://localhost:8765/"
fails, passes = [], []

def check(name, cond, detail=""):
    (passes if cond else fails).append(f"{name}" + (f"  [{detail}]" if detail else ""))

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(1200)

    check("no JS errors on load", not errors, "; ".join(errors[:3]))

    # --- live region + skip link exist
    check("a11y live region present", pg.locator("#a11y-live[aria-live=polite]").count() == 1)
    check("skip link present", pg.locator("a.skip-link").count() == 1)
    check("figure is role=group not role=img",
          pg.get_attribute("#graphic", "role") == "group",
          pg.get_attribute("#graphic", "role"))

    # --- at boot, dots must NOT be tab stops
    tabbable = pg.locator(".dot[tabindex='0']").count()
    check("no dot tab stops before any scene", tabbable == 0, f"found {tabbable}")

    # --- dots carry per-mark labels
    n_labeled = pg.locator(".dot[aria-label]").count()
    n_dots = pg.locator(".dot").count()
    check("every dot has aria-label", n_dots > 0 and n_labeled == n_dots, f"{n_labeled}/{n_dots}")
    if n_dots:
        lab = pg.locator(".dot[aria-label]").first.get_attribute("aria-label")
        check("label carries real numbers",
              "healthy life expectancy" in lab and "happiness" in lab, lab[:70])

    # --- scroll to the first scatter scene
    pg.locator("[data-step=rule]").scroll_into_view_if_needed()
    pg.wait_for_timeout(1400)
    tabbable = pg.locator(".dot[tabindex='0']").count()
    check("exactly one dot tabbable in 'rule' (roving tabindex)", tabbable == 1, f"found {tabbable}")

    # --- keyboard traversal
    pg.locator(".dot[tabindex='0']").focus()
    pg.wait_for_timeout(300)
    first = pg.evaluate("document.activeElement.getAttribute('aria-label')")
    check("focus lands on a dot", bool(first and "healthy life" in (first or "")), (first or "none")[:50])

    live1 = pg.inner_text("#a11y-live")
    check("focus announces the datapoint", "healthy life expectancy" in live1, live1[:60])

    # focus ring actually rendered?
    ring = pg.evaluate("""() => {
      const el = document.activeElement;
      const s = getComputedStyle(el);
      return {stroke: s.stroke, sw: s.strokeWidth, filter: s.filter};
    }""")
    check("focused dot has a visible ring",
          ring["stroke"] in ("rgb(255, 255, 255)",) and ring["sw"] not in ("0px", ""),
          str(ring))

    pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(250)
    second = pg.evaluate("document.activeElement.getAttribute('aria-label')")
    check("ArrowRight moves to a different country", second != first, f"{(second or '')[:40]}")
    check("still exactly one tab stop after arrow",
          pg.locator(".dot[tabindex='0']").count() == 1)

    pg.keyboard.press("Home")
    pg.wait_for_timeout(250)
    home = pg.evaluate("document.activeElement.getAttribute('aria-label')")
    pg.keyboard.press("End")
    pg.wait_for_timeout(250)
    end = pg.evaluate("document.activeElement.getAttribute('aria-label')")
    check("Home/End jump to opposite extremes", home != end, f"{(home or '')[:22]} vs {(end or '')[:22]}")

    # Home should be the LOWEST life expectancy, End the highest
    import re
    def yrs(s):
        m = re.search(r"expectancy ([\d.]+) years", s or "")
        return float(m.group(1)) if m else None
    check("traversal ordered by life expectancy", (yrs(home) or 99) < (yrs(end) or 0),
          f"{yrs(home)} < {yrs(end)}")

    # Enter selects and syncs the picker
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(400)
    live2 = pg.inner_text("#a11y-live")
    check("Enter announces a selection", "Selected" in live2, live2[:50])
    sel = pg.input_value("#country-select")
    check("Enter syncs the country picker", bool(sel), sel)

    # --- dots must leave the tab order in map scene
    pg.locator("[data-step=map]").scroll_into_view_if_needed()
    pg.wait_for_timeout(1800)
    t_map = pg.locator(".dot[tabindex='0']").count()
    hidden = pg.locator(".dot[aria-hidden='true']").count()
    check("no dot tab stops in 'map' scene (no keyboard trap)", t_map == 0, f"found {t_map}")
    check("hidden dots marked aria-hidden", hidden == n_dots, f"{hidden}/{n_dots}")

    # --- figure label retitles per scene
    lab_map = pg.get_attribute("#graphic", "aria-label")
    check("figure aria-label updates per scene",
          lab_map and "geography" in lab_map.lower() or "map" in (lab_map or "").lower(),
          (lab_map or "")[:70])

    # --- returning to a scatter scene restores reachability
    pg.locator("[data-step=explore]").scroll_into_view_if_needed()
    pg.wait_for_timeout(1800)
    t_exp = pg.locator(".dot[tabindex='0']").count()
    check("tab stop restored in 'explore'", t_exp == 1, f"found {t_exp}")

    # --- resize must keep tab stops consistent with whatever scene ends up
    #     active (a reflow can legitimately move Scrollama to a new step).
    DOTLESS = {"map", "decouple", "why", "affect", "covid"}
    pg.locator("[data-step=map]").scroll_into_view_if_needed()
    pg.wait_for_timeout(1500)
    pg.set_viewport_size({"width": 1100, "height": 800})
    pg.wait_for_timeout(1500)
    active = pg.evaluate("document.querySelector('.step.is-active')?.dataset.step")
    t_after = pg.locator(".dot[tabindex='0']").count()
    expected = 0 if active in DOTLESS else 1
    check("after resize, tab stops match the active scene",
          t_after == expected, f"scene={active} stops={t_after} expected={expected}")

    # and the invariant that really matters: a tabbable dot is never invisible
    bad = pg.evaluate("""() => [...document.querySelectorAll(".dot[tabindex='0']")]
        .filter(d => parseFloat(d.getAttribute('r')) < 1
                  || parseFloat(d.getAttribute('opacity')) < 0.05).length""")
    check("no invisible dot is ever focusable", bad == 0, f"{bad} invisible tab stops")

    check("no JS errors overall", not errors, "; ".join(errors[:3]))
    b.close()

print(f"\n{'='*58}\nPASS {len(passes)}   FAIL {len(fails)}\n{'='*58}")
for f in fails:  print("  ✗", f)
for s in passes: print("  ✓", s)
sys.exit(1 if fails else 0)
