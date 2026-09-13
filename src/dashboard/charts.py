import plotly.graph_objects as go
import pandas as pd


def premium_chart(df: pd.DataFrame, ma_windows: list[int]) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df["date"], y=df["premium_pct"], mode="lines", name="Daily premium",
        line=dict(width=1, color="#7fa8d9"),
        customdata=df[["close", "nav"]].values,
        hovertemplate="Date: %{x}<br>Premium: %{y:.2f}%<br>Price: ₹%{customdata[0]:.2f}<br>NAV: ₹%{customdata[1]:.4f}<extra></extra>",
    ))
    colors = ["#e07a5f", "#81b29a", "#f2cc8f", "#3d405b"]
    for i, w in enumerate(ma_windows):
        col = f"premium_ma_{w}d"
        if col in df.columns:
            fig.add_trace(go.Scatter(
                x=df["date"], y=df[col], mode="lines", name=f"{w}D avg",
                line=dict(width=2, color=colors[i % len(colors)]),
            ))
    fig.add_hline(y=0, line_dash="dash", line_color="gray")
    fig.update_layout(
        title="Premium / Discount to NAV (%)", yaxis_title="Premium %",
        hovermode="x unified", height=450,
    )
    return fig


def price_vs_nav_chart(df: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df["date"], y=df["close"], name="Market price", line=dict(color="#3d405b")))
    fig.add_trace(go.Scatter(x=df["date"], y=df["nav"], name="NAV", line=dict(color="#81b29a")))
    fig.update_layout(title="Market Price vs NAV", yaxis_title="₹", hovermode="x unified", height=400)
    return fig


def premium_histogram(df: pd.DataFrame, current_premium: float) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Histogram(x=df["premium_pct"], nbinsx=50, marker_color="#7fa8d9", name="Premium distribution"))
    median = df["premium_pct"].median()
    fig.add_vline(x=median, line_dash="dash", line_color="#81b29a", annotation_text=f"Median {median:.1f}%")
    fig.add_vline(x=current_premium, line_dash="solid", line_color="#e07a5f", annotation_text=f"Current {current_premium:.1f}%")
    fig.update_layout(title="Premium Distribution", xaxis_title="Premium %", height=400)
    return fig
