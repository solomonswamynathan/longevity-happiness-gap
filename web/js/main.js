/* ============================================================================
   THE LONGEVITY–HAPPINESS GAP · D3 + Scrollama animation engine
   10 scenes across 5 acts. One persistent SVG stage; each scene tweens the
   marks it needs and clears the overlay layer. Dots keep identity across
   scenes (color follows the country, never repainted by rank).

   Acts:
     I   Rule      → rule, hold
     II  Break     → break, map
     III Decouple  → groups, decouple           (emotional peak)
     IV  Why       → why, affect
     V   Shock/You → covid, explore
   ========================================================================= */

const PAL = {
  over: "#3987e5", under: "#e66767", neutral: "#6f6d67",
  overGlow: "#5598e7", underGlow: "#ec835a",
  ink: "#f4f5f7", inkSoft: "#b9bdc7", inkMute: "#7c8090",
  baseline: "rgba(255,255,255,0.22)", surface: "#10141d",
};

const KEY_COUNTRIES = {
  "Hong Kong S.A.R. of China": "Hong Kong", "Finland": "Finland",
  "Mozambique": "Mozambique", "Lebanon": "Lebanon", "Mexico": "Mexico",
};

let gapColor;              // diverging scale, set once data loads
const state = {
  data: null, meta: null, groups: null,
  panel: null, decoupling: null, affect: null, covid: null,
  regions: null, choropleth: null, topo: null, worldFeatures: null,
  scene: null, prevScene: null, dims: null,
  x: null, y: null, svg: null, g: null, dots: null,
  selected: "United States",
};

// ─────────────────────────────  BOOT  ──────────────────────────────
Promise.all([
  fetch("data/gap.json").then((r) => r.json()),
  fetch("data/groups.json").then((r) => r.json()),
  fetch("data/panel.json").then((r) => r.json()),
  fetch("data/decoupling.json").then((r) => r.json()),
  fetch("data/affect.json").then((r) => r.json()),
  fetch("data/covid.json").then((r) => r.json()),
  fetch("data/regions.json").then((r) => r.json()),
  fetch("data/choropleth.json").then((r) => r.json()),
  fetch("data/world.topo.json").then((r) => r.json()),
]).then(([gap, groups, panel, decoupling, affect, covid, regions, choro, topo]) => {
  state.data = gap.countries;
  state.meta = gap.meta;
  state.groups = groups;
  state.panel = panel.countries;
  state.decoupling = decoupling;
  state.affect = affect;
  state.covid = covid;
  state.regions = regions.regions;
  state.choropleth = choro;
  state.topo = topo;
  state.worldFeatures = topojson.feature(topo, topo.objects.countries).features;

  const maxAbsGap = d3.max(state.data, (d) => Math.abs(d.gap));
  gapColor = d3.scaleLinear()
    .domain([-maxAbsGap, 0, maxAbsGap])
    .range([PAL.under, PAL.neutral, PAL.over])
    .interpolate(d3.interpolateRgb);

  buildChart();
  buildTooltip();
  buildCountrySelect();
  buildDataTable();
  buildVerify();
  initImagery();
  initScrollama();
  window.addEventListener("resize", debounce(onResize, 200));
});

// ─────────────────────  IMAGERY (duotone/parallax)  ────────────────
// Scenes that reveal a full-bleed scene image (data-img matches the layer).
const SCENE_IMAGE = { decouple: "decoupling", affect: "affect" };

function initImagery() {
  // Upgrade placeholder SVGs to real Titan PNGs when they exist (drop-in later).
  document.querySelectorAll("img[data-src-png]").forEach((img) => {
    const png = img.getAttribute("data-src-png");
    const probe = new Image();
    probe.onload = () => { img.src = png; };   // real art present → swap in
    probe.src = png;                           // 404 → onload never fires, SVG stays
  });

  // Parallax: hero + close images drift slower than the page as you scroll.
  const heroImg = document.querySelector(".hero-photo img");
  const closeImg = document.querySelector(".close-photo img");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) {
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (heroImg && y < window.innerHeight * 1.5)
          heroImg.style.transform = `scale(1.08) translateY(${y * 0.18}px)`;
        if (closeImg) {
          const rect = closeImg.getBoundingClientRect();
          const p = (window.innerHeight - rect.top) * 0.06;
          closeImg.style.transform = `scale(1.08) translateY(${-p}px)`;
        }
        ticking = false;
      });
    }, { passive: true });
  }
}

function setSceneImage(scene) {
  const want = SCENE_IMAGE[scene] || null;
  document.querySelectorAll(".scene-photo-layer").forEach((layer) => {
    layer.classList.toggle("is-visible", layer.dataset.img === want);
  });
}

// ─────────────────────────  CHART SCAFFOLD  ────────────────────────
function computeDims() {
  const el = document.getElementById("chart");
  const w = el.clientWidth, h = el.clientHeight;
  const m = { top: 30, right: 40, bottom: 54, left: 58 };
  return { w, h, m, iw: w - m.left - m.right, ih: h - m.top - m.bottom };
}

function buildChart() {
  const dims = (state.dims = computeDims());
  const { meta } = state;

  const svg = (state.svg = d3.select("#chart").append("svg")
    .attr("viewBox", `0 0 ${dims.w} ${dims.h}`)
    .attr("preserveAspectRatio", "xMidYMid meet"));

  const g = (state.g = svg.append("g")
    .attr("transform", `translate(${dims.m.left},${dims.m.top})`));

  state.x = d3.scaleLinear()
    .domain([meta.hle_range[0] - 2, meta.hle_range[1] + 2]).range([0, dims.iw]);
  state.y = d3.scaleLinear()
    .domain([meta.happiness_range[0] - 0.5, meta.happiness_range[1] + 0.5]).range([dims.ih, 0]);

  g.append("g").attr("class", "x-axis").attr("transform", `translate(0,${dims.ih})`)
    .call(d3.axisBottom(state.x).ticks(6).tickSize(-dims.ih).tickPadding(10));
  g.append("g").attr("class", "y-axis")
    .call(d3.axisLeft(state.y).ticks(6).tickSize(-dims.iw).tickPadding(10));

  g.append("text").attr("class", "axis-label x-title")
    .attr("x", dims.iw / 2).attr("y", dims.ih + 44).attr("text-anchor", "middle")
    .text("Healthy life expectancy (years)");
  g.append("text").attr("class", "axis-label y-title").attr("transform", "rotate(-90)")
    .attr("x", -dims.ih / 2).attr("y", -42).attr("text-anchor", "middle")
    .text("Happiness score (0–10)");

  const p = trendPath();
  g.append("line").attr("class", "trend-line")
    .attr("x1", p.x1).attr("y1", p.y1).attr("x2", p.x1).attr("y2", p.y1).attr("opacity", 0);

  g.append("g").attr("class", "map-layer");      // choropleth lives here
  g.append("g").attr("class", "overlay-layer");  // labels/annotations/bars

  state.dots = g.selectAll(".dot")
    .data(state.data, (d) => d.country)
    .join("circle").attr("class", "dot")
      .attr("cx", (d) => state.x(d.hle)).attr("cy", (d) => state.y(d.happiness))
      .attr("r", 0).attr("fill", PAL.neutral).attr("opacity", 0.85)
      .on("mousemove", onDotHover).on("mouseleave", hideTooltip);

  makeDotsFocusable();
}

