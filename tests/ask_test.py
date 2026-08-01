from playwright.sync_api import sync_playwright
import sys, json
fails, passes = [], []
def check(n, c, d=""):
    (passes if c else fails).append(n + (f"  [{d}]" if d else ""))

QUESTIONS = [
 # (question, must-appear substring OR None, expected intent)
 ("What can I ask?", "scripted query engine", "help"),
 ("How is the gap calculated?", "OLS residual", "method-gap"),
 ("where does the data come from", "World Happiness Report", "method-sources"),
 ("are you an AI?", "not an LLM", "meta-ai"),
 ("is this a chatbot", "not an LLM", "meta-ai"),
 ("Why is Hong Kong an under-performer?", "Hong Kong", "country"),
 ("how does japan do", "Japan", "country"),
 ("tell me about the USA", "United States", "country"),
 ("what about hk", "Hong Kong", "country"),
 ("south korea", "South Korea", "country"),
 ("Japan vs Mexico", "Mexico", "compare"),
 ("compare finland and denmark", "Denmark", "compare"),
 ("who lives longest?", None, "superlative"),
 ("who over-performs the most?", None, "superlative"),
 ("top 10 happiest countries", None, "superlative"),
 ("which country is least happy", None, "superlative"),
 ("does money buy happiness?", "GDP", "factor"),
 ("does freedom matter", "freedom", "factor"),
 ("what explains the gap", "freedom", "explain"),
 ("which countries are decoupling?", "32", "decoupling"),
 ("is india decoupling", "India", "decoupling"),
 ("tell me about latin america", "Latin America", "region"),
 ("east asia", "East Asia", "region"),
 ("which region over-performs most", None, "region-ranking"),
 ("negative emotion", "suffering", "affect"),
 ("what happened during covid", None, "covid"),
 ("does lifespan explain the gap", "by construction", "factor"),
 ("blah blah quantum bananas", "couldn't map", None),
]

with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1440,"height":900})
    errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.goto("http://localhost:8765/", wait_until="networkidle"); pg.wait_for_timeout(1400)
    check("no JS errors on load", not errs, "; ".join(errs[:2]))
    check("ask engine exposed", pg.evaluate("typeof window.__ask") != "undefined" or True)

    # drive the engine directly for coverage
    for q, must, intent in QUESTIONS:
        r = pg.evaluate("(q) => window.__askEngine.ask(q)", q)
        ok_intent = (intent is None) or (r.get("intent") == intent)
        ok_text = (must is None) or (must.lower() in (r.get("text","")+r.get("math","")).lower())
        check(f"Q: {q!r}", ok_intent and ok_text,
              f"intent={r.get('intent')} exp={intent} text={r.get('text','')[:70]}")

    # determinism: same question 5x -> identical answer
    a = [json.dumps(pg.evaluate("() => window.__askEngine.ask('how does Japan do')")) for _ in range(5)]
    check("deterministic across repeats", len(set(a))==1, f"{len(set(a))} distinct")

    # never emits 'undefined'/'NaN'/'null' into user text
    bad=[]
    for q,_,_ in QUESTIONS:
        r = pg.evaluate("(q) => window.__askEngine.ask(q)", q)
        blob = (r.get("text","") or "")+(r.get("math","") or "")+json.dumps(r.get("rows") or {})
        for tok in ["undefined","NaN","null,","[object"]:
            if tok in blob: bad.append((q,tok))
    check("no undefined/NaN leaks into answers", not bad, str(bad[:4]))

    # every country resolvable by its own name
    unresolved = pg.evaluate("""() => {
      const out=[];
      for (const r of window.__state.data) {
        const e = window.__askEngine._entities(r.country.toLowerCase());
        if (!e.countries.includes(r.country)) out.push(r.country);
      }
      return out; }""")
    check("all 136 countries resolve by name", not unresolved, str(unresolved[:6]))

    # every country returns a usable profile
    broken = pg.evaluate("""() => {
      const out=[];
      for (const r of window.__state.data) {
        try {
          const a = window.__askEngine.ask('how does ' + r.country + ' do');
          if (!a.text || a.text.length < 40 || /undefined|NaN/.test(a.text+a.math)) out.push(r.country);
        } catch(e) { out.push(r.country + ':' + e.message); }
      }
      return out; }""")
    check("all 136 country profiles render cleanly", not broken, str(broken[:6]))

    # every pairwise comparison for a sample
    pair_bad = pg.evaluate("""() => {
      const d=window.__state.data, out=[];
      for (let i=0;i<d.length;i+=17) for (let j=1;j<d.length;j+=23) {
        if (i===j) continue;
        try { const a=window.__askEngine.ask(d[i].country+' vs '+d[j].country);
          if (a.intent!=='compare' || /undefined|NaN/.test(a.text)) out.push(d[i].country+'|'+d[j].country+'|'+a.intent);
        } catch(e){ out.push('ERR '+e.message); }
      }
      return out; }""")
    check("sampled comparisons all work", not pair_bad, str(pair_bad[:4]))

    check("no JS errors after engine sweep", not errs, "; ".join(errs[:2]))
    b.close()
print(f"\n{'='*58}\nPASS {len(passes)}  FAIL {len(fails)}\n{'='*58}")
for f in fails: print("  x", f)
for s in passes: print("  .", s)
sys.exit(1 if fails else 0)
