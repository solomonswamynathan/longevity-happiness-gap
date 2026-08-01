"""VizCon 2026 — data pipeline for 'The Longevity–Happiness Gap'.
Produces app/data/gap_dataset.csv from public sources (all cited in docs/SOURCES.md).
Run: python3 notebooks/build_dataset.py
"""
import pandas as pd, numpy as np, pathlib

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"
OUT  = pathlib.Path(__file__).resolve().parent.parent / "app" / "data"
OUT.mkdir(parents=True, exist_ok=True)

w = pd.read_csv(DATA / "whr2023.csv")
w.columns = [c.strip().replace("﻿", "") for c in w.columns]
w = w.rename(columns={
    "Country name": "country", "iso alpha": "iso3", "Regional indicator": "region",
    "Happiness score": "happiness", "Healthy life expectancy": "hle",
    "Social support": "social", "Freedom to make life choices": "freedom",
    "Generosity": "generosity", "Perceptions of corruption": "corruption",
    "Logged GDP per capita": "loggdp"})
num = ["happiness", "hle", "social", "freedom", "generosity", "corruption", "loggdp"]
for c in num:
    w[c] = pd.to_numeric(w[c], errors="coerce")
w = w.dropna(subset=num).reset_index(drop=True)

# The "gap": happiness relative to what healthy life expectancy predicts (OLS residual)
slope, intercept = np.polyfit(w.hle, w.happiness, 1)
w["expected_happiness"] = slope * w.hle + intercept
w["gap"] = w.happiness - w.expected_happiness
w["performer"] = np.where(w.gap >= 0, "Over-performer", "Under-performer")

keep = ["country", "iso3", "region", "happiness", "hle", "loggdp",
        "social", "freedom", "generosity", "corruption",
        "expected_happiness", "gap", "performer"]
w[keep].round(4).to_csv(OUT / "gap_dataset.csv", index=False)
print(f"Wrote {OUT/'gap_dataset.csv'}  ({len(w)} countries)")
print(f"Fit: happiness = {slope:.4f} * hle + {intercept:.4f}")
print("Gap drivers (corr):",
      {f: round(w.gap.corr(w[f]), 3) for f in ["freedom", "social", "generosity", "corruption", "loggdp"]})