/* ─────────────────────  KEYBOARD ACCESS (a11y)  ─────────────────────
   The scatter is a roving-tabindex group: one Tab stop reaches the plot,
   then Arrow keys walk country to country in lifespan order. Each dot is
   an image-role node carrying its own numbers in aria-label, so a screen
   reader announces the datapoint rather than "graphic". Home/End jump to
   the extremes, Enter/Space pins a country the way the picker does.      */
function makeDotsFocusable() {
  // traversal order = left-to-right on the x-axis, which is what a sighted
  // user perceives; ties broken by happiness so the order is deterministic.
  state.navOrder = [...state.data].sort(
    (a, b) => d3.ascending(a.hle, b.hle) || d3.ascending(a.happiness, b.happiness)
  );
  state.navIndex = 0;

  // No tabindex yet: at boot the dots are still r=0 and no scene has run, so
  // they must not be tab stops. initScrollama's first onStepEnter opens them
  // via setDotsReachable(); onResize re-applies it after a rebuild.
  state.dots
    .attr("role", "img")
    .attr("aria-label", dotLabel)
    .attr("aria-hidden", "true")
    .on("focus", function (event, d) {
      state.navIndex = state.navOrder.findIndex((r) => r.country === d.country);
      describeDot(d);
      showTooltipForDot(this, d);
    })
    .on("blur", hideTooltip)
    .on("keydown", onDotKeydown);
}

function dotLabel(d) {
  const dir = d.gap >= 0 ? "happier than" : "less happy than";
  return `${shortName(d.country)}: healthy life expectancy ${d.hle.toFixed(1)} years, `
    + `happiness ${d.happiness.toFixed(2)} out of 10. `
    + `${Math.abs(d.gap).toFixed(2)} points ${dir} its lifespan predicts. `
    + `Freedom ${d.freedom.toFixed(2)}, social support ${d.social.toFixed(2)}.`;
}

function onDotKeydown(event, d) {
  const n = state.navOrder.length;
  let next = null;

  switch (event.key) {
    case "ArrowRight": case "ArrowDown": next = (state.navIndex + 1) % n; break;
    case "ArrowLeft":  case "ArrowUp":   next = (state.navIndex - 1 + n) % n; break;
    case "Home": next = 0; break;
    case "End":  next = n - 1; break;
    case "Enter": case " ":
      event.preventDefault();
      highlightCountry(d.country);
      d3.select("#country-select").property("value", d.country);
      announce(`Selected ${shortName(d.country)}. ${dotLabel(d)}`);
      return;
    case "Escape":
      hideTooltip();
      return;
    default: return;                       // let every other key through
  }

  event.preventDefault();
  moveFocusToDot(next);
}

function moveFocusToDot(index) {
  const target = state.navOrder[index];
  if (!target) return;
  state.navIndex = index;
  // roving tabindex: exactly one dot is tabbable at a time
  state.dots.attr("tabindex", (d) => (d.country === target.country ? 0 : -1));
  const node = state.dots.filter((d) => d.country === target.country).node();
  if (node) node.focus();
}

/* Scenes that hide the scatter (map, bars, etc.) must also drop the dots out
   of the tab order — 136 invisible tab stops would be a keyboard trap. */
// 'affect' draws its own circle.aff marks and leaves state.dots wherever the
// previous scene left them — so the scatter is not the live chart there either.
const DOTLESS_SCENES = new Set(["map", "decouple", "why", "affect", "covid"]);

function setDotsReachable(reachable) {
  if (!state.dots) return;
  if (reachable) {
    const cur = state.navOrder?.[state.navIndex] ?? state.navOrder?.[0];
    state.dots
      .attr("aria-hidden", null)
      .attr("tabindex", (d) => (cur && d.country === cur.country ? 0 : -1));
  } else {
    state.dots.attr("tabindex", null).attr("aria-hidden", "true");
    hideTooltip();
  }
}

// Screen-reader announcements for state the visuals convey by motion/color.
function announce(msg) {
  const el = document.getElementById("a11y-live");
  if (el) el.textContent = msg;
}
function describeDot(d) { announce(dotLabel(d)); }

// Reuse the hover tooltip for keyboard focus, positioned off the dot itself
// rather than the pointer (there is no pointer during keyboard use).
function showTooltipForDot(node, d) {
  const r = node.getBoundingClientRect();
  const cls = d.gap >= 0 ? "tt-gap-over" : "tt-gap-under";
  d3.select("#tooltip").style("opacity", 1)
    .style("left", r.left + r.width / 2 + 14 + "px")
    .style("top", r.top + r.height / 2 + 14 + "px")
    .html(`<div class="tt-name">${shortName(d.country)}</div>
      <div class="tt-row"><span>Gap</span><span class="${cls}">${d.gap >= 0 ? "+" : ""}${d.gap.toFixed(2)}</span></div>
      <div class="tt-row"><span>Healthy life exp.</span><span>${d.hle.toFixed(1)} yrs</span></div>
      <div class="tt-row"><span>Happiness</span><span>${d.happiness.toFixed(2)}</span></div>
      <div class="tt-row"><span>Freedom</span><span>${d.freedom.toFixed(2)}</span></div>`);
}

function trendPath() {
  const { meta } = state;
  const x0 = meta.hle_range[0] - 2, x1 = meta.hle_range[1] + 2;
  return {
    x1: state.x(x0), y1: state.y(meta.slope * x0 + meta.intercept),
    x2: state.x(x1), y2: state.y(meta.slope * x1 + meta.intercept),
  };
}

// Show/hide the scatter axes (map & bar scenes hide them)
function setAxes(show) {
  const o = show ? 1 : 0;
  state.g.selectAll(".x-axis,.y-axis,.x-title,.y-title")
    .transition().duration(400).attr("opacity", o);
}

