# The Longevity–Happiness Gap

**A scrollytelling data story: the countries that live longest aren't the ones that live happiest.**

🔗 **[View the live visualization →](https://solomonswamynathan.github.io/longevity-happiness-gap/)**

Built for **Analyticon Viz Con 2026** — theme: *"How the world lives, thrives, and connects."*

---

## The story

Across 136 countries, healthy life expectancy and happiness rise together — a
correlation of **r = 0.74** that has held steady since 2006. Richer, healthier
societies tend to be happier societies. That's the received wisdom, and it's
mostly right.

But look who breaks the rule.

**Hong Kong** has the 3rd-longest healthy lifespan on Earth, yet sits two full
points below the happiness its longevity predicts. **Mozambique** and **Mexico**,
with far shorter lives, are *happier* than their lifespans should allow. The
distance from the trend line is **the gap** — and it has a geography: Latin
America over-performs, East Asia and the Middle East under-perform.

Split the 25 biggest over-performers from the 25 biggest under-performers and
their average healthy lifespan is nearly identical — **64.8 vs 64.2 years**. Same
years on the clock. Vastly different joy.

### Two findings almost nobody expects

**1. The Great Decoupling.** In **32 countries**, healthy lifespan climbed by more
than a year per decade *while happiness fell*. India added **3.4 years** of
healthy life per decade and *lost* a full point of happiness. Botswana, Jordan,
and Egypt tell the same story. The rule doesn't just bend — it breaks.

**2. Longer lives buy less suffering, not more joy.** Split happiness into its two
halves and longevity is tied to **less negative emotion** (r = −0.49) far more
than to **more positive emotion** (r = +0.20), across the 132 countries reporting
both. Extra years take the edge off the bad days. They don't add good ones.

### What actually explains the gap

Not money, and not years. Two things: **freedom to make life choices**
(r = +0.53) and **social support** (r = +0.45). Over-performers score roughly
**20% higher** on each.

> A good life isn't measured in years alone.

---

## Data sources

All data is public and freely downloadable.

| Source | Used for | Link |
|---|---|---|
| **World Happiness Report 2023** | Happiness (life ladder) and its six factors | [worldhappiness.report](https://worldhappiness.report/) |
| **WHR longitudinal panel, 2006–2022** | 159 countries, 2,155 country-years, incl. positive/negative affect (Gallup World Poll via WHR) | [Kaggle mirror](https://www.kaggle.com/datasets/mathurinache/world-happiness-report) |
| **Our World in Data** | Healthy life expectancy (UN WPP) | [ourworldindata.org](https://ourworldindata.org/life-expectancy) |
| **World Bank** | GDP per capita | [data.worldbank.org](https://data.worldbank.org/) |

No Amazon-internal or proprietary data is used.

## Method

- The **gap** is the OLS residual of happiness regressed on healthy life
  expectancy — actual happiness minus the happiness a country's lifespan predicts.
- The **choropleth** refits that residual *within each year*, 2006–2022, so the
  map is comparable across time.
- The **Great Decoupling** set = countries whose healthy-life-expectancy trend
  exceeded +1 yr/decade while their happiness trend was negative, from a linear
  fit over ≥6 observed years. 32 countries qualify.
- **Populations differ by claim, and each one is stated.** The affect
  correlations use the 132 countries present in both the affect panel and the
  2023 cross-section; across all 141 affect rows they are −0.422 / +0.164 — same
  direction, same conclusion. The "roughly 20% higher" freedom and support
  figures are top-25 vs bottom-25 group means, not a sign split on the residual.
  The *Verify the data* panel names the population for every table.

Fully reproducible: [`notebooks/build_dataset.py`](notebooks/build_dataset.py)
and [`notebooks/build_panel.py`](notebooks/build_panel.py) regenerate every JSON
in `web/data/` from the raw CSVs in `data/`.

## Tools used

Hand-coded, no dashboard tool and no build step:

- **[D3.js v7](https://d3js.org/)** — every chart, drawn from scratch
- **[Scrollama](https://github.com/russellsamora/scrollama)** — scroll choreography
- **[TopoJSON](https://github.com/topojson/topojson-client)** — the world map
- **[GSAP](https://gsap.com/)** — transition easing
- **Python** (pandas, numpy) — the data pipeline

## Accessibility

- **Fully keyboard operable.** The scatter plot is a roving-tabindex group: one
  `Tab` reaches the plot, then `←`/`→` walk all 136 countries in life-expectancy
  order, `Home`/`End` jump to the extremes, and `Enter` pins a country. Marks
  that a scene hides drop out of the tab order, so there is no keyboard trap.
- **Per-datapoint screen-reader labels.** Every dot carries its own
  `aria-label` with the country's actual figures ("Hong Kong: healthy life
  expectancy 77.3 years, happiness 5.31 out of 10, 2.04 points less happy than
  its lifespan predicts…") rather than one generic label for the whole chart.
  A polite live region announces each scene change and the focused datapoint.
- A **skip link** jumps past the ten animated scenes straight to the data table.
- Diverging palette verified colorblind-safe: the two poles stay **ΔE ≥ 66**
  apart (CIE76) under simulated protanopia, deuteranopia and tritanopia — worst
  case protanopia, ΔE 66.6.
- Text contrast measured against the actual rendered imagery: hero title
  **4.73:1**, closing title **5.62:1**, closing body **5.41:1** — all pass WCAG AA.
- Honors `prefers-reduced-motion`, disabling parallax, Ken Burns and drift.
- **Every claim is checkable.** A *Verify the data* panel at the foot of the page
  gives each headline claim its own table — the quoted sentence, the population
  the statistic is computed on, sortable columns, and a CSV export. The panel is
  a proper dialog: `Esc` closes, focus is trapped inside and restored to the
  trigger on exit, the tablist is a roving-tabindex group, and sorting a column
  sets `aria-sort` and announces itself.

Verified with automated Playwright suites (73 checks) driving real keyboard
events — roving tabindex, traversal order, focus-ring rendering, live-region
output, the absence of focusable-but-invisible marks across scene changes and
viewport resizes, an 80-keypress focus-trap probe on the dialog, and assertions
that each table's numbers match the sentence it claims to verify.

## Imagery

- **Hero:** NASA / ISS Expedition 30 (`iss030e055569`) — a night-limb photograph
  from orbit, not a rendering. Public domain.
- Scene and closing imagery: **CC0 1.0** photography via StockSnap.io and
  Wikimedia Commons.
- Images are illustrative and **intentionally universal** — no image depicts any
  specific country in the data, by design, to avoid stereotyping.
- All imagery is tinted in-browser to the story palette via SVG duotone filters,
  and was selected by *measured luminance distribution* so it survives that
  filter while preserving text contrast.

Full provenance and licensing in [`docs/IMAGE_SOURCES.md`](docs/IMAGE_SOURCES.md).

## Running locally

```bash
cd web
python3 -m http.server 8765
# open http://localhost:8765
```

No dependencies, no build, no bundler — it's static files.

---

*VizCon 2026 · Solomon S*
