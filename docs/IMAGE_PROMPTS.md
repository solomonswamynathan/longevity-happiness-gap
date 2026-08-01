# Image Generation Prompts — VizCon 2026

**Tool:** Amazon Titan Image Generator (Bedrock) · **Task type:** TEXT_IMAGE
**House style (keep constant across all 4):** cinematic, muted, atmospheric; deep
near-black background (#0a0d14); a restrained blue↔warm-red accent logic; soft
volumetric light; photographic realism with a filmic grain; *generous empty/dark
negative space* for text overlay. No text, no logos, no watermarks in the image.

> **Why these prompts are safe:** every scene is **universal/abstract** — no country
> named, no ethnicity or place specified, no poverty tropes. This is deliberate: it
> avoids stereotyping (a Data-Quality & Inclusivity risk) while still delivering the
> human moment. Let the *data* name countries; let the *images* stay universal.

**Titan settings to use for each:** `cfgScale: 8.0`, `quality: premium`,
`numberOfImages: 3` (generate 3, pick the best). Aspect ratios noted per image.
Generate a couple of seeds and keep the one with the most negative space.

Save the chosen files as the exact names below into `web/img/`.

---

## 1 — HERO  → save as `web/img/hero.png`  (1408×768, wide 16:9-ish)

**Prompt:**
> A view of Earth at night from high orbit, continents defined only by scattered
> points of warm and cool light, like a field of tiny stars in two colors — some
> warm amber, some cool blue — suspended in deep space. Vast dark negative space at
> the top and edges fading to pure near-black. Cinematic, minimal, atmospheric,
> filmic grain, no text. Muted, elegant, contemplative mood.

**Negative prompt:** `text, letters, logos, watermark, borders, bright white, busy, cluttered, cartoon`

**Why:** foreshadows the two-color scatter; dark top edge holds the title. Cool-dominant.

---

## 2 — THE DECOUPLING (scene 6, the peak)  → save as `web/img/decoupling.png`  (1024×1024, square)

**Prompt:**
> A single anonymous figure seen from behind, small in the frame, walking along a
> long empty road that stretches toward a distant flat horizon at dusk. The road
> ahead is long. The sky is heavy, muted, desaturated. A sense of a long journey
> ahead that feels weighted rather than hopeful. Cinematic wide shot, lots of empty
> sky for text, filmic grain, no text, no faces visible. Melancholic, quiet.

**Negative prompt:** `face, identifiable person, text, logo, watermark, crowd, bright cheerful colors, specific country landmarks`

**Why:** "more years ahead, but heavier." Anonymous + universal = no stereotyping.
Warm-to-red duotone will be applied in code.

---

## 3 — JOY vs. ABSENCE OF PAIN (scene 8)  → save as `web/img/affect.png`  (1408×768, wide)

**Prompt:**
> A minimalist abstract composition split by soft light: one half is calm, still,
> and shadowed — a quiet absence; the other half holds a single small warm glow, a
> spark of genuine light. Ambiguous, painterly, atmospheric, deep dark background,
> heavy negative space, filmic grain, no text, no people. Contemplative, subtle.

**Negative prompt:** `text, logo, watermark, faces, busy detail, bright saturated colors`

**Why:** grounds the most abstract insight — "less pain is not the same as more joy."
The single glow = the scarce positive affect.

---

## 4 — THE CLOSE  → save as `web/img/close.png`  (1408×768, wide)

**Prompt:**
> Dawn breaking over a quiet horizon, first warm light returning after night, soft
> and hopeful but restrained. In the foreground, out of focus, a suggestion of
> people gathered close together as silhouettes — connection, warmth, belonging —
> no faces visible. Cinematic, atmospheric, filmic grain, generous sky for text, no
> text. Warm and cool tones in gentle balance. Resolved, calm, hopeful.

**Negative prompt:** `faces, identifiable people, text, logo, watermark, harsh light, crowd, specific landmarks`

**Why:** resolves the arc, echoes the hero composition, warm/blue balance = the
freedom + connection payoff.

---

## After you generate

1. Drop the 4 files into `web/img/` with the exact names above.
2. Tell me — the integration layer (duotone + parallax + attribution) will already
   be built against placeholders, so they'll animate the moment they land.
3. Save the **exact final prompts, tool, model ID, and settings you used** — I'll
   fold them into the Sources & Methods panel as GenAI-category evidence.

## Attribution line these will carry (draft)
> *Imagery generated with Amazon Titan Image Generator (Bedrock). Prompts authored
> by Solomon S. Images are illustrative and intentionally universal — no image
> depicts a specific country in the data.*