// ───────────────────────────  SCENES  ──────────────────────────────
const SCENES = {
  // 01 — dots fade in gray; regression line draws left→right.
  rule() {
    exitMap(); clearOverlay(); setAxes(true);
    setCaption("136 countries. Healthy life expectancy vs. happiness — r = 0.74.");
    const t = state.g.transition().duration(900).ease(d3.easeCubicOut);
    state.dots.transition(t)
      .attr("cx", (d) => state.x(d.hle)).attr("cy", (d) => state.y(d.happiness))
      .attr("r", 5).attr("fill", PAL.neutral).attr("opacity", 0.8)
      .attr("stroke-width", 1);
    const p = trendPath();
    state.g.select(".trend-line").attr("x1", p.x1).attr("y1", p.y1)
      .transition().delay(500).duration(900).ease(d3.easeCubicInOut)
      .attr("opacity", 1).attr("x2", p.x2).attr("y2", p.y2);
  },

  // 02 — the rule held 2006–2022: pulse the line, annotate stability.
  hold() {
    exitMap(); clearOverlay(); setAxes(true);
    setCaption("Year after year, 2006–2022, the correlation barely moves.");
    state.dots.transition().duration(700)
      .attr("cx", (d) => state.x(d.hle)).attr("cy", (d) => state.y(d.happiness))
      .attr("r", 5).attr("fill", PAL.neutral).attr("opacity", 0.55);
    state.g.select(".trend-line").transition().duration(500).attr("opacity", 1);
    // yearly r ticker
    const ov = state.g.select(".overlay-layer");
    const rByYear = [["2006", "0.68"], ["2011", "0.66"], ["2016", "0.78"], ["2021", "0.72"]];
    ov.selectAll("text.rtick").data(rByYear).join("text").attr("class", "annotation rtick")
      .attr("x", state.dims.iw - 6).attr("text-anchor", "end")
      .attr("y", (d, i) => 10 + i * 22).attr("fill", PAL.inkSoft).attr("opacity", 0)
      .text((d) => `${d[0]}:  r = ${d[1]}`)
      .transition().delay((d, i) => i * 160).duration(400).attr("opacity", 1);
  },

  // 03 — recolor by gap, swell by |gap|, annotate outliers.
  break() {
    exitMap(); clearOverlay(); setAxes(true);
    setCaption("Distance from the line = the gap. Blue = happier than expected, red = less.");
    const t = state.g.transition().duration(1000).ease(d3.easeCubicOut);
    state.dots.transition(t)
      .attr("cx", (d) => state.x(d.hle)).attr("cy", (d) => state.y(d.happiness))
      .attr("r", (d) => 4 + Math.abs(d.gap) * 4).attr("fill", (d) => gapColor(d.gap))
      .attr("opacity", 0.9);
    state.g.select(".trend-line").transition(t).attr("opacity", 0.7);
    setTimeout(() => { if (state.scene === "break") annotateOutliers(); }, 650);
  },

  // 04 — animated world choropleth of the gap across years.
  map() {
    clearOverlay(); setAxes(false);
    state.g.select(".trend-line").transition().duration(300).attr("opacity", 0);
    state.dots.transition().duration(400).attr("opacity", 0).attr("r", 0);
    drawChoropleth();
  },

  // 05 — re-sort into over/under groups (same lifespan reveal).
  groups() {
    exitMap(); clearOverlay(); setAxes(true);
    setCaption("Top 25 over- vs. bottom 25 under-performers — nearly identical lifespans.");
    state.dots.transition().duration(200).attr("opacity", 0.95).attr("r", 6);
    const t = state.g.transition().duration(1100).ease(d3.easeCubicInOut);
    state.g.select(".trend-line").transition(t).attr("opacity", 0.12);

    const iw = state.dims.iw, ih = state.dims.ih;
    const overSet = new Set(state.groups.over.countries);
    const underSet = new Set(state.groups.under.countries);
    const packed = { over: [], under: [] };
    state.data.forEach((d) => {
      if (overSet.has(d.country)) packed.over.push(d);
      else if (underSet.has(d.country)) packed.under.push(d);
    });
    const place = (arr, cx) => {
      arr.sort((a, b) => b.gap - a.gap);
      const perCol = 7, colGap = 26, rowGap = 20, cols = Math.ceil(arr.length / perCol);
      const pos = new Map();
      arr.forEach((d, i) => {
        const col = Math.floor(i / perCol), row = i % perCol;
        pos.set(d.country, { x: cx + (col - (cols - 1) / 2) * colGap, y: ih * 0.28 + row * rowGap });
      });
      return pos;
    };
    const posOver = place(packed.over, iw * 0.72);
    const posUnder = place(packed.under, iw * 0.28);
    const home = (d) => posOver.get(d.country) || posUnder.get(d.country);

    state.dots.transition(t)
      .attr("r", (d) => (home(d) ? 7 : 3)).attr("opacity", (d) => (home(d) ? 0.95 : 0.1))
      .attr("fill", (d) => gapColor(d.gap))
      .attr("cx", (d) => (home(d) ? home(d).x : state.x(d.hle)))
      .attr("cy", (d) => (home(d) ? home(d).y : state.y(d.happiness)));

    const ov = state.g.select(".overlay-layer");
    ov.append("text").attr("class", "group-label").attr("x", iw * 0.72).attr("y", ih * 0.18)
      .attr("text-anchor", "middle").attr("fill", PAL.overGlow).attr("opacity", 0)
      .text("Over-performers · 64.8 yrs")
      .transition().delay(600).duration(500).attr("opacity", 1);
    ov.append("text").attr("class", "group-label").attr("x", iw * 0.28).attr("y", ih * 0.18)
      .attr("text-anchor", "middle").attr("fill", PAL.underGlow).attr("opacity", 0)
      .text("Under-performers · 64.2 yrs")
      .transition().delay(600).duration(500).attr("opacity", 1);
  },

  // 06 — THE GREAT DECOUPLING: indexed slope lines diverge (peak).
  decouple() {
    exitMap(); clearOverlay(); setAxes(false);
    state.g.select(".trend-line").transition().duration(300).attr("opacity", 0);
    state.dots.transition().duration(400).attr("opacity", 0).attr("r", 0);
    drawDecoupling();
  },

  // 07 — grouped factor bars, over vs under.
  why() {
    exitMap(); clearOverlay(); setAxes(false);
    setCaption("Freedom and social support — not lifespan — separate the two groups.");
    state.g.select(".trend-line").transition().duration(400).attr("opacity", 0);
    state.dots.transition().duration(600).attr("opacity", 0).attr("r", 0);
    drawFactorBars();
  },

  // 08 — joy vs pain: happiness split into positive/negative affect.
  affect() {
    exitMap(); clearOverlay(); setAxes(true);
    drawAffect();
  },

  // 09 — COVID 2019→2021 delta by region (diverging bars).
  covid() {
    exitMap(); clearOverlay(); setAxes(false);
    state.g.select(".trend-line").transition().duration(300).attr("opacity", 0);
    state.dots.transition().duration(400).attr("opacity", 0).attr("r", 0);
    drawCovid();
  },

  // 10 — restore scatter, interactive time-aware explorer.
  explore() {
    exitMap(); clearOverlay(); setAxes(true);
    setCaption("Hover any dot. Pick a country to trace its gap since 2006.");
    state.g.select(".trend-line").transition().duration(500).attr("opacity", 0.5);
    const t = state.g.transition().duration(900).ease(d3.easeCubicOut);
    state.dots.transition(t)
      .attr("cx", (d) => state.x(d.hle)).attr("cy", (d) => state.y(d.happiness))
      .attr("r", (d) => 4 + Math.abs(d.gap) * 4).attr("fill", (d) => gapColor(d.gap))
      .attr("opacity", 0.9);
    highlightCountry(state.selected);
  },
};

// ───────────────────────  SCENE HELPERS  ───────────────────────────
function clearOverlay() { state.g.select(".overlay-layer").selectAll("*").remove(); }
function exitMap() {
  const m = state.g.select(".map-layer");
  if (!m.selectAll("*").empty()) m.selectAll("*").transition().duration(300).attr("opacity", 0).remove();
}
/* Each scene retitles the figure so a screen reader gets the chart's current
   meaning, not one generic label for ten different visualizations. */
function announceScene(element, scene) {
  const h = element.querySelector("h2");
  const kicker = element.querySelector(".step-kicker");
  const fig = document.getElementById("graphic");
  const cap = document.getElementById("caption");
  const label = [kicker?.textContent.trim(), h?.textContent.trim(), cap?.textContent.trim()]
    .filter(Boolean).join(". ");
  if (fig && label) fig.setAttribute("aria-label", label);
  if (!DOTLESS_SCENES.has(scene)) {
    announce(`${label} Press Tab to reach the plot, then arrow keys to move between countries.`);
  } else {
    announce(label);
  }
}

