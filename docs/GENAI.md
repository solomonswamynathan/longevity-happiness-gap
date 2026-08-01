# GenAI Documentation — The Longevity–Happiness Gap

**Submission item 5 · VizCon 2026**

This document states exactly where generative AI was and was not used in this
entry. The short version:

> **GenAI built the entry. GenAI does not run inside the entry.**
> Every line of D3, the statistical verification, the accessibility test
> harness, and the narrative drafting were produced in an AI-assisted
> workflow. The shipped page makes no model call at read time — including the
> "Ask the data" panel, which is a scripted query engine and says so on its
> own face.

That second sentence is a deliberate design decision, not a shortfall, and the
reasoning is given in §3.

---

## 1. What GenAI was used for

Claude (Anthropic) via Claude Code, used as a pair programmer across the build.
Five distinct kinds of work, in rough order of how much they mattered:

### 1.1 Code generation — the whole front end

~2,100 lines of hand-rolled D3 v7 + Scrollama + GSAP, written with AI
assistance: `web/js/main.js` (1,312 lines, 56 functions, 10 scenes) and
`web/js/ask.js` (762 lines, 14 query intents), plus 796 lines of CSS. No
dashboard tool, no chart library beyond D3 primitives, no build step.

The interesting part is not volume, it's the class of problem AI was pointed at.
Scrollytelling has a specific hard bit: **ten scenes sharing one persistent SVG
stage, where marks must keep identity across scene changes** (a country's dot is
the same element and the same color in scene 1 and scene 10, never repainted by
rank). Getting the enter/update/exit choreography right across ten transitions
is exactly the kind of state-machine bookkeeping where a second set of eyes
earns its keep.

### 1.2 Statistical verification — the part that changed the numbers

This is where AI assistance did real analytical work, not just typing.

- **Colorblind safety, computed rather than asserted.** The diverging palette
  was verified by simulating protanopia, deuteranopia and tritanopia with
  Machado et al. (2009) LMS transformation matrices, then measuring CIE76 ΔE
  between the two poles under each. Worst case: protanopia, ΔE 66.6. "Looks
  fine to me" is not evidence; ΔE ≥ 66 across three CVD types is. The matrices
  operate on *linear* RGB, so the check linearizes before transforming — a
  detail that is easy to skip and shifts the result enough to matter.
- **Contrast measured through the actual render pipeline.** Text sits over
  photography that passes through an SVG duotone filter (`feColorMatrix`
  luminance flatten → `feComponentTransfer` remap), then `opacity: 0.4` over
  `--bg-0`, then a radial vignette. Measuring against the source JPEG would give
  the wrong number, so contrast is sampled from the live page inside each text
  element's exact bounding box, *with the type hidden* — otherwise the sample
  lands on the glyphs and you compute the contrast of the text against itself.
  Hero title 4.61:1, hero standfirst 7.45:1, closing title 5.04:1, closing body
  4.61:1 — all passing WCAG AA at the 4.5:1 body-text threshold, including the
  two titles, which are large enough that AA would have allowed them 3.0:1.
  These figures are *lower* than an earlier revision of the docs claimed
  (5.62 / 5.41). The imagery didn't change; the measurement got stricter and the
  old hand-picked sample region was optimistic. The reproducible number wins.
- **Image selection by measured luminance.** Candidate photographs were scored
  on the share of near-black pixels and the darkness of their top third, because
  the duotone maps highlights to near-white and would wash out overlaid type. A
  visually appealing dawn-beach candidate was rejected at 71.9% bright.
- **Two claim/data discrepancies found and fixed.** Building the verification
  tables surfaced that the story's affect correlations (r = −0.49 / +0.20) are
  computed on the 132 countries in both the affect panel and the 2023
  cross-section, while `affect.json` stores −0.422 / +0.164 for all 141 rows —
  both defensible, but the page never said which. And the "roughly 20% higher"
  freedom/support figure is a top-25/bottom-25 group comparison (+19%/+23%),
  not a sign split on the residual (+15%/+12%); a first draft of the factors
  table used the wrong split and would have contradicted the sentence directly
  above it. Both are now stated explicitly on the page, in the README, and in
  the relevant table's population line.

### 1.3 An accessibility test harness that found real bugs

