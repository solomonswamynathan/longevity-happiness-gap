from playwright.sync_api import sync_playwright
import sys
fails, passes = [], []
def check(n, c, d=""):
    (passes if c else fails).append(n + (f"  [{d}]" if d else ""))
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto("http://localhost:8765/", wait_until="networkidle"); pg.wait_for_timeout(1200)
    pg.locator("#verify-open").click(); pg.wait_for_timeout(400)

    # Tab 40 times: focus must NEVER leave the dialog.
    escaped = []
    for i in range(40):
        pg.keyboard.press("Tab"); pg.wait_for_timeout(40)
        inside = pg.evaluate("document.querySelector('.verify-panel').contains(document.activeElement)")
        if not inside:
            escaped.append((i, pg.evaluate("document.activeElement.tagName+'#'+document.activeElement.id")))
    check("40 forward Tabs never escape the dialog", not escaped, str(escaped[:3]))

    # Shift+Tab 40 times likewise.
    escaped_b = []
    for i in range(40):
        pg.keyboard.press("Shift+Tab"); pg.wait_for_timeout(40)
        if not pg.evaluate("document.querySelector('.verify-panel').contains(document.activeElement)"):
            escaped_b.append((i, pg.evaluate("document.activeElement.tagName+'#'+document.activeElement.id")))
    check("40 backward Tabs never escape the dialog", not escaped_b, str(escaped_b[:3]))

    # Every tab reachable by arrow keys, and each renders a non-empty table.
    pg.locator(".verify-tab[tabindex='0']").focus()
    seen = []
    for i in range(7):
        lab = pg.evaluate("document.activeElement.textContent.trim()")
        rows = pg.locator(".vtable tbody tr").count()
        q = pg.inner_text(".verify-quote").strip()
        pop = pg.inner_text(".verify-pop").strip()
        seen.append((lab, rows, len(q), len(pop)))
        pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(300)
    check("all 7 tabs render rows", all(r > 0 for _, r, _, _ in seen), str([(l[:14],r) for l,r,_,_ in seen]))
    check("all 7 tabs state a claim and a population",
          all(cq > 30 and cp > 30 for _, _, cq, cp in seen), str([(cq,cp) for _,_,cq,cp in seen]))
    check("arrow keys wrap through all 7 distinct tabs", len({l for l,_,_,_ in seen}) == 7,
          str(len({l for l,_,_,_ in seen})))

    # CSV export works on every tab.
    bad = []
    for name in ["All countries","The Great Decoupling","Joy vs. suffering","Same lifespan","What explains","The pandemic","The gap by region"]:
        pg.locator(".verify-tab", has_text=name).click(); pg.wait_for_timeout(250)
        try:
            with pg.expect_download(timeout=4000) as dl:
                pg.locator("#verify-csv").click()
            import pathlib
            txt = pathlib.Path(dl.value.path()).read_text()
            lines = [l for l in txt.strip().split("\n") if not l.startswith("#")]
            if len(lines) < 2: bad.append((name, len(lines)))
        except Exception as e:
            bad.append((name, str(e)[:30]))
    check("CSV export works on all 7 tabs", not bad, str(bad))
    b.close()
print(f"\nPASS {len(passes)}  FAIL {len(fails)}")
for f in fails: print("  x", f)
for s in passes: print("  .", s)
sys.exit(1 if fails else 0)