function setCaption(txt) {
  const c = d3.select("#caption");
  c.style("opacity", 0);
  setTimeout(() => c.text(txt).style("opacity", 1), 200);
}

function annotateOutliers() {
  const ov = state.g.select(".overlay-layer");
  Object.entries(KEY_COUNTRIES).forEach(([country, label], i) => {
    const d = state.data.find((r) => r.country === country);
    if (!d) return;
    const cx = state.x(d.hle), cy = state.y(d.happiness);
    const up = d.gap >= 0, dy = up ? -26 : 26;
    ov.append("line").attr("class", "annotation-line")
      .attr("x1", cx).attr("y1", cy).attr("x2", cx).attr("y2", cy).attr("opacity", 0)
      .transition().delay(i * 80).duration(400).attr("y2", cy + dy).attr("opacity", 0.6);
    ov.append("text").attr("class", "annotation")
      .attr("x", cx).attr("y", cy + dy + (up ? -4 : 14)).attr("text-anchor", "middle")
      .attr("opacity", 0).attr("fill", up ? PAL.overGlow : PAL.underGlow).text(label)
      .transition().delay(i * 80 + 200).duration(400).attr("opacity", 1);
  });
}

// ── choropleth (scene 04) ────────────────────────────────────────────────────
function drawChoropleth() {
  const { iw, ih } = state.dims;
  const layer = state.g.select(".map-layer").attr("opacity", 1);
  const projection = d3.geoNaturalEarth1().fitSize([iw, ih * 0.92], { type: "Sphere" });
  const path = d3.geoPath(projection);

  layer.append("path").attr("class", "sphere")
    .attr("d", path({ type: "Sphere" }))
    .attr("fill", "#0c1119").attr("stroke", "rgba(255,255,255,0.05)");

  const byId = new Map();
  const buildYear = (yr) => {
    byId.clear();
    (state.choropleth.data[yr] || []).forEach((d) => byId.set(d.id, d.gap));
  };
  const years = state.choropleth.years;
  buildYear(years[years.length - 1]);

  const paths = layer.selectAll("path.country").data(state.worldFeatures).join("path")
    .attr("class", "country").attr("d", path)
    .attr("stroke", "rgba(10,13,20,0.6)").attr("stroke-width", 0.4)
    .attr("fill", (f) => { const g = byId.get(f.id); return g == null ? "#242a36" : gapColor(g); });

  // year label
  const yl = state.g.select(".overlay-layer").append("text").attr("class", "group-label")
    .attr("x", iw / 2).attr("y", ih - 4).attr("text-anchor", "middle")
    .attr("fill", PAL.inkSoft).style("font-size", "22px");

  // animate through years while the scene is active
  let i = 0;
  const step = () => {
    if (state.scene !== "map") return;
    const yr = years[i % years.length];
    buildYear(yr);
    paths.transition().duration(650).ease(d3.easeCubicInOut)
      .attr("fill", (f) => { const g = byId.get(f.id); return g == null ? "#242a36" : gapColor(g); });
    yl.text(yr);
    i++;
    state._mapTimer = setTimeout(step, 950);
  };
  clearTimeout(state._mapTimer);
  step();
  setCaption("Gap by country, 2006 → 2022. Blue over-performs its lifespan; red under-performs.");
}

// ── decoupling slope lines (scene 06, the peak) ──────────────────────────────
function drawDecoupling() {
  const { iw, ih } = state.dims;
  const ov = state.g.select(".overlay-layer");
  const feat = state.decoupling.featured;      // {country:{years, happiness_idx, hle_idx}}
  const names = Object.keys(feat);
  const focus = "India";

  const allYears = feat[focus].years;
  const x = d3.scalePoint().domain(allYears).range([iw * 0.1, iw * 0.9]);
  const yVals = [];
  names.forEach((c) => yVals.push(...feat[c].happiness_idx, ...feat[c].hle_idx));
  const y = d3.scaleLinear().domain([d3.min(yVals) - 4, d3.max(yVals) + 4]).range([ih * 0.85, ih * 0.15]);

  const lineGen = (key) => d3.line().x((d, i) => x(feat[focus].years[i])).y((d) => y(d)).curve(d3.curveMonotoneX);

  // faint context lines for the other featured countries (happiness only)
  names.filter((c) => c !== focus).forEach((c) => {
    const yrs = feat[c].years;
    const lg = d3.line().x((d, i) => x(yrs[i])).y((d) => y(d)).curve(d3.curveMonotoneX);
    ov.append("path").datum(feat[c].happiness_idx).attr("fill", "none")
      .attr("stroke", PAL.under).attr("stroke-width", 1).attr("opacity", 0)
      .attr("d", lg).transition().delay(300).duration(600).attr("opacity", 0.18);
  });

  // headline: India — lifespan (blue, rising) vs happiness (red, falling)
  const drawLine = (key, color, label, delay) => {
    const data = feat[focus][key];
    const pathEl = ov.append("path").datum(data).attr("fill", "none")
      .attr("stroke", color).attr("stroke-width", 3).attr("d", lineGen(key));
    const L = pathEl.node().getTotalLength();
    pathEl.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L)
      .transition().delay(delay).duration(1400).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0);
    // end label
    ov.append("text").attr("class", "annotation")
      .attr("x", x(allYears[allYears.length - 1]) + 8).attr("y", y(data[data.length - 1]))
      .attr("fill", color).attr("opacity", 0).text(label)
      .transition().delay(delay + 1200).duration(400).attr("opacity", 1);
  };
  drawLine("hle_idx", PAL.over, "Lifespan ↑", 400);
  drawLine("happiness_idx", PAL.under, "Happiness ↓", 700);

  // baseline at 100 (indexed start)
  ov.append("line").attr("x1", x(allYears[0])).attr("x2", x(allYears[allYears.length - 1]))
    .attr("y1", y(100)).attr("y2", y(100)).attr("stroke", PAL.baseline).attr("stroke-dasharray", "3 4");
  ov.append("text").attr("class", "annotation").attr("x", x(allYears[0])).attr("y", y(100) - 6)
    .attr("fill", PAL.inkMute).style("font-size", "11px").text("2006 = 100");

  // title
  ov.append("text").attr("class", "group-label").attr("x", iw / 2).attr("y", ih * 0.08)
    .attr("text-anchor", "middle").attr("fill", PAL.ink)
    .text("India: +3.4 yrs of life per decade, −1.0 happiness");
  setCaption("Indexed to 2006. The blue line climbs; the red line falls. They decouple.");
}

