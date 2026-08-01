"""
build_panel.py — Expanded data layer for the 10-scene arc.
=========================================================
Consumes data/panel/whr_panel.csv (WHR 2005–2022, 159 countries) and the
cross-section app/data/gap_dataset.csv, and emits the JSON the web app needs:

  web/data/gap.json          (cross-section — already built; left untouched)
  web/data/panel.json        per-country yearly series + trend slopes
  web/data/decoupling.json   the 34 lifespan-up / happiness-down countries
  web/data/affect.json       positive vs negative affect scatter
  web/data/covid.json        2019→2021 happiness delta by region + country
  web/data/regions.json      region-level gap aggregates
  web/data/choropleth.json   per-year gap by ISO3 for the animated map

Run:  python3 notebooks/build_panel.py
"""
import pandas as pd, numpy as np, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PANEL = os.path.join(ROOT, "data/panel/whr_panel.csv")
XSEC  = os.path.join(ROOT, "app/data/gap_dataset.csv")
OUT   = os.path.join(ROOT, "web/data")
os.makedirs(OUT, exist_ok=True)

def clean(o):
    """Recursively replace NaN/inf (invalid JSON) with None."""
    if isinstance(o, float):
        return None if (o != o or o in (float("inf"), float("-inf"))) else o
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o

