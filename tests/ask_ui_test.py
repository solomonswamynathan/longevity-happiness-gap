from playwright.sync_api import sync_playwright
import sys
fails, passes = [], []
def check(n,c,d=""): (passes if c else fails).append(n+(f"  [{d}]" if d else ""))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1440,"height":900})
    errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.goto("http://localhost:8765/", wait_until="networkidle"); pg.wait_for_timeout(1400)

    check("ask trigger present", pg.locator("#ask-open").count()==1)
    check("ask modal hidden at boot", pg.locator("#ask").is_hidden())

    pg.locator("#ask-open").click(); pg.wait_for_timeout(400)
    check("modal opens", pg.locator("#ask").is_visible())
    check("aria-modal set", pg.get_attribute(".ask-panel","aria-modal")=="true")
    check("focus goes to the input", pg.evaluate("document.activeElement.id")=="ask-input")
    check("disclosure is visible, not buried",
          "not a language model" in pg.inner_text(".ask-disclosure").lower(),
          pg.inner_text(".ask-disclosure")[:60])
    check("log is a live region", pg.get_attribute("#ask-log","aria-live")=="polite")
    check("greeting present", len(pg.inner_text("#ask-log")) > 100)
    check("opener chips offered", pg.locator(".ask-chip").count() >= 4,
          f"{pg.locator('.ask-chip').count()}")

    # type a question
    pg.fill("#ask-input", "Why is Hong Kong an under-performer?")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    log = pg.inner_text("#ask-log")
    check("question echoed", "Hong Kong an under-performer" in log)
    check("answer rendered", "5.31" in log or "77.3" in log, log[-200:])
    check("arithmetic shown", pg.locator(".ask-math").count() >= 1)
    check("supporting table rendered", pg.locator(".ask-table table").count() >= 1)
    check("input cleared after submit", pg.input_value("#ask-input")=="")
    check("answer announced to SR", "Answered" in pg.inner_text("#a11y-live"),
          pg.inner_text("#a11y-live")[:60])

    # follow-up chip works
    n_before = pg.locator(".ask-turn").count()
    pg.locator(".ask-chip").last.click(); pg.wait_for_timeout(500)
    check("follow-up chip asks a question", pg.locator(".ask-turn").count() > n_before,
          f"{n_before} -> {pg.locator('.ask-turn').count()}")

    # empty submit is a no-op
    n = pg.locator(".ask-turn").count()
    pg.fill("#ask-input",""); pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
    check("empty submit ignored", pg.locator(".ask-turn").count()==n)

    # XSS: script tag in the question must not execute or inject
    pg.fill("#ask-input", "<img src=x onerror=window.__pwned=1><script>window.__pwned=1</script>")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    check("user input is escaped, not injected",
          pg.evaluate("window.__pwned === undefined"))
    check("no stray img/script element from input",
          pg.evaluate("!document.querySelector('#ask-log img, #ask-log script')"))

    # scrolled to newest
    check("log scrolls to newest turn",
          pg.evaluate("""() => {const l=document.getElementById('ask-log');
                        return l.scrollHeight - l.scrollTop - l.clientHeight < 60;}"""))

    # focus trap
    esc=[]
    for i in range(30):
        pg.keyboard.press("Tab"); pg.wait_for_timeout(30)
        if not pg.evaluate("document.querySelector('.ask-panel').contains(document.activeElement)"):
            esc.append(pg.evaluate("document.activeElement.tagName+'#'+document.activeElement.id"))
    check("focus never leaves the ask dialog", not esc, str(esc[:3]))

    # Escape closes + restores focus
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
    check("Escape closes", pg.locator("#ask").is_hidden())
    check("focus restored to trigger", pg.evaluate("document.activeElement.id")=="ask-open",
          pg.evaluate("document.activeElement.id"))
    check("scroll unlocked", pg.evaluate("getComputedStyle(document.body).overflow")!="hidden")

    # the two modals don't interfere
    pg.locator("#verify-open").click(); pg.wait_for_timeout(400)
    check("verify still opens after ask", pg.locator("#verify").is_visible())
    check("ask stays closed", pg.locator("#ask").is_hidden())
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # scatter keyboard nav still intact
    pg.locator("[data-step=rule]").scroll_into_view_if_needed(); pg.wait_for_timeout(1400)
    check("scatter tab stop intact", pg.locator(".dot[tabindex='0']").count()==1)

    check("no JS errors overall", not errs, "; ".join(errs[:2]))
    b.close()
print(f"\n{'='*58}\nPASS {len(passes)}  FAIL {len(fails)}\n{'='*58}")
for f in fails: print("  x", f)
for s in passes: print("  .", s)
sys.exit(1 if fails else 0)