The most valuable AI-assisted artifact in this project is not the visualization.
It is **147 automated checks** — five Playwright suites (137) that drive real
keyboard events in headless Chromium (Tab, arrow keys, Home/End, Enter, Escape,
Shift+Tab) and assert on what the browser actually did, plus a palette-and-
contrast checker (10) that recomputes the accessibility math from scratch.

This was built because the 2024 Global Standard winner was marked down for being
*"hard to use without a keyboard-only interface."* Rather than add ARIA
attributes and hope, the attributes were treated as a hypothesis and tested.

**The harness found five real bugs that manual review had missed:**

| Bug | Why it mattered |
|---|---|
| 136 invisible dots left in the tab order on scenes that hide the scatter | A genuine keyboard trap: a keyboard user would Tab 136 times through nothing |
| `role="img"` on the chart figure | Hides the newly focusable, individually-labelled child marks from assistive tech — the ARIA would have been self-defeating |
| The `affect` scene drew its own marks and left stale labels on the scatter | Screen-reader output describing marks that were no longer the live chart |
| `onResize()` rebuilt the chart, resetting tab order and reviving hidden stops | The keyboard trap came back on any window resize |
| Adding the Ask panel made `.verify-backdrop` match two elements | A regression caught the moment the suites were re-run: the new panel reuses the class, so the verification suite's click target became ambiguous and the suite died mid-run |

Two findings are worth naming because they went the *other* way — the test was
wrong, not the code:

- One assertion failed after the viewport shrank, but Scrollama had legitimately
  entered a scene that does show dots. Rewritten to check the stronger invariant
  (no invisible dot is ever focusable) rather than a brittle fixed count.
- The contrast checker initially scored `.hero-title` at 3.44:1 — an apparent AA
  failure. It wasn't real. That title is painted with a vertical white→#cdd6e6
  gradient, and the naive method pairs the *darkest* gradient stop against the
  *brightest* background pixel anywhere in the box — but the darkest stop is at
  the bottom, where the photograph is dark, and the brightest background is at
  the top, where the type is near-white. Those pixels never overlap. Measured
  row-wise against each row's actual interpolated colour, the true worst case is
  **4.61:1**, passing. The wrong method would have triggered a pointless redesign
  of the hero.

Treating a red test as a question rather than a verdict is the difference between
a harness and theatre. The same pass also found that the runner counted a
*crashed* suite as zero failures — a suite that dies before printing its summary
was being reported as clean. That is now a hard failure.

Suite breakdown: 24 scatter-keyboard checks, 43 verification-table checks, 6
focus-trap checks (an 80-keypress probe in both directions), 36 query-engine
checks, 28 query-UI checks, 10 palette/contrast checks. All 147 pass. The
query-engine suite sweeps **all 136 countries** for name resolution and clean
profile rendering, and asserts determinism by asking the same question five times
and diffing the results.

Everything is in `tests/`, and `./tests/run_all.sh` starts its own server, runs
all six, and prints the combined total. The counts in this document come from
that script's output, not from counting `check(` calls in the source — those
disagree (115 vs 147), because grep counts the function definition and misses
every check generated inside a loop.

### 1.4 Narrative drafting

The five-act structure — rule → rule holds → the break → the mechanism → the
payoff — was developed conversationally, along with scene copy, the "Great
Decoupling" framing, and the closing argument. Two rounds of editing removed
figures that were true but didn't advance the argument.

AI also caught an image/copy contradiction: the closing copy argues people are
*"connected to others… surrounded by people who have your back,"* while the
closing photograph was **a solitary figure at a lakeshore**. That is precisely
the "charts didn't always fully reflect the text blocks" flaw the 2024 judges
named against a winning entry. The image was replaced with a CC0 crowd-in-
silhouette shot and contrast was re-derived through the render pipeline.

### 1.5 Data discovery and the pipeline

Locating the public datasets, reconciling country names across three sources
with different conventions, and writing `notebooks/build_dataset.py` and
`build_panel.py` (237 lines of pandas) that regenerate every JSON in
`web/data/` from raw CSVs.

---

## 2. What GenAI was NOT used for

Stated plainly, because a GenAI disclosure that only lists wins is not a
disclosure:

- **No generated imagery.** Every photograph is NASA public domain or CC0 by a
  credited human photographer. An earlier draft of the page credited Amazon
  Titan Image Generator; that was never true and was removed. Full provenance
  in [`IMAGE_SOURCES.md`](IMAGE_SOURCES.md).