// ── factor bars (scene 07) ───────────────────────────────────────────────────
function drawFactorBars() {
  const ov = state.g.select(".overlay-layer");
  const { iw, ih } = state.dims;
  const factors = [
    { key: "freedom", label: "Freedom to choose" },
    { key: "social", label: "Social support" },
    { key: "generosity", label: "Generosity" },
  ];
  const g = state.groups, x0 = iw * 0.18, bandW = iw * 0.6;
  const groupH = ih / (factors.length + 0.5);
  const xScale = d3.scaleLinear().domain([0, 1]).range([0, bandW]);

  factors.forEach((f, i) => {
    const yTop = groupH * (i + 0.4);
    ov.append("text").attr("class", "axis-label").attr("x", x0).attr("y", yTop - 10)
      .attr("fill", PAL.inkSoft).style("font-size", "13px").text(f.label);
    [["over", PAL.over], ["under", PAL.under]].forEach(([grp, col], j) => {
      const val = g[grp][f.key], barY = yTop + j * 24;
      ov.append("rect").attr("x", x0).attr("y", barY).attr("height", 16).attr("rx", 4)
        .attr("fill", col).attr("width", 0)
        .transition().delay(i * 120 + j * 80).duration(700).ease(d3.easeCubicOut)
        .attr("width", xScale(val));
      ov.append("text").attr("class", "annotation").attr("x", x0 + xScale(val) + 8)
        .attr("y", barY + 13).attr("fill", PAL.inkSoft).style("font-size", "12px").attr("opacity", 0)
        .text(val.toFixed(2))
        .transition().delay(i * 120 + j * 80 + 500).duration(300).attr("opacity", 1);
    });
  });
  ov.append("text").attr("class", "annotation").attr("x", x0).attr("y", ih - 6)
    .attr("fill", PAL.overGlow).style("font-size", "12px").text("■ Over-performers");
  ov.append("text").attr("class", "annotation").attr("x", x0 + 150).attr("y", ih - 6)
    .attr("fill", PAL.underGlow).style("font-size", "12px").text("■ Under-performers");
  setCaption("Freedom and social support — not lifespan — separate the two groups.");
}

// ── joy vs pain affect (scene 08) ────────────────────────────────────────────
function drawAffect() {
  const { iw, ih } = state.dims;
  const ov = state.g.select(".overlay-layer");
  const rows = state.affect.countries;
  const c = state.affect.corr;

  // reuse the main dots? no — draw fresh small dots for pos vs neg
  const x = d3.scaleLinear().domain([0.4, 0.9]).range([0, iw]);      // positive affect
  const y = d3.scaleLinear().domain([0.15, 0.55]).range([ih, 0]);    // negative affect

  ov.append("text").attr("class", "axis-label").attr("x", iw / 2).attr("y", ih + 40)
    .attr("text-anchor", "middle").attr("fill", PAL.inkMute).text("Positive affect (more joy →)");
  ov.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)")
    .attr("x", -ih / 2).attr("y", -40).attr("text-anchor", "middle").attr("fill", PAL.inkMute)
    .text("Negative affect (more pain ↑)");

  ov.selectAll("circle.aff").data(rows).join("circle").attr("class", "aff")
    .attr("cx", (d) => x(d.pos)).attr("cy", (d) => y(d.neg)).attr("r", 0)
    .attr("fill", (d) => gapColor(d.happiness - 5.5)).attr("opacity", 0.75)
    .attr("stroke", PAL.surface).attr("stroke-width", 0.7)
    .transition().delay((d, i) => i * 6).duration(500).attr("r", 5);

  ov.append("text").attr("class", "group-label").attr("x", iw / 2).attr("y", ih * 0.1)
    .attr("text-anchor", "middle").attr("fill", PAL.ink)
    .text(`Longevity ↔ less pain (r=${c.hle_neg}) ≫ longevity ↔ more joy (r=${c.hle_pos})`);
  setCaption("Each dot is a country. Longer lives cluster low (less pain), not right (more joy).");
}

// ── COVID diverging bars (scene 09) ──────────────────────────────────────────
function drawCovid() {
  const { iw, ih } = state.dims;
  const ov = state.g.select(".overlay-layer");
  const rows = state.covid.by_region;
  const max = d3.max(rows, (d) => Math.abs(d.mean));
  const x = d3.scaleLinear().domain([-max, max]).range([iw * 0.12, iw * 0.95]);
  const y = d3.scaleBand().domain(rows.map((d) => d.region)).range([ih * 0.1, ih * 0.92]).padding(0.35);
  const zero = x(0);

  ov.append("line").attr("x1", zero).attr("x2", zero).attr("y1", ih * 0.08).attr("y2", ih * 0.94)
    .attr("stroke", PAL.baseline);

  rows.forEach((d, i) => {
    const up = d.mean >= 0, w = Math.abs(x(d.mean) - zero);
    ov.append("rect").attr("y", y(d.region)).attr("height", y.bandwidth()).attr("rx", 4)
      .attr("x", zero).attr("width", 0).attr("fill", up ? PAL.over : PAL.under)
      .transition().delay(i * 70).duration(700).ease(d3.easeCubicOut)
      .attr("x", up ? zero : x(d.mean)).attr("width", w);
    ov.append("text").attr("class", "annotation").attr("y", y(d.region) + y.bandwidth() / 2 + 4)
      .attr("x", up ? zero - 8 : zero + 8).attr("text-anchor", up ? "end" : "start")
      .attr("fill", PAL.inkSoft).style("font-size", "12px").text(d.region);
    ov.append("text").attr("class", "annotation").attr("y", y(d.region) + y.bandwidth() / 2 + 4)
      .attr("x", up ? x(d.mean) + 6 : x(d.mean) - 6).attr("text-anchor", up ? "start" : "end")
      .attr("fill", up ? PAL.overGlow : PAL.underGlow).style("font-size", "12px").attr("opacity", 0)
      .text((d.mean >= 0 ? "+" : "") + d.mean.toFixed(2))
      .transition().delay(i * 70 + 500).duration(300).attr("opacity", 1);
  });
  ov.append("text").attr("class", "group-label").attr("x", iw / 2).attr("y", ih * 0.04)
    .attr("text-anchor", "middle").attr("fill", PAL.ink).text("Happiness change, 2019 → 2021");
  setCaption("The pandemic didn't hit everyone alike — East Asia rose, South Asia fell.");
}

// ── interactive explorer (scene 10) ──────────────────────────────────────────
function highlightCountry(country) {
  state.selected = country;
  state.dots
    .attr("stroke", (d) => (d.country === country ? PAL.ink : PAL.surface))
    .attr("stroke-width", (d) => (d.country === country ? 3 : 1))
    .attr("opacity", (d) => (d.country === country ? 1 : 0.5));

  const d = state.data.find((r) => r.country === country);
  if (!d) return;
  const ov = state.g.select(".overlay-layer");
  ov.selectAll(".pulse,.selname").remove();
  ov.append("circle").attr("class", "pulse")
    .attr("cx", state.x(d.hle)).attr("cy", state.y(d.happiness)).attr("r", 6)
    .attr("fill", "none").attr("stroke", gapColor(d.gap)).attr("stroke-width", 2).attr("opacity", 0.9)
    .transition().duration(900).ease(d3.easeCubicOut).attr("r", 26).attr("opacity", 0).remove();
  ov.append("text").attr("class", "annotation selname")
    .attr("x", state.x(d.hle)).attr("y", state.y(d.happiness) - 16)
    .attr("text-anchor", "middle").attr("fill", PAL.ink).text(shortName(d.country));
  renderReadout(d);
}

