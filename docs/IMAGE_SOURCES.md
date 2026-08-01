# Sourced Imagery — VizCon 2026

Licensed stock/public-domain photography used in place of generated imagery.
Files staged in `web/img/sourced/`. Rename to `hero.png`, `decoupling.png`,
`affect.png`, `close.png` in `web/img/` to activate (the `data-src-png` upgrade
path in `js/main.js:81` picks them up automatically).

**All four are CC0 or US-Government public domain — no attribution legally
required, commercial use permitted, no share-alike obligation.** Credits below
are given anyway, as good practice and as competition-judging evidence.

## Why the source colors don't matter

The duotone filters in `index.html` (`#duo-cool`, `#duo-warm`) begin with a
`feColorMatrix` that flattens all channels to luminance (0.33/0.33/0.33), then
remap through `feComponentTransfer` tables. Source hue is discarded entirely.
Selection criteria were therefore **composition + luminance distribution only**:
a high share of near-black pixels, and a dark upper third to hold overlaid text.

Measured with the actual filter math from `index.html:28-44`:

| Scene | dark (<0.18 lum) | bright (≥0.6) | top-third dark | verdict |
|---|---|---|---|---|
| hero | 86.3% | 1.1% | 100.0% | ideal |
| decoupling | 73.8% | 7.0% | 99.9% | ideal |
| affect | 85.2% | 0.0% | — | ideal |
| close | 22.4% | 9.4% | 0.6% | superseded — see §4 |
| close (current) | — | — | — | replaced 2026-08-01; contrast re-measured, 5.62:1 / 5.41:1 |

---

## 1 — HERO → `hero.png`

**File:** `hero_nasa_iss030e055569.jpg` (4256×2832, 1.6 MB)
**Credit:** NASA / ISS Expedition 30 crew
**License:** Public domain (NASA media usage policy — US Government work)
**Source:** https://images.nasa.gov/details/iss030e055569
**Direct:** https://images-assets.nasa.gov/image/iss030e055569/iss030e055569~orig.jpg

Earth's night limb from orbit. City lights scattered as warm/cool points below a
thin airglow arc; the entire upper 40% is starfield. Delivers the original
prompt's intent — "continents defined only by scattered points of light" — as a
real photograph rather than a rendering.

**Required crop:** ISS structural hardware intrudes at the top-right. Crop the
top ~8% or shift the right edge; the composition survives either.

## 2 — THE DECOUPLING → `decoupling.png`

**File:** `decoupling_stocksnap_RG8KA41GN8.jpg` (960×640 — max public size; original 5472×3648)
**Credit:** Negative Space, via StockSnap.io
**License:** CC0 1.0 Universal
**Source:** https://stocksnap.io/photo/highway-road-RG8KA41GN8

A night highway in long exposure where the roadway **forks and the light trails
diverge** — white streaming one way, red the other. This is a stronger match to
Act III than the original prompt's lone walker: the visual metaphor *is*
divergence, which is literally what the scene argues (lifespan rising while
happiness falls). No people, no landmarks, no country cues.

**Note:** StockSnap serves 960w maximum publicly. Adequate for a duotone-filtered
background layer at typical viewport widths; if you want more, the same
composition class is available at 6000×4000 as the alternate below.

**Alternate:** `decoupling_alt_commons_osmanrana.jpg` — "Night road in long
exposure" by Osman Rana, CC0, 6000×4000, via Wikimedia Commons.
Higher resolution, near-black (82.7% dark), red/cyan trails at an intersection.
Slightly more urban-visible; use if resolution matters more than emptiness.

## 3 — JOY vs. ABSENCE OF PAIN → `affect.png`

**File:** `affect_stocksnap_LERISDMBLY.jpg` (960×640; original 3272×2454)
**Credit:** StockSnap.io
**License:** CC0 1.0 Universal
**Source:** https://stocksnap.io/photo/black-background-LERISDMBLY

Dark textured surface with a single soft light gradient falling across it —
85.2% near-black, 0% bright. Matches the prompt's "one half shadowed, a quiet
absence; the other holds a single small glow." Fully abstract: no people, no
place, no cultural content.

**Alternate:** `affect_alt_stocksnap_FFOHHTZPWQ.jpg` — concentric dark blue
radial ("Abstract Circle", CC0, 3272×2454). Use if you prefer a centred
composition; the gradient version reads as "split" more clearly.

## 4 — THE CLOSE → `close.jpg`  ✅ RESOLVED 2026-08-01

**File:** `close_commons_leiria_unsplash.jpg` (5184×3456, 1.8 MB; shipped as
1600×900, 61 KB)
**Credit:** Marcos Paixão, via Unsplash → Wikimedia Commons
**License:** CC0 1.0 Universal
**Source:** https://commons.wikimedia.org/wiki/File:Leiria_sunset_crowd_silhouette_(Unsplash).jpg

A crowd in silhouette at sunset, several people gathered close in overlapping
profile against a banded pink/orange sky. No faces legible, no identifiable
location, no country cues — so it stays consistent with the country-neutrality
rule below.

**Why this replaced the previous choice.** The earlier image
(`close_stocksnap_IC2UDAUNFF.jpg`, Lukáš Rychvalský / StockSnap, CC0 — retained
in `web/img/sourced/`) was **a solitary figure at a lakeshore**, while the
closing copy argues people are *"connected to others… surrounded by people who
have your back."* Image and text contradicted each other, which is precisely the
flaw judges named against a previous winning entry ("the charts didn't always
fully reflect the text blocks"). The replacement makes the image argue the same
point as the copy.

**Contrast re-verified through the full render pipeline** — `#duo-warm`, then
`opacity: 0.4` over `--bg-0` (#0a0d14), then the `::after` radial vignette,
sampling the worst-case (brightest) region behind each text block:

| Text | Color | Worst-case contrast | WCAG AA |
|---|---|---|---|
| `.close-title` | #b9c6dc (darkest gradient stop) | **5.62:1** | pass |
| `.close-body` | #b9bdc7 (`--ink-soft`) | **5.41:1** | pass |

Slightly lower than the solitary shot's 6.87:1 (more open sky), but comfortably
above the 4.5:1 threshold — and it no longer needs the extra scrim the old image
would have required.

**Rejected candidates and why**
- Dawn beach with distant figures (StockSnap `2WUSCGJ1BM`) — composition fit the
  "gathered people" brief, but 71.9% *bright*; the warm duotone maps highlights
  to near-white and would have washed out the closing title entirely.
- Lantern festival night scene (StockSnap `1LAVSCEHA7`) — tonally excellent
  (70% dark), rejected on inclusivity grounds: it reads as East/Southeast Asian,
  and East Asia is a named under-performer in the data. Exactly the stereotyping
  risk the country-neutrality rule exists to avoid.
- Midday desert roads (StockSnap `LM2EAR3IMY`, `KUTIEJSZNU`) — right composition,
  0.2% dark and bright blue skies; wrong mood and unusable under duotone.

---

## Sources & Methods panel — DONE

An earlier draft of `index.html` credited the imagery to Amazon Titan Image
Generator, which was never true — nothing here is generated. The shipped panel
now credits NASA and the CC0 photographers correctly, and the imagery notes in
`README.md` match. No generated imagery appears anywhere in the entry.

The former `docs/IMAGE_PROMPTS.md` (which described that abandoned
generate-the-imagery approach) has been removed from the repo for the same
reason: publishing it alongside this file would put two contradictory provenance
claims on the public record. The art-direction and inclusivity reasoning that
still applies is captured in this document.
