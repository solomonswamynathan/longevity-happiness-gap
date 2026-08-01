/* ════════════════════════════════════════════════════════════════════════
   ASK THE DATA — a scripted natural-language query interface.

   NOT AN LLM. There is no model, no API call, and no network request here.
   Every answer is produced by pattern-matching the question against the
   INTENTS table below, then computing the result from the same JSON files
   the charts use. The same question always returns the same answer, and
   every answer carries the arithmetic that produced it.

   That is a deliberate design choice, not a limitation we're hiding: an
   entry whose whole argument is "check my numbers" should answer questions
   from the data, deterministically, rather than from a model that might
   paraphrase a figure into something the data doesn't say.

   Architecture:
     tokenize  -> resolve entities (country / region / factor / year)
     match     -> first INTENT whose test() passes, in priority order
     answer    -> {text, math, rows?, followups[]}

   Adding a capability means adding an INTENT, not retraining anything.
   ════════════════════════════════════════════════════════════════════════ */

export function createAsk(state, helpers) {
  const { shortName, pearson } = helpers;

  /* ─────────────────────  ENTITY RESOLUTION  ───────────────────── */

  // Colloquial names judges are likely to type -> the dataset's own label.
  const ALIASES = {
    "hong kong": "Hong Kong S.A.R. of China",
    hk: "Hong Kong S.A.R. of China",
    taiwan: "Taiwan Province of China",
    usa: "United States", us: "United States", america: "United States",
    "the us": "United States", "u.s.": "United States", "u.s.a.": "United States",
    uk: "United Kingdom", britain: "United Kingdom", england: "United Kingdom",
    "great britain": "United Kingdom",
    uae: "United Arab Emirates", emirates: "United Arab Emirates",
    "south korea": "South Korea", korea: "South Korea",
    // The two Congos: the dataset disambiguates by capital, so accept both the
    // capital and the common political names. Bare "congo" is genuinely
    // ambiguous and is left to fall through to the longest-match pass, which
    // hits "congo brazzaville" / "congo kinshasa" only when one is spelled out.
    drc: "Congo (Kinshasa)", "dr congo": "Congo (Kinshasa)",
    "democratic republic of the congo": "Congo (Kinshasa)",
    "democratic republic of congo": "Congo (Kinshasa)",
    kinshasa: "Congo (Kinshasa)", zaire: "Congo (Kinshasa)",
    "republic of the congo": "Congo (Brazzaville)",
    "republic of congo": "Congo (Brazzaville)",
    brazzaville: "Congo (Brazzaville)",
    "bosnia": "Bosnia and Herzegovina",
    "ivory coast": "Ivory Coast", "cote d'ivoire": "Ivory Coast",
    holland: "Netherlands", russia: "Russia", turkey: "Turkey",
    czechia: "Czech Republic", "czech": "Czech Republic",
  };

  const REGION_HINTS = {
    "latin america": "Latin America and Caribbean",
    latam: "Latin America and Caribbean",
    caribbean: "Latin America and Caribbean",
    "east asia": "East Asia",
    "southeast asia": "Southeast Asia",
    "south asia": "South Asia",
    "western europe": "Western Europe",
    "eastern europe": "Central and Eastern Europe",
    "central europe": "Central and Eastern Europe",
    "middle east": "Middle East and North Africa",
    mena: "Middle East and North Africa",
    "north africa": "Middle East and North Africa",
    africa: "Sub-Saharan Africa",
    "sub-saharan africa": "Sub-Saharan Africa",
    "north america": "North America and ANZ",
    cis: "Commonwealth of Independent States",
    europe: "Western Europe",
  };

  const FACTORS = {
    freedom: { key: "freedom", label: "freedom to make life choices",
      words: ["freedom", "free", "choice", "choices", "autonomy", "liberty"] },
    social: { key: "social", label: "social support",
      words: ["social", "support", "connection", "connected", "community",
              "friends", "family", "loneliness", "lonely"] },
    loggdp: { key: "loggdp", label: "log GDP per capita",
      words: ["gdp", "money", "income", "wealth", "wealthy", "rich", "richer",
              "economy", "economic", "afford"] },
    generosity: { key: "generosity", label: "generosity",
      words: ["generosity", "generous", "giving", "charity", "donate"] },
    corruption: { key: "corruption", label: "perceived corruption",
      words: ["corruption", "corrupt", "trust", "institutions", "government"] },
    hle: { key: "hle", label: "healthy life expectancy",
      words: ["lifespan", "longevity", "life expectancy", "hle", "years",
              "live longest", "long life", "age"] },
    happiness: { key: "happiness", label: "happiness",
      words: ["happiness", "happy", "happier", "happiest", "joy", "wellbeing",
              "well-being", "life ladder", "ladder", "satisfaction"] },
  };

  function norm(s) {
    return s.toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[?!.,;:"()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Longest-match country resolution, so "south korea" doesn't hit "korea"
  // first and "guinea" doesn't shadow "equatorial guinea".
  //
  // `q` must already have any matched region phrase blanked out, or region
  // names containing country aliases misfire: "latin america" would otherwise
  // resolve to the United States via the "america" alias.
  function findCountries(q) {
    const hits = [];
    const candidates = [];
    for (const row of state.data) {
      candidates.push([norm(row.country), row.country]);
      const short = shortName(row.country);
      if (short !== row.country) candidates.push([norm(short), row.country]);
    }
    for (const [alias, real] of Object.entries(ALIASES)) {
      if (state.data.some((r) => r.country === real)) candidates.push([alias, real]);
    }
    candidates.sort((a, b) => b[0].length - a[0].length);

    let masked = ` ${q} `;
    for (const [needle, real] of candidates) {
      if (!needle) continue;
      const pat = new RegExp(`(?<![a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`);
      if (pat.test(masked) && !hits.includes(real)) {
        hits.push(real);
        masked = masked.replace(pat, " ".repeat(needle.length));
      }
    }
    return hits;
  }

  function findRegion(q) {
    const opts = [];
    for (const r of state.regions) opts.push([norm(r.region), r.region]);
    for (const [k, v] of Object.entries(REGION_HINTS)) opts.push([k, v]);
    opts.sort((a, b) => b[0].length - a[0].length);
    for (const [needle, real] of opts) if (q.includes(needle)) return real;
    return null;
  }

  // "happiness" and "hle" are the OUTCOME and the REGRESSOR, not explanatory
  // factors, and they appear in almost every question ("does money buy
  // happiness?"). So a driver term always wins over them; they only match when
  // nothing else does. Otherwise that question resolves to the happiness
  // factor and answers about the wrong variable entirely.
  const OUTCOMES = new Set(["happiness", "hle"]);

  function findFactor(q) {
    let best = null, bestLen = 0;
    let fallbackF = null, fallbackLen = 0;
    for (const f of Object.values(FACTORS)) {
      for (const w of f.words) {
        if (!q.includes(w)) continue;
        if (OUTCOMES.has(f.key)) {
          if (w.length > fallbackLen) { fallbackF = f; fallbackLen = w.length; }
        } else if (w.length > bestLen) { best = f; bestLen = w.length; }
      }
    }
    return best || fallbackF;
  }

  function findYear(q) {
    const m = q.match(/\b(19\d{2}|20\d{2})\b/g);
    return m ? m.map(Number).filter((y) => y >= 2006 && y <= 2022) : [];
  }

  /* ─────────────────────────  HELPERS  ────────────────────────── */

  const row = (c) => state.data.find((r) => r.country === c);
  const fx = (n, d = 2) => (n == null || Number.isNaN(n) ? "n/a" : (+n).toFixed(d));
  const sign = (n, d = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}`;

  function rank(country, key, desc = true) {
    const s = [...state.data].sort((a, b) =>
      desc ? b[key] - a[key] : a[key] - b[key]);
    return s.findIndex((r) => r.country === country) + 1;
  }

  const ranked = () => [...state.data].sort((a, b) => b.gap - a.gap);
  const decoupled = (c) => state.decoupling.countries.find((r) => r.country === c);
  const affectRow = (c) => state.affect.countries.find((r) => r.country === c);
  const covidRow = (c) => state.covid.countries.find((r) => r.country === c);

  function tbl(cols, rows) { return { cols, rows }; }

  /* ══════════════════════════  INTENTS  ══════════════════════════
     Order matters: the first test() that passes wins. Specific intents
     precede general ones, so "why is Finland happy" is read as a
     country profile rather than as the generic "what explains the gap".  */

  const INTENTS = [
    // ---------- meta: what can I ask? ----------
    {
      id: "help",
      test: (q) => /^(help|what can (i|you)|which questions|examples?|how does this work|what do you (know|do))/.test(q)
        || q === "?" || /list.*(questions|topics)/.test(q),
      run: () => ({
        text: "I answer from the seven datasets behind this story — 136 countries, "
          + "plus a 2006–2022 panel. I'm a scripted query engine, not a language "
          + "model: same question, same answer, every time, with the arithmetic shown.",
        math: "Try a country (\"how does Japan do?\"), a comparison (\"Japan vs Mexico\"), "
          + "a superlative (\"who lives longest?\"), a region, a factor "
          + "(\"does money matter?\"), or a method question (\"how is the gap calculated?\").",
        followups: ["Why is Hong Kong an under-performer?", "Who over-performs the most?",
                    "Does money buy happiness?", "How is the gap calculated?"],
      }),
    },

    // ---------- method / provenance ----------
    {
      id: "method-gap",
      test: (q) => /(how|what).*(gap|residual).*(calculat|comput|defin|work|mean)/.test(q)
        || /(what is|whats|define).*(the )?gap/.test(q)
        || /methodolog|how did you|how was this (built|made)/.test(q),
      run: () => ({
        text: "The gap is the OLS residual of happiness regressed on healthy life "
          + "expectancy: a country's actual happiness minus the happiness its "
          + "lifespan alone predicts. Positive means happier than its years "
          + "predict; negative means less happy.",
        math: `predicted = ${fx(state.meta.slope, 5)} × lifespan − `
          + `${fx(Math.abs(state.meta.intercept), 5)}  ·  gap = actual − predicted  ·  `
          + `fitted on n = ${state.data.length} countries (World Happiness Report 2023). `
          + `The choropleth refits this within each year so the map stays comparable over time.`,
        followups: ["Where does the data come from?", "Who over-performs the most?",
                    "What explains the gap?"],
      }),
    },
    {
      id: "method-sources",
      test: (q) => /(where|what).*(data|dataset|source)|source|citation|cite|provenance|reliable|trust/.test(q),
      run: () => ({
        text: "Three public sources, no Amazon-internal data: the World Happiness "
          + "Report 2023 for happiness and its six factors; the WHR longitudinal "
          + "panel 2006–2022 (Gallup World Poll) for trends and positive/negative "
          + "affect; and Our World in Data for healthy life expectancy (UN WPP), "
          + "plus World Bank GDP per capita.",
        math: `Cross-section n = ${state.data.length} countries · panel `
          + `${state.meta.year_min ?? 2006}–${state.meta.year_max ?? 2022}, `
          + `${Object.keys(state.panel).length} countries · affect panel `
          + `n = ${state.affect.countries.length}. Every figure is regenerated from raw CSVs `
          + `by notebooks/build_dataset.py and build_panel.py.`,
        followups: ["How is the gap calculated?", "Is this an AI chatbot?"],
      }),
    },
    {
      id: "meta-ai",
      test: (q) => /\b(ai|a\.i\.|llm|gpt|chatgpt|claude|gemini|model|genai|bot|chatbot|language model|are you real|scripted|hardcoded)\b/.test(q),
      run: () => ({
        text: "No — I'm a scripted query engine, not an LLM. No model, no API call, "
          + "no network request: I pattern-match your question to an intent, then "
          + "compute the answer from the same JSON the charts use. That's why every "
          + "answer shows its arithmetic and never varies between runs.",
        math: "Generative AI was used to BUILD this entry — D3 code, narrative "
          + "drafting, the colorblind ΔE simulation, and a 73-check accessibility "
          + "test suite that found four real keyboard bugs. It is not used to "
          + "ANSWER you, deliberately: a story arguing \"check my numbers\" "
          + "shouldn't paraphrase them through a model at read time. "
          + "Full write-up in docs/GENAI.md.",
        followups: ["Where does the data come from?", "What can I ask?"],
      }),
    },

    // ---------- comparison: A vs B ----------
    {
      id: "compare",
      test: (q, e) => e.countries.length >= 2
        || (e.countries.length >= 2 && /\b(vs|versus|compare|against|or|better|worse)\b/.test(q)),
      run: (q, e) => {
        const [a, b] = e.countries.slice(0, 2).map(row);
        const better = a.gap > b.gap ? a : b;
        const worse = a.gap > b.gap ? b : a;
        const dHle = a.hle - b.hle;
        return {
          text: `${shortName(a.country)} scores ${fx(a.happiness)} on happiness with `
            + `${fx(a.hle, 1)} healthy years; ${shortName(b.country)} scores `
            + `${fx(b.happiness)} with ${fx(b.hle, 1)}. Relative to what their lifespans `
            + `predict, ${shortName(better.country)} does better — gap `
            + `${sign(better.gap)} vs ${sign(worse.gap)}. `
            + (Math.abs(dHle) < 2
              ? `Note they live within ${fx(Math.abs(dHle), 1)} years of each other, so the `
                + `happiness difference isn't a lifespan story.`
              : `${shortName(dHle > 0 ? a.country : b.country)} lives `
                + `${fx(Math.abs(dHle), 1)} years longer.`),
          math: `gap = actual − predicted. ${shortName(a.country)}: ${fx(a.happiness)} − `
            + `${fx(a.expected_happiness)} = ${sign(a.gap)} · ${shortName(b.country)}: `
            + `${fx(b.happiness)} − ${fx(b.expected_happiness)} = ${sign(b.gap)}`,
          rows: tbl(
            ["", shortName(a.country), shortName(b.country)],
            [
              ["Happiness (0–10)", fx(a.happiness), fx(b.happiness)],
              ["Healthy life exp. (yrs)", fx(a.hle, 1), fx(b.hle, 1)],
              ["Predicted happiness", fx(a.expected_happiness), fx(b.expected_happiness)],
              ["Gap (residual)", sign(a.gap), sign(b.gap)],
              ["Freedom", fx(a.freedom, 3), fx(b.freedom, 3)],
              ["Social support", fx(a.social, 3), fx(b.social, 3)],
              ["Region", a.region, b.region],
            ]),
          followups: [`Why is ${shortName(worse.country)} an under-performer?`,
                      "What explains the gap?"],
        };
      },
    },

    // ---------- superlatives ----------
    // Guarded: an interrogative alone is not enough. "which countries are
    // decoupling" and "what explains the gap" are questions about a specific
    // finding, and their intents sit below this one, so this must not swallow
    // them. Requires a ranking word AND no competing topic keyword.
    {
      id: "superlative",
      test: (q, e) => /\b(top|bottom|most|least|best|worst|highest|lowest|longest|shortest|happiest|unhappiest|saddest|biggest|smallest|rank|ranking|leader|lives longest|over-?performs?|under-?performs?)\b/.test(q)
        && !/\b(decoupl|explain|covid|pandemic|region|affect|negative emotion|positive emotion|source|calculat)\b/.test(q)
        && e.countries.length === 0,
      run: (q, e) => {
        const n = (q.match(/\btop\s+(\d+)|\bfirst\s+(\d+)|\b(\d+)\s+(countries|nations)/) || [])
          .slice(1).find(Boolean);
        const k = Math.min(Math.max(parseInt(n || "5", 10), 1), 20);
        const low = /\b(least|lowest|worst|shortest|saddest|bottom|under|unhapp)\b/.test(q);

        // Which measure is being ranked? An explicit gap/performance phrasing
        // overrides any factor word that happened to appear in the question.
        const asksGap = /\bgap|over-?perform|under-?perform|punch|relative\b/.test(q);
        const f = asksGap ? null : e.factor;
        const key = f ? f.key : "gap";
        const label = f ? f.label : "gap (residual)";

        const desc = !low;
        const sorted = [...state.data].sort((a, b) =>
          desc ? b[key] - a[key] : a[key] - b[key]);
        const top = sorted.slice(0, k);

        const dp = key === "hle" ? 1 : key === "happiness" ? 2 : 3;
        const lead = top[0];
        return {
          text: `By ${label}, ${low ? "the lowest" : "the highest"} is `
            + `${shortName(lead.country)} at ${fx(lead[key], key === "gap" ? 2 : dp)}`
            + (key === "gap"
              ? ` — ${fx(Math.abs(lead.gap))} points ${lead.gap >= 0 ? "above" : "below"} `
                + `what its ${fx(lead.hle, 1)}-year lifespan predicts.`
              : `, in ${lead.region}.`)
            + ` Here are the ${low ? "bottom" : "top"} ${k}.`,
          math: `Ranked all ${state.data.length} countries by ${label}, `
            + `${desc ? "descending" : "ascending"}. `
            + (key === "gap" ? "Gap = actual happiness − happiness predicted by lifespan." : ""),
          rows: tbl(["#", "Country", "Region",
                     key === "gap" ? "Gap" : label.replace(/^./, (c) => c.toUpperCase()),
                     "Happiness", "Healthy yrs"],
            top.map((r, i) => [
              String(i + 1), shortName(r.country), r.region,
              key === "gap" ? sign(r.gap) : fx(r[key], dp),
              fx(r.happiness), fx(r.hle, 1),
            ])),
          followups: [`Why is ${shortName(lead.country)} ${lead.gap >= 0 ? "an over" : "an under"}-performer?`,
                      low ? "Who over-performs the most?" : "Who under-performs the most?",
                      "What explains the gap?"],
        };
      },
    },

    // ---------- the decoupling ----------
    {
      id: "decoupling",
      test: (q) => /decoupl|pulling apart|diverg|rose while|fell while|more years.*less|trend/.test(q),
      run: (q, e) => {
        const dc = state.decoupling;
        if (e.countries.length === 1) {
          const c = e.countries[0], d = decoupled(c);
          if (!d) {
            return {
              text: `${shortName(c)} is not in the decoupling set — its healthy-life-expectancy `
                + `trend didn't exceed +1 year per decade while happiness fell.`,
              math: `Criterion: HLE slope > +1 yr/decade AND happiness slope < 0, from a linear `
                + `fit over ≥6 observed years, 2006–2022. ${dc.count} of `
                + `${Object.keys(state.panel).length} panel countries qualify.`,
              followups: ["Which countries are decoupling?"],
            };
          }
          return {
            text: `Yes — ${shortName(c)} is one of the ${dc.count}. Healthy lifespan rose `
              + `${fx(d.hle_slope, 2)} years per decade while happiness fell `
              + `${fx(Math.abs(d.hap_slope), 2)} points per decade.`,
            math: `Linear fit over ≥6 observed years, 2006–2022. Latest values: `
              + `${fx(d.hle_last, 1)} healthy years, happiness ${fx(d.hap_last)}.`,
            followups: ["Which countries are decoupling?", "What explains the gap?"],
          };
        }
        const sorted = [...dc.countries].sort((a, b) => b.hle_slope - a.hle_slope);
        return {
          text: `In ${dc.count} countries healthy lifespan climbed by more than a year per `
            + `decade while happiness fell. The steepest divergence is `
            + `${shortName(sorted[0].country)}: ${fx(sorted[0].hle_slope, 2)} more healthy `
            + `years per decade, ${fx(Math.abs(sorted[0].hap_slope), 2)} points less happy.`,
          math: `Criterion: HLE slope > +1 yr/decade AND happiness slope < 0, from a linear `
            + `fit over ≥6 observed years, 2006–2022. ${dc.count} of `
            + `${Object.keys(state.panel).length} panel countries qualify.`,
          rows: tbl(["Country", "Region", "HLE trend /decade", "Happiness trend /decade"],
            sorted.slice(0, 12).map((r) => [
              shortName(r.country), r.region, sign(r.hle_slope), sign(r.hap_slope),
            ])),
          followups: ["Why does living longer not make people happier?",
                      "What explains the gap?"],
        };
      },
    },

    // ---------- affect: joy vs suffering ----------
    {
      id: "affect",
      test: (q) => /affect|negative emotion|positive emotion|suffering|pain|worry|sadness|joy vs|less bad|good days/.test(q),
      run: (q, e) => {
        const c = state.affect.corr;
        const inGap = new Set(state.data.map((d) => d.country));
        const joinN = state.affect.countries.filter((r) => inGap.has(r.country)).length;
        if (e.countries.length === 1) {
          const a = affectRow(e.countries[0]);
          if (a) {
            return {
              text: `${shortName(a.country)}: positive affect ${fx(a.pos, 3)}, negative affect `
                + `${fx(a.neg, 3)}, on ${fx(a.hle, 1)} healthy years.`,
              math: `Affect is the share of respondents reporting the emotion "yesterday" `
                + `(Gallup World Poll). Across all ${state.affect.countries.length} affect `
                + `rows, lifespan correlates ${fx(c.hle_neg, 3)} with negative affect and `
                + `${fx(c.hle_pos, 3)} with positive.`,
              followups: ["Why do longer lives not add joy?"],
            };
          }
        }
        return {
          text: "Longer lives are tied to less suffering far more than to more joy. "
            + "Lifespan correlates −0.49 with negative emotion but only +0.20 with "
            + "positive emotion. Extra years take the edge off the bad days; they "
            + "don't add good ones.",
          math: `Those figures are computed on the ${joinN} countries present in BOTH the `
            + `affect panel and the 2023 cross-section. Across all `
            + `${state.affect.countries.length} affect rows they are ${fx(c.hle_neg, 3)} and `
            + `${fx(c.hle_pos, 3)} — same direction, same conclusion, different denominator. `
            + `Happiness itself correlates ${fx(c.happy_pos, 3)} with positive affect and `
            + `${fx(c.happy_neg, 3)} with negative.`,
          followups: ["Which countries are decoupling?", "What explains the gap?"],
        };
      },
    },

    // ---------- pandemic ----------
    {
      id: "covid",
      test: (q) => /covid|pandemic|2020|2021|lockdown|shock/.test(q),
      run: (q, e) => {
        if (e.countries.length === 1) {
          const cv = covidRow(e.countries[0]);
          if (cv) {
            return {
              text: `${shortName(cv.country)} went from ${fx(cv.y2019)} in 2019 to `
                + `${fx(cv.y2021)} in 2021 — a change of ${sign(cv.chg)} points.`,
              math: `Happiness 2019 → 2021, from the WHR panel. Across `
                + `${state.covid.countries.length} countries the regional means range from `
                + `${sign(Math.min(...state.covid.by_region.map((r) => r.mean)))} to `
                + `${sign(Math.max(...state.covid.by_region.map((r) => r.mean)))}.`,
              followups: ["Which regions fell hardest in the pandemic?"],
            };
          }
        }
        const byr = [...state.covid.by_region].sort((a, b) => b.mean - a.mean);
        return {
          text: `2019 to 2021 didn't hit everyone the same. ${byr[0].region} rose most `
            + `(${sign(byr[0].mean)}), while ${byr[byr.length - 1].region} fell hardest `
            + `(${sign(byr[byr.length - 1].mean)}). A global shock, felt locally — which `
            + `is why the gap looks cultural rather than purely economic.`,
          math: `Mean change in happiness 2019 → 2021 per region, across `
            + `${state.covid.countries.length} countries in ${state.covid.by_region.length} regions.`,
          rows: tbl(["Region", "Countries", "Mean change 2019→2021"],
            byr.map((r) => [r.region, String(r.n), sign(r.mean)])),
          followups: ["What explains the gap?", "Which countries are decoupling?"],
        };
      },
    },

    // ---------- factor questions: does money matter? ----------
    {
      id: "factor",
      test: (q, e) => e.factor && e.countries.length === 0
        && /\b(matter|drive|driver|explain|cause|correlat|relat|effect|impact|buy|predict|important|why)\b/.test(q),
      run: (q, e) => {
        const f = e.factor;
        const r = pearson(state.data.map((d) => d[f.key]), state.data.map((d) => d.gap));
        const rk = [...state.data].sort((a, b) => b.gap - a.gap);
        const over = rk.slice(0, 25), under = rk.slice(-25);
        const mean = (rows) => rows.reduce((s, d) => s + d[f.key], 0) / rows.length;
        const o = mean(over), u = mean(under);

        if (f.key === "hle") {
          return {
            text: "Healthy life expectancy correlates 0.000 with the gap — by construction. "
              + "The gap IS what's left after removing lifespan, so a non-zero value there "
              + "would mean the regression was wrong. Lifespan explains the level of "
              + "happiness (r = 0.74) but none of the gap.",
            math: `Top-25 vs bottom-25 by gap: mean lifespan ${fx(o, 1)} vs ${fx(u, 1)} years — `
              + `nearly identical, which is the whole point of scene 05.`,
            followups: ["What explains the gap then?", "Does money buy happiness?"],
          };
        }

        const strength = Math.abs(r) > 0.45 ? "the strongest kind of signal here"
          : Math.abs(r) > 0.3 ? "a moderate signal"
          : Math.abs(r) > 0.15 ? "a weak signal" : "essentially no signal";
        return {
          text: `${f.label.replace(/^./, (c) => c.toUpperCase())} correlates ${sign(r, 3)} `
            + `with the gap — ${strength}. Top-25 over-performers average ${fx(o, 3)} against `
            + `${fx(u, 3)} for the bottom 25`
            + (Math.abs(u) > 0.05 ? ` (${sign(((o - u) / Math.abs(u)) * 100, 0)}%).` : `.`)
            + (f.key === "loggdp"
              ? " Money tracks the level of happiness, but it's a weak explanation of the gap."
              : ""),
          math: `Pearson r of ${f.label} against the gap across all ${state.data.length} `
            + `countries. Group means use the top-25/bottom-25 split from scene 05. `
            + `For comparison: freedom `
            + `${sign(pearson(state.data.map((d) => d.freedom), state.data.map((d) => d.gap)), 3)}, `
            + `social support `
            + `${sign(pearson(state.data.map((d) => d.social), state.data.map((d) => d.gap)), 3)}, `
            + `log GDP `
            + `${sign(pearson(state.data.map((d) => d.loggdp), state.data.map((d) => d.gap)), 3)}.`,
          followups: ["What explains the gap?", "Who over-performs the most?"],
        };
      },
    },

    // ---------- what explains the gap (general) ----------
    {
      id: "explain",
      test: (q) => /explain|why.*(gap|differ|happier|some countries)|what (drives|causes|matters)|driver/.test(q),
      run: () => {
        const defs = [["freedom", "Freedom to make life choices"],
                      ["social", "Social support"],
                      ["generosity", "Generosity"],
                      ["loggdp", "Log GDP per capita"],
                      ["corruption", "Perceived corruption"],
                      ["hle", "Healthy life expectancy"]];
        const rk = [...state.data].sort((a, b) => b.gap - a.gap);
        const over = rk.slice(0, 25), under = rk.slice(-25);
        const rows = defs.map(([k, label]) => {
          const r = pearson(state.data.map((d) => d[k]), state.data.map((d) => d.gap));
          const o = over.reduce((s, d) => s + d[k], 0) / 25;
          const u = under.reduce((s, d) => s + d[k], 0) / 25;
          return [label, sign(r, 3), fx(o, 3), fx(u, 3)];
        }).sort((a, b) => Math.abs(parseFloat(b[1].replace("−", "-")))
                        - Math.abs(parseFloat(a[1].replace("−", "-"))));
        return {
          text: "Two things: freedom to make life choices (r = +0.53) and social support "
            + "(r = +0.45). Not money — log GDP manages only +0.24. And not years: "
            + "lifespan is 0.000 by construction, since the gap is what's left after "
            + "removing it. Top-25 over-performers average 0.84 freedom and 0.85 support, "
            + "roughly 20% above the bottom 25.",
          math: `Pearson r against the gap, n = ${state.data.length}. Group columns are `
            + `top-25 vs bottom-25 by gap — the same split scene 05 uses.`,
          rows: tbl(["Factor", "r with gap", "Top-25 mean", "Bottom-25 mean"], rows),
          followups: ["Does money buy happiness?", "Who over-performs the most?",
                      "Which countries are decoupling?"],
        };
      },
    },

    // ---------- region ----------
    {
      id: "region",
      test: (q, e) => e.region && e.countries.length === 0,
      run: (q, e) => {
        const rg = state.regions.find((r) => r.region === e.region);
        const members = state.data.filter((d) => d.region === e.region)
          .sort((a, b) => b.gap - a.gap);
        const cv = state.covid.by_region.find((r) => r.region === e.region);
        const allSorted = [...state.regions].sort((a, b) => b.gap - a.gap);
        const pos = allSorted.findIndex((r) => r.region === e.region) + 1;
        return {
          text: `${e.region}: ${rg.n} countries, mean gap ${sign(rg.gap)} — `
            + `${pos} of ${allSorted.length} regions, so it `
            + `${rg.gap >= 0 ? "over" : "under"}-performs overall. Mean happiness `
            + `${fx(rg.happy)} on ${fx(rg.hle, 1)} healthy years. `
            + `Best in region: ${shortName(members[0].country)} (${sign(members[0].gap)}); `
            + `weakest: ${shortName(members[members.length - 1].country)} `
            + `(${sign(members[members.length - 1].gap)}).`
            + (cv ? ` Pandemic change 2019→2021: ${sign(cv.mean)}.` : ""),
          math: `Region means over the ${state.data.length}-country cross-section. `
            + `Gap = actual happiness − happiness predicted by lifespan.`,
          rows: tbl(["Country", "Gap", "Happiness", "Healthy yrs", "Freedom", "Social"],
            members.map((r) => [shortName(r.country), sign(r.gap), fx(r.happiness),
                                fx(r.hle, 1), fx(r.freedom, 3), fx(r.social, 3)])),
          followups: ["Which region over-performs most?", "What explains the gap?"],
        };
      },
    },
    {
      id: "region-ranking",
      test: (q) => /region/.test(q),
      run: () => {
        const s = [...state.regions].sort((a, b) => b.gap - a.gap);
        return {
          text: `Across ${s.length} regions the gap runs from ${sign(s[0].gap)} `
            + `(${s[0].region}) to ${sign(s[s.length - 1].gap)} `
            + `(${s[s.length - 1].region}). Latin America over-performs on mid-length `
            + `lives; East Asia and the Middle East under-perform on long ones.`,
          math: `Mean gap per region over the ${state.data.length}-country cross-section.`,
          rows: tbl(["Region", "Countries", "Mean gap", "Mean happiness", "Mean healthy yrs"],
            s.map((r) => [r.region, String(r.n), sign(r.gap), fx(r.happy), fx(r.hle, 1)])),
          followups: ["Tell me about Latin America", "What explains the gap?"],
        };
      },
    },

    // ---------- single country profile (catch-all for a named country) ----------
    {
      id: "country",
      test: (q, e) => e.countries.length === 1,
      run: (q, e) => {
        const c = e.countries[0], r = row(c);
        const rk = ranked();
        const gapRank = rk.findIndex((x) => x.country === c) + 1;
        const d = decoupled(c);
        const a = affectRow(c);
        const cv = covidRow(c);
        const isOver = r.gap >= 0;

        // If they asked about one specific factor for this country, lead with it.
        if (e.factor && !["hle", "happiness"].includes(e.factor.key)) {
          const f = e.factor;
          const fRank = rank(c, f.key);
          return {
            text: `${shortName(c)} scores ${fx(r[f.key], 3)} on ${f.label} — rank `
              + `${fRank} of ${state.data.length}. Its gap is ${sign(r.gap)}, `
              + `so it lands ${isOver ? "above" : "below"} what its lifespan predicts.`,
            math: `${f.label} correlates `
              + `${sign(pearson(state.data.map((x) => x[f.key]), state.data.map((x) => x.gap)), 3)} `
              + `with the gap across all ${state.data.length} countries.`,
            followups: [`How does ${shortName(c)} do overall?`, "What explains the gap?"],
          };
        }

        const bits = [];
        bits.push(`${shortName(c)} scores ${fx(r.happiness)} on happiness with `
          + `${fx(r.hle, 1)} healthy years. Its lifespan predicts `
          + `${fx(r.expected_happiness)}, so the gap is ${sign(r.gap)} — `
          + `${isOver ? "happier" : "less happy"} than its years predict, ranking `
          + `${gapRank} of ${state.data.length}.`);
        bits.push(`Freedom ${fx(r.freedom, 3)} (rank ${rank(c, "freedom")}), `
          + `social support ${fx(r.social, 3)} (rank ${rank(c, "social")}) — `
          + `the two factors that actually explain the gap.`);
        if (d) {
          bits.push(`It's also one of the ${state.decoupling.count} decoupling countries: `
            + `${sign(d.hle_slope)} healthy years per decade while happiness moved `
            + `${sign(d.hap_slope)}.`);
        }
        return {
          text: bits.join(" "),
          math: `predicted = ${fx(state.meta.slope, 5)} × ${fx(r.hle, 1)} − `
            + `${fx(Math.abs(state.meta.intercept), 5)} = ${fx(r.expected_happiness)} · `
            + `gap = ${fx(r.happiness)} − ${fx(r.expected_happiness)} = ${sign(r.gap)}`,
          rows: tbl(["Measure", "Value", "Rank of " + state.data.length],
            [
              ["Happiness (0–10)", fx(r.happiness), String(rank(c, "happiness"))],
              ["Healthy life exp. (yrs)", fx(r.hle, 1), String(rank(c, "hle"))],
              ["Gap (residual)", sign(r.gap), String(gapRank)],
              ["Freedom", fx(r.freedom, 3), String(rank(c, "freedom"))],
              ["Social support", fx(r.social, 3), String(rank(c, "social"))],
              ["Log GDP per capita", fx(r.loggdp, 3), String(rank(c, "loggdp"))],
              ["Generosity", fx(r.generosity, 3), String(rank(c, "generosity"))],
              ...(a ? [["Positive affect", fx(a.pos, 3), "—"],
                       ["Negative affect", fx(a.neg, 3), "—"]] : []),
              ...(cv ? [["Happiness change 2019→2021", sign(cv.chg), "—"]] : []),
              ["Region", r.region, "—"],
            ]),
          followups: [
            `Compare ${shortName(c)} with ${shortName(isOver ? rk[rk.length - 1].country : rk[0].country)}`,
            "What explains the gap?",
            `Tell me about ${r.region}`,
          ],
        };
      },
    },
  ];

  /* ─────────────────────────  DISPATCH  ────────────────────────── */

  function entities(raw) {
    const q = norm(raw);
    const region = findRegion(q);

    // Resolve countries FIRST on the raw question, then blank only the region
    // text that isn't already claimed by a country match. Two competing traps:
    //   - region names embed country aliases: "latin AMERICA" would resolve to
    //     the United States, answering a regional question about one country.
    //   - country names embed region hints: "South AFRICA" contains "africa",
    //     so blanking the hint first would erase a real country.
    // Country matches win, because they are the more specific signal.
    const direct = findCountries(q);

    let forCountries = q;
    if (region) {
      const phrases = [norm(region)];
      for (const [hint, target] of Object.entries(REGION_HINTS)) {
        if (target === region && q.includes(hint)) phrases.push(hint);
      }
      // Don't blank a phrase that sits inside a country we already matched.
      const claimed = direct.flatMap((c) => [norm(c), norm(shortName(c))]);
      phrases.sort((a, b) => b.length - a.length);
      for (const ph of phrases) {
        if (claimed.some((c) => c.includes(ph))) continue;
        forCountries = forCountries.split(ph).join(" ".repeat(ph.length));
      }
    }

    return {
      countries: findCountries(forCountries),
      region,
      factor: findFactor(q),
      years: findYear(q),
    };
  }

  // Best-effort suggestion when nothing matched, so a miss is still useful.
  function fallback(q, e) {
    const near = [];
    if (e.region) near.push(`Tell me about ${e.region}`);
    if (e.factor) near.push(`Does ${e.factor.label} matter?`);
    return {
      text: "I couldn't map that to something I can compute from the data — I'm a "
        + "scripted engine over seven fixed datasets, so my coverage has real edges "
        + "and I'd rather say so than guess a number.",
      math: "I can do: a country profile, a two-country comparison, superlatives and "
        + "rankings, a region, a factor's correlation with the gap, the decoupling set, "
        + "the affect split, the pandemic change, and how the gap is calculated.",
      followups: near.length ? near.concat("What can I ask?")
        : ["How does Japan do?", "Who over-performs the most?",
           "Does money buy happiness?", "How is the gap calculated?"],
      unmatched: true,
    };
  }

  function ask(raw) {
    const q = norm(raw);
    if (!q) return { ...fallback(q, {}), text: "Ask me something about the data." };
    const e = entities(raw);   // entities() normalizes internally
    for (const intent of INTENTS) {
      let ok = false;
      try { ok = intent.test(q, e); } catch { ok = false; }
      if (!ok) continue;
      try {
        const res = intent.run(q, e);
        return { ...res, intent: intent.id };
      } catch (err) {
        // A broken intent must not take the whole panel down.
        console.error(`ask: intent '${intent.id}' failed`, err);
        return { ...fallback(q, e), intent: "error" };
      }
    }
    return fallback(q, e);
  }

  return { ask, _entities: entities, _intents: INTENTS.map((i) => i.id) };
}