function buildCountrySelect() {
  const sel = d3.select("#country-select");
  sel.selectAll("option").data(state.data.map((d) => d.country).sort(d3.ascending))
    .join("option").attr("value", (d) => d).text((d) => shortName(d));
  sel.property("value", state.selected);
  sel.on("change", function () { highlightCountry(this.value); });
}

function renderReadout(d) {
  const gapCol = d.gap >= 0 ? PAL.overGlow : PAL.underGlow;
  const label = d.gap >= 0 ? "Over-performer" : "Under-performer";
  const factors = [
    ["Freedom", d.freedom, avg("freedom")],
    ["Support", d.social, avg("social")],
    ["Generosity", clamp01(d.generosity), avg("generosity")],
    ["Low corrupt.", 1 - d.corruption, 1 - avg("corruption")],
  ];
  const rows = factors.map(([name, v, a]) => `
    <div class="fingerprint-row">
      <span class="fname">${name}</span>
      <span class="ftrack"><span class="fbar" style="background:${gapCol}"></span>
        <span class="favg" style="left:${clamp01(a) * 100}%"></span></span>
    </div>`).join("");

  // time trajectory sparkline (if panel has this country)
  const traj = trajectorySVG(d.country);

  d3.select("#country-readout").html(`
    <div class="readout-grid">
      <div class="stat"><span class="val" style="color:${gapCol}">${d.gap >= 0 ? "+" : ""}${d.gap.toFixed(2)}</span><span class="lab">Gap · ${label}</span></div>
      <div class="stat"><span class="val">${d.hle.toFixed(1)}</span><span class="lab">Healthy yrs</span></div>
      <div class="stat"><span class="val">${d.happiness.toFixed(2)}</span><span class="lab">Happiness</span></div>
    </div>
    ${traj}
    ${rows}
  `);
  const bars = document.querySelectorAll("#country-readout .fbar");
  factors.forEach(([, v], i) => {
    if (bars[i]) requestAnimationFrame(() => { bars[i].style.width = clamp01(v) * 100 + "%"; });
  });
}

// mini happiness-over-time sparkline for the readout
function trajectorySVG(country) {
  const s = state.panel[country];
  if (!s || s.years.length < 3) return "";
  const w = 260, h = 54, pad = 6;
  const x = d3.scaleLinear().domain([s.years[0], s.years[s.years.length - 1]]).range([pad, w - pad]);
  const y = d3.scaleLinear().domain([d3.min(s.happiness) - 0.3, d3.max(s.happiness) + 0.3]).range([h - pad, pad]);
  const line = d3.line().x((d, i) => x(s.years[i])).y((d) => y(d)).curve(d3.curveMonotoneX);
  const first = s.happiness[0], last = s.happiness[s.happiness.length - 1];
  const col = last >= first ? PAL.overGlow : PAL.underGlow;
  return `<div class="traj"><span class="traj-lab">Happiness, ${s.years[0]}–${s.years[s.years.length - 1]}
    <b style="color:${col}">${last >= first ? "▲" : "▼"} ${(last - first >= 0 ? "+" : "") + (last - first).toFixed(2)}</b></span>
    <svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <path d="${line(s.happiness)}" fill="none" stroke="${col}" stroke-width="2"/>
    </svg></div>`;
}

// ───────────────────────────  TOOLTIP  ─────────────────────────────
function buildTooltip() { d3.select("body").append("div").attr("id", "tooltip"); }
function onDotHover(event, d) {
  const cls = d.gap >= 0 ? "tt-gap-over" : "tt-gap-under";
  d3.select("#tooltip").style("opacity", 1)
    .style("left", event.clientX + 14 + "px").style("top", event.clientY + 14 + "px")
    .html(`<div class="tt-name">${shortName(d.country)}</div>
      <div class="tt-row"><span>Gap</span><span class="${cls}">${d.gap >= 0 ? "+" : ""}${d.gap.toFixed(2)}</span></div>
      <div class="tt-row"><span>Healthy life exp.</span><span>${d.hle.toFixed(1)} yrs</span></div>
      <div class="tt-row"><span>Happiness</span><span>${d.happiness.toFixed(2)}</span></div>
      <div class="tt-row"><span>Freedom</span><span>${d.freedom.toFixed(2)}</span></div>`);
}
function hideTooltip() { d3.select("#tooltip").style("opacity", 0); }

// ────────────────────────  DATA TABLE (a11y)  ──────────────────────
function buildDataTable() {
  const cols = [["country", "Country"], ["hle", "Healthy life exp."], ["happiness", "Happiness"],
    ["gap", "Gap"], ["freedom", "Freedom"], ["social", "Social support"]];
  const rows = [...state.data].sort((a, b) => b.gap - a.gap);
  const thead = `<tr>${cols.map(([, l]) => `<th>${l}</th>`).join("")}</tr>`;
  const tbody = rows.map((d) =>
    `<tr>${cols.map(([k]) => `<td>${typeof d[k] === "number" ? d[k].toFixed(2) : shortName(d[k])}</td>`).join("")}</tr>`).join("");
  d3.select("#data-table").html(`<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`);
}

/* ═════════════════════  VERIFICATION TABLES  ═════════════════════════
   Every headline claim in the story, paired with the data behind it. Each
   view states the population its statistics are computed on, because two
   defensible populations exist here (see the affect note) and an unstated
   denominator is exactly what a judge should be able to check.
   Columns are sortable; each view exports CSV.                          */