def w(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        json.dump(clean(obj), f, separators=(",", ":"), allow_nan=False)
    print(f"  ✅ {name:22s} {os.path.getsize(path):>8,d} bytes")

# ── Load ────────────────────────────────────────────────────────────────────
p = pd.read_csv(PANEL).dropna(subset=["life_ladder", "life_expectancy"])
p = p[(p.year >= 2006) & (p.year <= 2022)]
xsec = pd.read_csv(XSEC)  # has iso3 for name→ISO3 matching

# name → iso3 map from the cross-section (best-effort; panel names mostly match)
iso_map = dict(zip(xsec.country, xsec.iso3))
MANUAL_ISO = {
    "Bolivia": "BOL", "Congo (Brazzaville)": "COG", "Congo (Kinshasa)": "COD",
    "Ivory Coast": "CIV", "Laos": "LAO", "Moldova": "MDA", "Russia": "RUS",
    "South Korea": "KOR", "Syria": "SYR", "Taiwan Province of China": "TWN",
    "Tanzania": "TZA", "Turkiye": "TUR", "Vietnam": "VNM", "Venezuela": "VEN",
    "Iran": "IRN", "Hong Kong S.A.R. of China": "HKG", "United States": "USA",
    "United Kingdom": "GBR", "Czechia": "CZE", "Palestinian Territories": "PSE",
    "Kosovo": "XKX", "Somaliland region": "SOM", "North Macedonia": "MKD",
    "Egypt": "EGY", "Gambia": "GMB", "Slovakia": "SVK", "Turkmenistan": "TKM",
    "Angola": "AGO", "Azerbaijan": "AZE", "Belarus": "BLR", "Belize": "BLZ",
    "Burundi": "BDI", "Central African Republic": "CAF", "Djibouti": "DJI",
    "Eswatini": "SWZ", "Guyana": "GUY", "Haiti": "HTI", "Kuwait": "KWT",
    "Lesotho": "LSO", "Libya": "LBY", "Oman": "OMN", "Qatar": "QAT",
    "Rwanda": "RWA", "Somalia": "SOM", "State of Palestine": "PSE", "Sudan": "SDN",
    "Suriname": "SUR", "Trinidad and Tobago": "TTO", "Yemen": "YEM",
}
def to_iso(name):
    return iso_map.get(name) or MANUAL_ISO.get(name)

# alpha-3 → numeric id (world-atlas topojson uses numeric ids as strings, zero-padded)
_iso = pd.read_csv(os.path.join(ROOT, "data/panel/iso_codes.csv"))
ALPHA3_TO_NUM = {
    r["alpha-3"]: str(int(r["country-code"])).zfill(3)
    for _, r in _iso.dropna(subset=["alpha-3", "country-code"]).iterrows()
}
ALPHA3_TO_NUM["XKX"] = "-99"  # Kosovo — world-atlas uses -99

# ── Per-country trend slopes (per decade) ─────────────────────────────────────
def slopes(g):
    g = g.sort_values("year")
    if len(g) < 6:
        return None
    return pd.Series({
        "hle_slope":  np.polyfit(g.year, g.life_expectancy, 1)[0] * 10,
        "hap_slope":  np.polyfit(g.year, g.life_ladder, 1)[0] * 10,
        "n": len(g),
        "hle_last": g.life_expectancy.iloc[-1],
        "hap_last": g.life_ladder.iloc[-1],
        "region": g.region.iloc[-1],
    })
tr = p.groupby("country").apply(slopes, include_groups=False).dropna()

# ── 1. panel.json — yearly series per country (for time explorer) ────────────
series = {}
for c, g in p.groupby("country"):
    g = g.sort_values("year")
    series[c] = {
        "iso3": to_iso(c),
        "region": g.region.iloc[-1],
        "years": g.year.astype(int).tolist(),
        "happiness": g.life_ladder.round(3).tolist(),
        "hle": g.life_expectancy.round(2).tolist(),
        "freedom": g.freedom_of_LifeChoices.round(3).tolist(),
        "social": g.social_support.round(3).tolist(),
    }
w("panel.json", {"meta": {"year_min": 2006, "year_max": 2022, "n": len(series)},
                 "countries": series})

# ── 2. decoupling.json — lifespan UP, happiness DOWN ─────────────────────────
dec = tr[(tr.hle_slope > 1.0) & (tr.hap_slope < -0.1)].copy()
dec = dec.sort_values("hap_slope")
dec_records = [{
    "country": c, "region": r["region"], "iso3": to_iso(c),
    "hle_slope": round(r["hle_slope"], 2), "hap_slope": round(r["hap_slope"], 2),
    "hle_last": round(r["hle_last"], 1), "hap_last": round(r["hap_last"], 2),
} for c, r in dec.iterrows()]
# also emit full yearly series for the top decoupling characters (for slope-line anim)
feature = ["India", "Botswana", "Jordan", "Afghanistan", "Zimbabwe", "Egypt"]
feat_series = {}
for c in feature:
    if c in series:
        s = series[c]
        # index happiness & hle to their first year = 100 for the diverging-line viz
        h0, l0 = s["happiness"][0], s["hle"][0]
        feat_series[c] = {
            "years": s["years"],
            "happiness_idx": [round(v / h0 * 100, 1) for v in s["happiness"]],
            "hle_idx": [round(v / l0 * 100, 1) for v in s["hle"]],
            "happiness": s["happiness"], "hle": s["hle"],
        }
w("decoupling.json", {"count": len(dec_records), "countries": dec_records,
                      "featured": feat_series})

# ── 3. affect.json — positive vs negative affect ─────────────────────────────
aff = p[p.year >= 2019].dropna(subset=["positive_affect", "negative_affect"])
aff = aff.groupby("country").last().reset_index()
aff_records = [{
    "country": c.country, "iso3": to_iso(c.country), "region": c.region,
    "happiness": round(c.life_ladder, 3), "hle": round(c.life_expectancy, 1),
    "pos": round(c.positive_affect, 3), "neg": round(c.negative_affect, 3),
} for _, c in aff.iterrows()]
corr = {
    "happy_pos": round(aff.life_ladder.corr(aff.positive_affect), 3),
    "happy_neg": round(aff.life_ladder.corr(aff.negative_affect), 3),
    "hle_pos":   round(aff.life_expectancy.corr(aff.positive_affect), 3),
    "hle_neg":   round(aff.life_expectancy.corr(aff.negative_affect), 3),
}
w("affect.json", {"corr": corr, "countries": aff_records})

# ── 4. covid.json — 2019 → 2021 happiness delta ──────────────────────────────
cov = p[p.year.isin([2019, 2021])].pivot_table(
    index="country", columns="year", values="life_ladder").dropna()
cov["chg"] = cov[2021] - cov[2019]
regmap = p[["country", "region"]].drop_duplicates().set_index("country")["region"]
cov["region"] = cov.index.map(regmap)
by_region = (cov.groupby("region")["chg"].agg(["mean", "size"])
             .sort_values("mean").reset_index())
covid = {
    "by_region": [{"region": r["region"], "mean": round(r["mean"], 3),
                   "n": int(r["size"])} for _, r in by_region.iterrows()],
    "countries": [{"country": c, "iso3": to_iso(c), "region": cov.loc[c, "region"],
                   "chg": round(cov.loc[c, "chg"], 3),
                   "y2019": round(cov.loc[c, 2019], 2),
                   "y2021": round(cov.loc[c, 2021], 2)} for c in cov.index],
}
w("covid.json", covid)

# ── 5. regions.json — region gap aggregates (from cross-section) ─────────────
# recompute gap on the cross-section for region rollup
reg = xsec.groupby("region").agg(
    n=("gap", "size"), mean_gap=("gap", "mean"),
    mean_hle=("hle", "mean"), mean_happy=("happiness", "mean")).reset_index()
reg = reg.sort_values("mean_gap")
w("regions.json", {"regions": [{
    "region": r["region"], "n": int(r["n"]),
    "gap": round(r["mean_gap"], 3), "hle": round(r["mean_hle"], 1),
    "happy": round(r["mean_happy"], 2)} for _, r in reg.iterrows()]})

# ── 6. choropleth.json — per-year gap by ISO3 (residual within each year) ─────
# For each year, fit happiness ~ hle and take the residual = that year's gap.
choro = {}
for yr, g in p.groupby("year"):
    g = g.dropna(subset=["life_ladder", "life_expectancy"])
    if len(g) < 30:
        continue
    s, b = np.polyfit(g.life_expectancy, g.life_ladder, 1)
    recs = []
    for _, row in g.iterrows():
        iso = to_iso(row.country)
        num = ALPHA3_TO_NUM.get(iso) if iso else None
        if not num:
            continue
        gap = row.life_ladder - (s * row.life_expectancy + b)
        recs.append({"id": num, "iso3": iso, "gap": round(gap, 3)})
    choro[int(yr)] = recs
w("choropleth.json", {"years": sorted(choro.keys()), "data": choro})

# ── Console summary ───────────────────────────────────────────────────────────
matched = sum(1 for c in series if to_iso(c))
print(f"\nISO3 match: {matched}/{len(series)} countries "
      f"({len(series)-matched} unmatched — dropped from map only)")
print(f"Decoupling set: {len(dec_records)} countries")
print("Done.")
