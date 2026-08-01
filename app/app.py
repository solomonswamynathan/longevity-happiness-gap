"""
VizCon 2026 — The Longevity–Happiness Gap
=========================================
Theme: "How the world lives, thrives, and connects"
Story: The rule-breakers — where extra years don't buy extra joy.

Run: streamlit run app/app.py
"""

import streamlit as st
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from pathlib import Path

# ─── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="The Longevity–Happiness Gap",
    page_icon="🌍",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ─── Theme & palette (from dataviz skill — validated diverging blue↔red) ──────
PALETTE = {
    "over": "#2a78d6",       # blue = over-performers (happier than expected)
    "under": "#e34948",      # red = under-performers (less happy than expected)
    "midpoint": "#f0efec",   # neutral gray midpoint
    "surface": "#fcfcfb",    # light chart surface
    "surface_dark": "#1a1a19",
    "text_primary": "#0b0b0b",
    "text_secondary": "#52514e",
    "text_muted": "#898781",
    "gridline": "#e1e0d9",
    "baseline": "#c3c2b7",
}

# ─── Custom CSS ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
    /* Clean, minimal styling */
    .block-container { max-width: 900px; padding-top: 2rem; }
    h1 { font-size: 2.4rem !important; font-weight: 700; margin-bottom: 0.3rem; }
    h2 { font-size: 1.6rem !important; font-weight: 600; color: #52514e; margin-top: 2.5rem; }
    h3 { font-size: 1.2rem !important; font-weight: 600; }
    .big-number { font-size: 3rem; font-weight: 700; line-height: 1.1; }
    .subtitle { font-size: 1.1rem; color: #52514e; margin-bottom: 2rem; }
    .insight-box {
        background: #f5f8fd; border-left: 4px solid #2a78d6;
        padding: 1rem 1.2rem; margin: 1rem 0; border-radius: 4px;
    }
    .section-divider { border: none; border-top: 1px solid #e1e0d9; margin: 3rem 0; }
</style>
""", unsafe_allow_html=True)

# ─── Load data ────────────────────────────────────────────────────────────────
DATA_PATH = Path(__file__).parent / "data" / "gap_dataset.csv"

@st.cache_data
def load_data():
    df = pd.read_csv(DATA_PATH)
    return df

df = load_data()

# ─── Regression line parameters ───────────────────────────────────────────────
slope, intercept = np.polyfit(df["hle"], df["happiness"], 1)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — THE RULE
# ═══════════════════════════════════════════════════════════════════════════════
st.markdown("# The Longevity–Happiness Gap")
st.markdown('<p class="subtitle">Do the countries that live longest actually live happiest?<br>'
            '<em>A data story about what really drives joy — and it\'s not years.</em></p>',
            unsafe_allow_html=True)

st.markdown("## 1. The Rule")
st.markdown("""
Across 136 countries, **longer lives do track with greater happiness** — the correlation
is r = 0.74. Richer, healthier societies tend to be happier societies.
That's the received wisdom. And it's mostly right.
""")

# Simple scatter showing the positive relationship
fig_rule = px.scatter(
    df, x="hle", y="happiness",
    hover_name="country",
    hover_data={"hle": ":.1f", "happiness": ":.2f", "region": True},
    opacity=0.6,
    color_discrete_sequence=["#898781"],
)
# Add regression line
x_range = np.linspace(df.hle.min() - 1, df.hle.max() + 1, 100)
fig_rule.add_trace(go.Scatter(
    x=x_range, y=slope * x_range + intercept,
    mode="lines", line=dict(color=PALETTE["text_secondary"], width=2, dash="dash"),
    name="Expected happiness", showlegend=True,
))
fig_rule.update_layout(
    xaxis_title="Healthy Life Expectancy (years)",
    yaxis_title="Happiness Score (0–10)",
    template="plotly_white",
    height=450,
    margin=dict(t=30, b=50),
    legend=dict(orientation="h", y=-0.15),
    font=dict(family="system-ui, -apple-system, sans-serif"),
)
fig_rule.update_xaxes(gridcolor=PALETTE["gridline"], zeroline=False)
fig_rule.update_yaxes(gridcolor=PALETTE["gridline"], zeroline=False)
st.plotly_chart(fig_rule, use_container_width=True)

st.markdown('<hr class="section-divider">', unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — THE BREAK
# ═══════════════════════════════════════════════════════════════════════════════
st.markdown("## 2. The Break")
st.markdown("""
But draw the regression line and look at who breaks it. The outliers scream.

**Hong Kong** enjoys the 3rd-longest healthy lifespan on Earth (77.3 years) —
yet scores **2 full points** below the happiness its longevity predicts.
Meanwhile, countries like **Mozambique** and **Mexico**, with far shorter lives,
are happier than their lifespans "should" allow.

The distance from the line is the **gap** — and it reveals where extra years
*don't* buy extra joy.
""")

# Core scatter: colored by gap (diverging blue↔red)
fig_gap = px.scatter(
    df, x="hle", y="happiness",
    color="gap",
    color_continuous_scale=[PALETTE["under"], PALETTE["midpoint"], PALETTE["over"]],
    color_continuous_midpoint=0,
    hover_name="country",
    hover_data={
        "hle": ":.1f", "happiness": ":.2f", "gap": ":+.2f",
        "region": True, "freedom": ":.2f", "social": ":.2f",
    },
    size=np.abs(df["gap"]) * 10 + 5,
    size_max=22,
)
# Regression line
fig_gap.add_trace(go.Scatter(
    x=x_range, y=slope * x_range + intercept,
    mode="lines", line=dict(color=PALETTE["baseline"], width=2, dash="dash"),
    name="Expected", showlegend=False,
))
# Annotate key outliers
annotations = [
    ("Hong Kong S.A.R. of China", "Hong Kong", "bottom right"),
    ("Finland", "Finland", "top left"),
    ("Mozambique", "Mozambique", "top left"),
    ("Lebanon", "Lebanon", "bottom right"),
    ("Mexico", "Mexico", "top left"),
]
for country_name, label, pos in annotations:
    row = df[df.country == country_name]
    if not row.empty:
        r = row.iloc[0]
        ax_offset = -40 if "right" in pos else 40
        ay_offset = 25 if "bottom" in pos else -25
        fig_gap.add_annotation(
            x=r.hle, y=r.happiness, text=f"<b>{label}</b>",
            showarrow=True, arrowhead=0, arrowwidth=1,
            ax=ax_offset, ay=ay_offset,
            font=dict(size=11, color=PALETTE["text_primary"]),
        )

fig_gap.update_layout(
    xaxis_title="Healthy Life Expectancy (years)",
    yaxis_title="Happiness Score (0–10)",
    coloraxis_colorbar=dict(
        title="Gap", tickvals=[-3, -2, -1, 0, 1],
        ticktext=["-3 (unhappier)", "-2", "-1", "0 (on track)", "+1 (happier)"],
    ),
    template="plotly_white",
    height=520,
    margin=dict(t=30, b=50),
    font=dict(family="system-ui, -apple-system, sans-serif"),
)
fig_gap.update_xaxes(gridcolor=PALETTE["gridline"], zeroline=False)
fig_gap.update_yaxes(gridcolor=PALETTE["gridline"], zeroline=False)
st.plotly_chart(fig_gap, use_container_width=True)

# Insight callout
st.markdown("""
<div class="insight-box">
<strong>The "I had no idea" finding:</strong> The top-25 over-performers and bottom-25
under-performers have <em>nearly identical</em> healthy life expectancy (64.8 vs 64.2 years).
Same lifespan — vastly different happiness. So what explains the gap?
</div>
""", unsafe_allow_html=True)

st.markdown('<hr class="section-divider">', unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — THE WHY
# ═══════════════════════════════════════════════════════════════════════════════
st.markdown("## 3. The Why")
st.markdown("""
It's not years. It's not even money. The strongest predictors of the gap are:

1. **Freedom to make life choices** (r = +0.53 with the gap)
2. **Social support** (r = +0.45 with the gap)

Countries where people feel free and socially connected are happier *beyond*
what their lifespan predicts. Countries with long lives but low freedom
(Hong Kong, Jordan, Türkiye) fall well below the line.
""")

# Factor comparison: over vs under groups
over = df.nlargest(25, "gap")
under = df.nsmallest(25, "gap")

factors = ["freedom", "social", "generosity"]
factor_labels = ["Freedom to\nmake choices", "Social\nsupport", "Generosity"]
over_means = [over[f].mean() for f in factors]
under_means = [under[f].mean() for f in factors]

fig_factors = go.Figure()
fig_factors.add_trace(go.Bar(
    x=factor_labels, y=over_means, name="Over-performers (top 25)",
    marker_color=PALETTE["over"], marker_line_width=0,
))
fig_factors.add_trace(go.Bar(
    x=factor_labels, y=under_means, name="Under-performers (bottom 25)",
    marker_color=PALETTE["under"], marker_line_width=0,
))
fig_factors.update_layout(
    barmode="group",
    yaxis_title="Average Score (0–1)",
    template="plotly_white",
    height=380,
    margin=dict(t=30, b=50),
    legend=dict(orientation="h", y=-0.2),
    font=dict(family="system-ui, -apple-system, sans-serif"),
)
fig_factors.update_xaxes(gridcolor=PALETTE["gridline"], zeroline=False)
fig_factors.update_yaxes(gridcolor=PALETTE["gridline"], zeroline=False, range=[0, 1])
st.plotly_chart(fig_factors, use_container_width=True)

st.markdown("""
<div class="insight-box">
<strong>The signature of happiness:</strong> Over-performers average <strong>0.84 freedom</strong>
and <strong>0.85 social support</strong> vs under-performers' 0.70 and 0.69 — a gap of ~20%
on each dimension. Freedom and connection, not longevity, separate the joyful from the
merely long-lived.
</div>
""", unsafe_allow_html=True)

# Scatter colored by freedom (the strongest driver)
st.markdown("### Color the scatter by freedom — and the gap lights up")
fig_freedom = px.scatter(
    df, x="hle", y="happiness",
    color="freedom",
    color_continuous_scale="Blues",
    hover_name="country",
    hover_data={"hle": ":.1f", "happiness": ":.2f", "freedom": ":.2f", "region": True},
    opacity=0.85,
)
fig_freedom.add_trace(go.Scatter(
    x=x_range, y=slope * x_range + intercept,
    mode="lines", line=dict(color=PALETTE["baseline"], width=2, dash="dash"),
    name="Expected", showlegend=False,
))
fig_freedom.update_layout(
    xaxis_title="Healthy Life Expectancy (years)",
    yaxis_title="Happiness Score (0–10)",
    coloraxis_colorbar=dict(title="Freedom"),
    template="plotly_white",
    height=450,
    margin=dict(t=30, b=50),
    font=dict(family="system-ui, -apple-system, sans-serif"),
)
fig_freedom.update_xaxes(gridcolor=PALETTE["gridline"], zeroline=False)
fig_freedom.update_yaxes(gridcolor=PALETTE["gridline"], zeroline=False)
st.plotly_chart(fig_freedom, use_container_width=True)

st.markdown('<hr class="section-divider">', unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — EXPLORE YOUR COUNTRY
# ═══════════════════════════════════════════════════════════════════════════════
st.markdown("## 4. Explore Your Country")
st.markdown("Select a country to see where it sits — and what drives its gap.")

country_list = sorted(df["country"].tolist())
selected = st.selectbox("Choose a country:", country_list, index=country_list.index("United States"))

row = df[df.country == selected].iloc[0]

col1, col2, col3 = st.columns(3)
with col1:
    gap_color = PALETTE["over"] if row.gap >= 0 else PALETTE["under"]
    gap_label = "Over-performer" if row.gap >= 0 else "Under-performer"
    st.markdown(f'<p class="big-number" style="color:{gap_color}">{row.gap:+.2f}</p>', unsafe_allow_html=True)
    st.caption(f"Gap ({gap_label})")
with col2:
    st.markdown(f'<p class="big-number">{row.hle:.1f}</p>', unsafe_allow_html=True)
    st.caption("Healthy Life Expectancy (yrs)")
with col3:
    st.markdown(f'<p class="big-number">{row.happiness:.2f}</p>', unsafe_allow_html=True)
    st.caption("Happiness Score")

# Factor fingerprint — horizontal bar
st.markdown(f"#### {selected}'s factor fingerprint")
factor_data = pd.DataFrame({
    "Factor": ["Freedom", "Social Support", "Generosity", "Low Corruption"],
    "Score": [row.freedom, row.social, row.generosity, 1 - row.corruption],
    "Global Avg": [df.freedom.mean(), df.social.mean(), df.generosity.mean(), 1 - df.corruption.mean()],
})
fig_finger = go.Figure()
fig_finger.add_trace(go.Bar(
    y=factor_data["Factor"], x=factor_data["Score"],
    orientation="h", name=selected,
    marker_color=gap_color, marker_line_width=0,
))
fig_finger.add_trace(go.Scatter(
    y=factor_data["Factor"], x=factor_data["Global Avg"],
    mode="markers", name="Global average",
    marker=dict(symbol="line-ns", size=18, line_width=2, color=PALETTE["text_secondary"]),
))
fig_finger.update_layout(
    xaxis_title="Score (0–1)", xaxis_range=[0, 1],
    template="plotly_white",
    height=280,
    margin=dict(t=10, b=40, l=120),
    legend=dict(orientation="h", y=-0.3),
    font=dict(family="system-ui, -apple-system, sans-serif"),
)
fig_finger.update_xaxes(gridcolor=PALETTE["gridline"], zeroline=False)
fig_finger.update_yaxes(gridcolor=PALETTE["gridline"], zeroline=False)
st.plotly_chart(fig_finger, use_container_width=True)

st.markdown('<hr class="section-divider">', unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — THE CLOSE
# ═══════════════════════════════════════════════════════════════════════════════
st.markdown("## Same Lifespan, Different Lives")
st.markdown("""
The world's happiest countries aren't necessarily the longest-lived.
They're the ones where people feel **free to choose** and **connected to others**.

A good life isn't measured in years alone — it's measured in the freedom
to live them on your own terms, surrounded by people who have your back.

---

*Data: World Happiness Report 2023 · Our World in Data (UN/WHO/World Bank) ·
Built with Python + Streamlit + Plotly · [View sources & methodology](https://github.com/ssolom/vizcon2026)*
""")

# ─── Sidebar (metadata) ──────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("### About this visualization")
    st.markdown("""
    **VizCon 2026 Entry**
    Theme: *How the world lives, thrives, and connects*

    **Author:** Solomon S (ssolom@)
    **Tools:** Python, Streamlit, Plotly, pandas
    **Data:** World Happiness Report 2023, Our World in Data

    All data is publicly accessible. See [SOURCES.md](docs/SOURCES.md) for full citations.
    """)