const VERIFY_VIEWS = [
  {
    id: "all",
    tab: "All countries",
    claim: "“Across 136 countries, healthy life expectancy and happiness rise together — a correlation of r = 0.74.”",
    pop: () => `n = ${state.data.length} countries · World Happiness Report 2023 cross-section · `
      + `gap = OLS residual of happiness on healthy life expectancy `
      + `(slope ${state.meta.slope.toFixed(4)}, intercept ${state.meta.intercept.toFixed(4)})`,
    cols: [
      ["country", "Country", "t"], ["region", "Region", "t"],
      ["hle", "Healthy life exp. (yrs)", "n1"], ["happiness", "Happiness (0–10)", "n2"],
      ["expected_happiness", "Predicted happiness", "n2"], ["gap", "Gap (residual)", "n2"],
      ["performer", "Class", "t"],
    ],
    rows: () => [...state.data].sort((a, b) => d3.descending(a.gap, b.gap)),
    sort: 5, desc: true,
  },
  {
    id: "decoupling",
    tab: "The Great Decoupling",
    claim: "“In 32 countries, healthy lifespan climbed by more than a year per decade — while happiness fell.”",
    pop: () => `n = ${state.decoupling.count} countries qualifying · trends from a linear fit over ≥6 observed `
      + `years, 2006–2022 · criterion: healthy-life-expectancy slope > +1 yr/decade AND happiness slope < 0`,
    cols: [
      ["country", "Country", "t"], ["region", "Region", "t"],
      ["hle_slope", "HLE trend (yrs/decade)", "n2"], ["hap_slope", "Happiness trend (pts/decade)", "n2"],
      ["hle_last", "Latest HLE", "n1"], ["hap_last", "Latest happiness", "n2"],
    ],
    rows: () => [...state.decoupling.countries].sort((a, b) => d3.descending(a.hle_slope, b.hle_slope)),
    sort: 2, desc: true,
  },
  {
    id: "affect",
    tab: "Joy vs. suffering",
    claim: "“Longevity is tied to less negative emotion (r = −0.49) far more than to more positive emotion (r = +0.20).”",
    pop: () => {
      const c = state.affect.corr;
      return `The quoted −0.49 / +0.20 are computed on the ${affectJoinN()} countries present in BOTH the affect `
        + `panel and the 2023 cross-section. Across all ${state.affect.countries.length} affect rows the same `
        + `correlations are r = ${c.hle_neg.toFixed(3)} (negative) and r = ${c.hle_pos.toFixed(3)} (positive) — `
        + `same direction, same conclusion, different denominator. `
        + `For reference, happiness itself correlates ${c.happy_pos.toFixed(3)} with positive affect and `
        + `${c.happy_neg.toFixed(3)} with negative affect.`;
    },
    cols: [
      ["country", "Country", "t"], ["region", "Region", "t"],
      ["hle", "Healthy life exp. (yrs)", "n1"], ["happiness", "Happiness", "n2"],
      ["pos", "Positive affect", "n3"], ["neg", "Negative affect", "n3"],
    ],
    rows: () => [...state.affect.countries].sort((a, b) => d3.descending(a.hle, b.hle)),
    sort: 2, desc: true,
  },
  {
    id: "groups",
    tab: "Same lifespan, different lives",
    claim: "“The 25 biggest over- and under-performers have a nearly identical average healthy lifespan — 64.8 vs 64.2 years.”",
    pop: () => `Top and bottom 25 countries by gap (residual), n = 50 of ${state.data.length} · `
      + `figures below are group means`,
    cols: [
      ["group", "Group", "t"], ["hle", "Mean healthy life exp. (yrs)", "n1"],
      ["happiness", "Mean happiness", "n2"], ["freedom", "Mean freedom", "n3"],
      ["social", "Mean social support", "n3"], ["generosity", "Mean generosity", "n3"],
      ["members", "Countries", "t"],
    ],
    rows: () => ["over", "under"].map((k) => {
      const g = state.groups[k];
      return {
        group: k === "over" ? "Over-performers (top 25)" : "Under-performers (bottom 25)",
        hle: g.hle, happiness: g.happiness, freedom: g.freedom,
        social: g.social, generosity: g.generosity,
        members: g.countries.map(shortName).join(", "),
      };
    }),
    sort: 0, desc: false,
  },
  {
    id: "factors",
    tab: "What explains the gap",
    claim: "“The gap is explained by freedom to make life choices (r = +0.53) and social support (r = +0.45) — not money, not years.”",
    pop: () => `Correlation column: Pearson r of each factor against the gap across all `
      + `${state.data.length} countries. Group columns: means of the top 25 and bottom 25 `
      + `by gap — the same split as “Same lifespan, different lives”, which is why freedom `
      + `and support read “roughly 20% higher” there. All computed live in the browser from `
      + `the rows shown under “All countries”. Healthy life expectancy correlates r = 0.000 `
      + `with the gap by construction — the gap IS the residual after removing it, so a `
      + `non-zero value there would mean the regression was wrong. Its group means `
      + `(64.8 vs 64.2) are the figures quoted in “Same lifespan, different lives”.`,
    cols: [
      ["factor", "Factor", "t"], ["r", "Correlation with the gap", "n3"],
      ["over", "Top-25 mean", "n3"], ["under", "Bottom-25 mean", "n3"],
      ["lift", "Top vs. bottom", "t"],
    ],
    rows: () => factorCorrelations(),
    sort: 1, desc: true,
  },
  {
    id: "covid",
    tab: "The pandemic shock",
    claim: "“2019 to 2021 didn't hit everyone the same — East Asia rose while South Asia and Latin America fell hardest.”",
    pop: () => `Change in happiness 2019 → 2021, by region (mean of member countries) and per country · `
      + `n = ${state.covid.countries.length} countries across ${state.covid.by_region.length} regions`,
    cols: [
      ["country", "Country / region", "t"], ["region", "Region", "t"],
      ["y2019", "Happiness 2019", "n2"], ["y2021", "Happiness 2021", "n2"],
      ["chg", "Change", "n2"],
    ],
    rows: () => {
      const regions = state.covid.by_region.map((r) => ({
        country: `▸ ${r.region} (mean of ${r.n})`, region: r.region,
        y2019: null, y2021: null, chg: r.mean, _group: true,
      }));
      const countries = [...state.covid.countries].sort((a, b) => d3.ascending(a.chg, b.chg));
      return [...regions.sort((a, b) => d3.ascending(a.chg, b.chg)), ...countries];
    },
    sort: 4, desc: false,
  },
  {
    id: "regions",
    tab: "The gap by region",
    claim: "“The gap has a geography: Latin America over-performs, East Asia and the Middle East under-perform.”",
    pop: () => `Region-level means over the ${state.data.length}-country cross-section · `
      + `the choropleth in the story refits the residual within each year, 2006–2022, `
      + `so the map stays comparable across time`,
    cols: [
      ["region", "Region", "t"], ["n", "Countries", "n0"],
      ["gap", "Mean gap", "n3"], ["hle", "Mean healthy life exp.", "n1"],
      ["happy", "Mean happiness", "n2"],
    ],
    rows: () => [...state.regions].sort((a, b) => d3.descending(a.gap, b.gap)),
    sort: 2, desc: true,
  },
];

// Countries shared by the affect panel and the cross-section — the population
// the story's −0.49 / +0.20 are computed on.
function affectJoinN() {
  const inGap = new Set(state.data.map((d) => d.country));
  return state.affect.countries.filter((r) => inGap.has(r.country)).length;
}

// Correlations of each WHR factor against the gap, plus the group means the
// story quotes. The group columns use the SAME top-25 / bottom-25 split as
// scene 05 and groups.json — not a sign split on the residual, which would
// give different numbers than the sentence above the table claims.
function factorCorrelations() {
  const defs = [
    ["Freedom to make life choices", "freedom"],
    ["Social support", "social"],
    ["Generosity", "generosity"],
    ["Perceived corruption", "corruption"],
    ["Log GDP per capita", "loggdp"],
    ["Healthy life expectancy", "hle"],
  ];
  const ranked = [...state.data].sort((a, b) => d3.descending(a.gap, b.gap));
  const over = ranked.slice(0, 25);
  const under = ranked.slice(-25);
  const mean = (rows, k) => d3.mean(rows, (d) => d[k]);
  return defs.map(([factor, key]) => {
    const r = pearson(state.data.map((d) => d[key]), state.data.map((d) => d.gap));
    const o = mean(over, key), u = mean(under, key);
    // A percentage is meaningless when the base sits at ~0 (generosity is a
    // centred residual), so fall back to the absolute difference there.
    const lift = Math.abs(u) > 0.05
      ? `${o - u >= 0 ? "+" : ""}${(((o - u) / Math.abs(u)) * 100).toFixed(0)}%`
      : `${o - u >= 0 ? "+" : ""}${(o - u).toFixed(3)} abs.`;
    return { factor, r, over: o, under: u, lift };
  }).sort((a, b) => d3.descending(a.r, b.r));
}

function pearson(a, b) {
  const n = a.length, ma = d3.mean(a), mb = d3.mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / Math.sqrt(da * db);
}

const vstate = { view: VERIFY_VIEWS[0], sortCol: null, sortDesc: true, lastFocus: null };

