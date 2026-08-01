"""Verification-tables modal: keyboard, ARIA, sorting, CSV, and claim/number
consistency against the story copy in index.html."""
from playwright.sync_api import sync_playwright
import sys, re, json, pathlib

URL = "http://localhost:8765/"
WEB = pathlib.Path("/Users/ssolom/DataGripProjects/vizcon2026/web")
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

    # ---- trigger present and modal starts closed
    check("verify trigger present", pg.locator("#verify-open").count() == 1)
    check("modal hidden at boot", pg.locator("#verify").is_hidden())
    check("tabs built", pg.locator(".verify-tab").count() == 7,
          f"{pg.locator('.verify-tab').count()} tabs")

    # ---- open via keyboard (click the real button)
    pg.locator("#verify-open").click()
    pg.wait_for_timeout(400)
    check("modal opens", pg.locator("#verify").is_visible())
    check("dialog has aria-modal", pg.get_attribute(".verify-panel", "aria-modal") == "true")
    check("dialog labelled by its title",
          pg.get_attribute(".verify-panel", "aria-labelledby") == "verify-title")
    check("focus moves into the dialog",
          pg.evaluate("document.querySelector('.verify-panel').contains(document.activeElement)"))
    live = pg.inner_text("#a11y-live")
    check("opening is announced", "Verification tables open" in live, live[:50])

    # ---- background must not scroll behind the modal
    check("body scroll locked", pg.evaluate(
        "getComputedStyle(document.body).overflow") == "hidden")

    # ---- roving tabindex on the tablist
    check("exactly one tab is a tab stop",
          pg.locator(".verify-tab[tabindex='0']").count() == 1)
    check("active tab is aria-selected",
          pg.locator(".verify-tab[aria-selected='true']").count() == 1)

    # ---- first view renders all 136 rows
    rows = pg.locator(".vtable tbody tr").count()
    check("'All countries' shows every country", rows == 136, f"{rows} rows")
    check("row count is stated", "136 rows" in pg.inner_text(".verify-count"),
          pg.inner_text(".verify-count"))

    # ---- arrow keys move between tabs
    pg.locator(".verify-tab[tabindex='0']").focus()
    pg.keyboard.press("ArrowRight")
    pg.wait_for_timeout(350)
    t2 = pg.evaluate("document.activeElement.textContent.trim()")
    check("ArrowRight switches tab", "Decoupling" in t2, t2[:40])
    check("switched tab is the selected one",
          pg.evaluate("document.activeElement.getAttribute('aria-selected')") == "true")
    dec_rows = pg.locator(".vtable tbody tr").count()
    check("Decoupling tab shows 32 countries", dec_rows == 32, f"{dec_rows} rows")

    quote = pg.inner_text(".verify-quote")
    check("tab shows the story's exact claim", "32 countries" in quote, quote[:60])
    pop = pg.inner_text(".verify-pop")
    check("tab states its population", "linear fit" in pop and "6 observed" in pop, pop[:70])

    pg.keyboard.press("End")
    pg.wait_for_timeout(300)
    check("End jumps to the last tab",
          pg.evaluate("document.activeElement.textContent").strip().startswith("The gap by region"),
          pg.evaluate("document.activeElement.textContent"))
    pg.keyboard.press("Home")
    pg.wait_for_timeout(300)

    # ---- affect tab must disclose the population ambiguity
    pg.locator(".verify-tab", has_text="Joy vs. suffering").click()
    pg.wait_for_timeout(350)
    apop = pg.inner_text(".verify-pop")
    check("affect tab discloses BOTH populations",
          "-0.422" in apop.replace("−", "-") and "141" in apop and "132" in apop, apop[:110])
    aq = pg.inner_text(".verify-quote").replace("−", "-")
    check("affect claim matches the story", "-0.49" in aq and "+0.20" in aq, aq[:60])

    # ---- factors tab must agree with the story's ~20%
    pg.locator(".verify-tab", has_text="What explains").click()
    pg.wait_for_timeout(350)
    ftxt = pg.inner_text(".vtable")
    m = re.findall(r"([+-]\d+)%", ftxt)
    check("factor lift is near the story's 20%",
          any(15 <= abs(int(x)) <= 30 for x in m[:2]), f"lifts={m[:3]}")
    r_freedom = pg.evaluate("""() => {
      const tr = [...document.querySelectorAll('.vtable tbody tr')]
        .find(t => t.textContent.includes('Freedom'));
      return tr ? tr.children[1].textContent.trim() : null; }""")
    check("freedom r matches the story's +0.53", r_freedom == "0.529", str(r_freedom))

    # ---- sorting
    pg.locator(".verify-tab", has_text="All countries").click()
    pg.wait_for_timeout(350)
    def col0():
        return pg.evaluate("""() => [...document.querySelectorAll('.vtable tbody tr')]
            .slice(0,3).map(t => t.children[0].textContent.trim())""")
    before = col0()
    pg.locator(".th-sort[data-col='0']").click()
    pg.wait_for_timeout(350)
    after = col0()
    check("clicking a header re-sorts", before != after, f"{before[:2]} -> {after[:2]}")
    check("aria-sort is set on the sorted column",
          pg.locator(".vtable th[aria-sort='descending']").count() == 1)
    check("focus stays on the header after sort",
          pg.evaluate("document.activeElement.classList.contains('th-sort')"))
    sorted_live = pg.inner_text("#a11y-live")
    check("sort is announced", "Sorted by" in sorted_live, sorted_live[:50])

    pg.locator(".th-sort[data-col='0']").click()
    pg.wait_for_timeout(350)
    check("second click flips direction",
          pg.locator(".vtable th[aria-sort='ascending']").count() == 1)
    asc = col0()
    check("ascending sort is alphabetical", asc == sorted(asc), str(asc))

    # numeric column must sort numerically, not lexically
    pg.locator(".th-sort[data-col='2']").click()
    pg.wait_for_timeout(350)
    nums = pg.evaluate("""() => [...document.querySelectorAll('.vtable tbody tr')]
        .slice(0,5).map(t => parseFloat(t.children[2].textContent))""")
    check("numeric column sorts numerically",
          nums == sorted(nums, reverse=True), str(nums))

    # ---- focus trap: Tab from the last focusable wraps to the first
    trap = pg.evaluate("""() => {
      const f = [...document.querySelectorAll('.verify-panel button, .verify-panel [tabindex]:not([tabindex="-1"])')];
      return f.length; }""")
    check("dialog has focusable controls to trap", trap > 5, f"{trap} focusables")

    # ---- CSV download
    with pg.expect_download() as dl:
        pg.locator("#verify-csv").click()
    d = dl.value
    check("CSV downloads", d.suggested_filename.endswith(".csv"), d.suggested_filename)
    path = d.path()
    body = pathlib.Path(path).read_text()
    check("CSV carries the claim as a comment", body.startswith("# "), body[:40])
    check("CSV states the population", "\n# n = 136" in body or "n = 136" in body.split("\n")[1],
          body.split("\n")[1][:60])
    data_lines = [l for l in body.strip().split("\n") if not l.startswith("#")]
    check("CSV has a header + 136 rows", len(data_lines) == 137, f"{len(data_lines)} lines")
    check("CSV quotes fields containing commas",
          all(l.count(",") == 6 or '"' in l for l in data_lines[1:]),
          "unquoted comma in a field")

    # ---- Escape closes and restores focus
    pg.locator(".verify-tab[tabindex='0']").focus()
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(400)
    check("Escape closes the modal", pg.locator("#verify").is_hidden())
    check("focus returns to the trigger",
          pg.evaluate("document.activeElement.id") == "verify-open",
          pg.evaluate("document.activeElement.id"))
    check("body scroll unlocked", pg.evaluate(
        "getComputedStyle(document.body).overflow") != "hidden")

    # ---- backdrop click closes too
    pg.locator("#verify-open").click()
    pg.wait_for_timeout(300)
    # Scoped to #verify: the Ask panel reuses .verify-backdrop, so the bare
    # class matches two elements and Playwright's strict mode rejects it.
    pg.locator("#verify .verify-backdrop").click(position={"x": 5, "y": 5})
    pg.wait_for_timeout(300)
    check("backdrop click closes", pg.locator("#verify").is_hidden())

    # ---- the story's scatter keyboard nav still works afterwards
    pg.locator("[data-step=rule]").scroll_into_view_if_needed()
    pg.wait_for_timeout(1400)
    check("scatter tab stop intact after modal use",
          pg.locator(".dot[tabindex='0']").count() == 1,
          f"{pg.locator('.dot[tabindex=\"0\"]').count()}")

    check("no JS errors overall", not errors, "; ".join(errors[:3]))
    b.close()

print(f"\n{'='*60}\nPASS {len(passes)}   FAIL {len(fails)}\n{'='*60}")
for f in fails:  print("  x", f)
for s in passes: print("  .", s)
sys.exit(1 if fails else 0)
