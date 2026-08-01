# Data Sources — VizCon 2026

All datasets are publicly accessible and free to download.

| Dataset | Description | Source | Link |
|---|---|---|---|
| World Happiness Report 2023 | Happiness score + 6-factor decomposition (social support, freedom, generosity, corruption, GDP, healthy life expectancy) for 137 countries | World Happiness Report / Gallup World Poll | [Kaggle mirror](https://www.kaggle.com/datasets/unsdsn/world-happiness) / [GitHub](https://github.com/VivekAgrawl/World-Happiness-Report-2023) |
| Life Expectancy | Life expectancy at birth, 1950–2023, 200+ entities | Our World in Data (UN WPP) | [ourworldindata.org/grapher/life-expectancy](https://ourworldindata.org/grapher/life-expectancy) |
| GDP per capita | GDP per capita (PPP, constant 2021 int$), 2000–2023 | Our World in Data (World Bank) | [ourworldindata.org/grapher/gdp-per-capita-worldbank](https://ourworldindata.org/grapher/gdp-per-capita-worldbank) |

## Methodology note

The "gap" metric is the OLS residual: actual happiness minus predicted happiness based on healthy life expectancy alone. Countries above the line are "over-performers" (happier than their lifespan predicts); those below are "under-performers." The gap is then explained by the WHR's own factor decomposition (freedom, social support, generosity, corruption).

## Reproducibility

Run `python3 notebooks/build_dataset.py` to regenerate `app/data/gap_dataset.csv` from the raw files in `data/`.