function fmt(v, kind) {
  if (v == null || v === "") return "—";
  if (kind === "t") return String(v);
  const n = +v;
  if (!Number.isFinite(n)) return "—";
  const dp = { n0: 0, n1: 1, n2: 2, n3: 3 }[kind] ?? 2;
  return n.toFixed(dp);
}

function buildVerify() {
  const tabs = d3.select(".verify-tabs");
  tabs.selectAll("button").data(VERIFY_VIEWS).join("button")
    .attr("type", "button").attr("role", "tab")
    .attr("id", (v) => `vtab-${v.id}`)
    .attr("class", "verify-tab")
    .text((v) => v.tab)
    .on("click", (e, v) => selectVerifyView(v))
    .on("keydown", (e, v) => {
      const i = VERIFY_VIEWS.indexOf(v);
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % VERIFY_VIEWS.length;
      if (e.key === "ArrowLeft") j = (i - 1 + VERIFY_VIEWS.length) % VERIFY_VIEWS.length;
      if (e.key === "Home") j = 0;
      if (e.key === "End") j = VERIFY_VIEWS.length - 1;
      if (j === null) return;
      e.preventDefault();
      selectVerifyView(VERIFY_VIEWS[j]);
      document.getElementById(`vtab-${VERIFY_VIEWS[j].id}`).focus();
    });

  d3.select("#verify-open").on("click", openVerify);
  d3.selectAll("[data-verify-close]").on("click", closeVerify);
  d3.select("#verify-csv").on("click", downloadVerifyCsv);

  // Escape closes; Tab cycles inside the dialog only.
  d3.select("#verify").on("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeVerify(); return; }
    if (e.key !== "Tab") return;
    const f = focusablesIn(document.querySelector(".verify-panel"));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  selectVerifyView(VERIFY_VIEWS[0]);
}

function focusablesIn(root) {
  return [...root.querySelectorAll(
    'button, [href], select, [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function openVerify() {
  vstate.lastFocus = document.activeElement;
  const m = document.getElementById("verify");
  m.hidden = false;
  document.body.classList.add("verify-lock");
  document.querySelector(".verify-panel").focus();
  announce(`Verification tables open. ${VERIFY_VIEWS.length} views, arrow keys switch between them. Escape closes.`);
}

function closeVerify() {
  const m = document.getElementById("verify");
  if (m.hidden) return;
  m.hidden = true;
  document.body.classList.remove("verify-lock");
  vstate.lastFocus?.focus();
  announce("Verification tables closed.");
}

function selectVerifyView(v) {
  vstate.view = v;
  vstate.sortCol = v.sort ?? 0;
  vstate.sortDesc = v.desc ?? true;

  d3.selectAll(".verify-tab")
    .classed("is-active", (d) => d.id === v.id)
    .attr("aria-selected", (d) => (d.id === v.id ? "true" : "false"))
    .attr("tabindex", (d) => (d.id === v.id ? 0 : -1));

  d3.select(".verify-quote").text(v.claim);
  d3.select(".verify-pop").text(v.pop());
  renderVerifyTable();
}

function renderVerifyTable() {
  const v = vstate.view;
  const cols = v.cols;
  let rows = v.rows();

  const [key, , kind] = cols[vstate.sortCol];
  rows = [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = kind === "t" ? d3.ascending(String(av), String(bv)) : d3.ascending(+av, +bv);
    return vstate.sortDesc ? -cmp : cmp;
  });

  d3.select(".verify-count").text(`${rows.length} row${rows.length === 1 ? "" : "s"}`);

  const thead = `<tr>${cols.map(([, label], i) => {
    const active = i === vstate.sortCol;
    const dir = active ? (vstate.sortDesc ? "descending" : "ascending") : "none";
    const arrow = active ? (vstate.sortDesc ? " ▾" : " ▴") : "";
    return `<th aria-sort="${dir}"><button type="button" class="th-sort${active ? " is-active" : ""}"
      data-col="${i}">${label}${arrow}</button></th>`;
  }).join("")}</tr>`;

  const tbody = rows.map((d) =>
    `<tr${d._group ? ' class="row-group"' : ""}>${cols.map(([k, , kind]) =>
      `<td class="${kind === "t" ? "td-t" : "td-n"}">${fmt(d[k], kind)}</td>`).join("")}</tr>`).join("");

  d3.select(".verify-table").html(
    `<table class="vtable"><caption class="sr-only">${v.tab}. ${v.claim}</caption>` +
    `<thead>${thead}</thead><tbody>${tbody}</tbody></table>`);

  d3.selectAll(".verify-table .th-sort").on("click", function () {
    const i = +this.dataset.col;
    if (i === vstate.sortCol) vstate.sortDesc = !vstate.sortDesc;
    else { vstate.sortCol = i; vstate.sortDesc = true; }
    renderVerifyTable();
    const btn = document.querySelector(`.verify-table .th-sort[data-col="${i}"]`);
    btn?.focus();
    announce(`Sorted by ${vstate.view.cols[i][1]}, ${vstate.sortDesc ? "descending" : "ascending"}.`);
  });
}

function downloadVerifyCsv() {
  const v = vstate.view;
  const esc = (s) => {
    const t = String(s ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = v.cols.map(([, l]) => esc(l)).join(",");
  const body = v.rows().map((d) => v.cols.map(([k]) => esc(d[k])).join(",")).join("\n");
  const meta = `# ${v.claim}\n# ${v.pop()}\n# The Longevity-Happiness Gap — VizCon 2026\n`;
  const blob = new Blob([meta + head + "\n" + body + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `longevity-happiness-gap_${v.id}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  announce(`Downloaded ${v.tab} as CSV.`);
}

// ──────────────────────────  SCROLLAMA  ────────────────────────────
function initScrollama() {
  const scroller = scrollama();
  scroller.setup({ step: "#steps .step", offset: 0.6, progress: false })
    .onStepEnter(({ element }) => {
      d3.selectAll(".step").classed("is-active", false);
      d3.select(element).classed("is-active", true);
      const scene = element.dataset.step;
      state.prevScene = state.scene;
      state.scene = scene;
      if (state.prevScene === "map" && scene !== "map") clearTimeout(state._mapTimer);
      setSceneImage(scene);
      if (SCENES[scene]) SCENES[scene]();
      setDotsReachable(!DOTLESS_SCENES.has(scene));
      announceScene(element, scene);
    });
  window.addEventListener("load", () => scroller.resize());
}

// ────────────────────────────  UTIL  ───────────────────────────────
function shortName(c) { return KEY_COUNTRIES[c] || c.replace(" S.A.R. of China", ""); }
function avg(key) { return d3.mean(state.data, (d) => d[key]); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function onResize() {
  clearTimeout(state._mapTimer);
  const keepIndex = state.navIndex;          // survive the rebuild
  d3.select("#chart svg").remove();
  buildChart();
  if (state.scene && SCENES[state.scene]) SCENES[state.scene]();
  // buildChart() reset the tab order; restore the caret and re-apply whether
  // this scene shows dots at all, or a resize would revive hidden tab stops.
  state.navIndex = Math.min(keepIndex, state.navOrder.length - 1);
  setDotsReachable(!DOTLESS_SCENES.has(state.scene));
}