- **No AI-generated or AI-altered data.** Every number traces to the World
  Happiness Report, the WHR longitudinal panel, Our World in Data, or the World
  Bank. No imputation, no synthetic rows, no model-estimated values. The gap is
  ordinary OLS.
- **No model call at runtime.** See below.
- **No AI voiceover or AI-generated audio.**

---

## 3. The "Ask the data" panel is scripted, and that is the point

The page ships a natural-language query interface over all 136 countries. Ask
"why is Hong Kong an under-performer?" or "does money buy happiness?" and it
resolves the entities, computes an answer, and shows the arithmetic.

**It contains no language model.** No API call, no network request, no
inference. `web/js/ask.js` tokenizes the question, resolves country/region/
factor/year entities, matches against 14 ordered intents, and computes from the
same JSON the charts use. The panel says this in its own header, and asking it
"are you an AI?" returns a straight answer.

This was a deliberate choice against the easier and more fashionable option, for
three reasons:

1. **The entry's entire argument is "check my numbers."** There is a
   *Verify the data* panel whose whole purpose is letting a judge tie every
   sentence to a table and a population. Putting a model between the reader and
   those figures at read time — a model that can paraphrase 64.8 into "about
   65" or soften "0.000 by construction" into "little relationship" — would
   undercut the thing the entry is built to be trusted for.
2. **Determinism is a feature for a judged artifact.** Two judges asking the
   same question get the same answer, and so will anyone reproducing it later.
   The test suite asserts this directly.
3. **The honest engineering constraint.** This is a static GitHub Pages site.
   A real LLM needs a backend; shipping an API key in client-side JavaScript on
   a public repository is a credential leak, not an architecture. Rather than
   pretend otherwise, the entry does the deterministic thing well and labels it
   accurately.

**On the temptation to call it an AI chatbot anyway.** It would have been easy
to describe this panel as AI-powered — most people wouldn't check. It's
labelled as scripted instead, in the panel header, in its own answers, in the
README, and here. The repository is public and hand-coded; a judge who takes up
the "check my numbers" invitation can read `ask.js` and find no model call. An
entry that asks to be trusted on its numbers does not get to be loose about its
own provenance. Where GenAI *was* used, this document claims it specifically and
verifiably; where it wasn't, it says so.

---

## 4. Where this fits what the contest encourages

The VizCon guidance names code generation, data discovery and cleaning,
statistical modeling, NLP, and narrative drafting as encouraged uses. This entry
used AI for four of the five, and the strongest instance is one the guidance
doesn't list:

**AI-assisted accessibility verification.** Not "I added ARIA labels," but: a
147-check harness driving real keyboard events, which found a keyboard trap, a
self-defeating ARIA role, a stale-label bug, a resize regression, and a
selector-collision regression the day it was introduced — the exact class of
defect that cost a previous winner rubric points. The 2025 field included a RAG
chatbot, an AI podcast, AI voiceovers, and ML clustering. None of them used AI to
prove their visualization was operable without a mouse.

---

## 5. Reproducing the claims in this document

Every claim above is either runnable or readable. Nothing here rests on taking my
word for it.

| Claim | How to check it |
|---|---|
| No model call at runtime | `grep -rnE "https?://\|XMLHttpRequest\|WebSocket\|eval\(" web/js/` returns nothing. The only network calls in the entry are the nine `fetch("data/*.json")` in `main.js:41-49`, all local, and the four `<script src>` CDN tags in `index.html` (D3, topojson, Scrollama, GSAP) |
| 147 passing checks, 0 failures | `./tests/run_all.sh` — starts its own server, runs all six suites, prints the combined total, exits non-zero on any failure |
| ΔE ≥ 66 across three CVD types | `python3 tests/cvd_contrast_check.py` — no dependencies, prints all three simulated pairs and asserts the README's quoted 66.6 still holds |
| Contrast figures | `python3 tests/cvd_contrast_check.py --live` (needs the server + Pillow) — measures each text block on the rendered page |
| Every number is public-source | `notebooks/build_dataset.py` + `build_panel.py` regenerate all nine JSON files from the raw CSVs in `data/` |
| The affect population discrepancy | *Verify the data* → "Joy vs. suffering" tab states both denominators (132 vs 141) |
| The Ask panel is scripted | Read `web/js/ask.js` — 762 lines, 14 intents, no model. Or just ask it "are you an AI?" |

---

*VizCon 2026 · Solomon S · No Amazon-internal or proprietary data is used in
this entry.*
