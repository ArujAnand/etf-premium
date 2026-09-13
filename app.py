import datetime as dt

import pandas as pd
import streamlit as st

from src.config.etfs import ETF_CONFIG, all_symbols, DB_PATH, ROLLING_WINDOWS, PREMIUM_THRESHOLDS
from src.database.connection import get_connection
from src.database.repository import get_etf_id, load_joined_df
from src.database.schema import init_db
from src.analytics.premium import add_premium_column, add_rolling_averages
from src.analytics.statistics import period_statistics, current_percentile_by_period
from src.analytics.percentiles import threshold_frequencies
from src.dashboard.charts import premium_chart, price_vs_nav_chart, premium_histogram

st.set_page_config(page_title="ETF Premium/Discount Analyzer", layout="wide")
init_db(DB_PATH)


@st.cache_data(ttl=300)
def load_etf_df(symbol: str) -> pd.DataFrame:
    with get_connection(DB_PATH) as conn:
        etf_id = get_etf_id(conn, symbol)
        df = load_joined_df(conn, etf_id)
    if df.empty:
        return df
    df = add_premium_column(df)
    df = add_rolling_averages(df, ROLLING_WINDOWS)
    return df


st.title("Indian ETF Premium / Discount Analyzer")
st.caption("Historical premium = NSE closing price vs official EOD NAV. Not iNAV. Not investment advice.")

page = st.sidebar.radio("View", ["Single ETF", "Comparison"])

if page == "Single ETF":
    symbol = st.sidebar.selectbox("ETF", all_symbols())
    df = load_etf_df(symbol)
    cfg = ETF_CONFIG[symbol]

    if df.empty:
        st.warning(
            f"No data yet for {symbol}. Run:\n\n"
            f"`python -m src.pipeline.backfill --etf {symbol}`"
        )
        st.stop()

    latest = df.iloc[-1]

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Market Price", f"₹{latest['close']:.2f}")
    c2.metric("NAV", f"₹{latest['nav']:.4f}")
    c3.metric("Premium", f"{latest['premium_pct']:.2f}%")
    since_incep_vals = df["premium_pct"].dropna().values
    pct_rank = None
    if len(since_incep_vals):
        from src.analytics.percentiles import percentile_rank
        pct_rank = percentile_rank(latest["premium_pct"], since_incep_vals)
    c4.metric("Percentile (since inception)", f"{pct_rank:.0f}th" if pct_rank is not None else "N/A")

    st.caption(
        f"Difference: ₹{latest['close'] - latest['nav']:.4f} · "
        f"Last date: {latest['date'].date()} · "
        f"{cfg['name']} ({cfg['isin']})"
    )

    st.plotly_chart(premium_chart(df, ROLLING_WINDOWS), use_container_width=True)
    st.plotly_chart(price_vs_nav_chart(df), use_container_width=True)
    st.plotly_chart(premium_histogram(df, latest["premium_pct"]), use_container_width=True)

    st.subheader("Period statistics")
    stats = period_statistics(df, cfg["inception"])
    stats_df = pd.DataFrame(stats).T
    stats_df = stats_df.rename(columns={
        "avg": "Avg", "median": "Median", "min": "Min", "max": "Max",
        "std": "Std Dev", "p5": "5th pct", "p25": "25th pct",
        "p75": "75th pct", "p95": "95th pct", "n": "N obs",
    })
    st.dataframe(stats_df.style.format(precision=2, na_rep="N/A"), use_container_width=True)

    st.subheader("Current premium percentile by lookback window")
    pct_by_period = current_percentile_by_period(df, latest["premium_pct"])
    cols = st.columns(len(pct_by_period))
    for col, (label, val) in zip(cols, pct_by_period.items()):
        col.metric(label, f"{val:.0f}th" if val is not None else "N/A")

    st.subheader("Threshold frequency")
    freqs = threshold_frequencies(df["premium_pct"].values, PREMIUM_THRESHOLDS)
    freq_rows = [{"Threshold": "At discount (<0%)", "% of days": freqs["discount"]}]
    freq_rows += [{"Threshold": f"> {t}%", "% of days": freqs[t]} for t in PREMIUM_THRESHOLDS]
    st.dataframe(pd.DataFrame(freq_rows).style.format({"% of days": "{:.1f}%"}), use_container_width=True)

    st.subheader("Date lookup")
    lookup_date = st.date_input(
        "Enter date", value=latest["date"].date(),
        min_value=df["date"].min().date(), max_value=df["date"].max().date(),
    )
    match = df[df["date"] == pd.Timestamp(lookup_date)]
    if not match.empty:
        row = match.iloc[0]
        st.write(f"Market price: ₹{row['close']:.2f} · NAV: ₹{row['nav']:.4f} · Premium: {row['premium_pct']:.2f}%")
    else:
        st.write("No data for that date (non-trading day or not yet backfilled).")

    st.subheader("Historical daily data")
    display_df = df[["date", "close", "nav", "premium_pct", "volume", "traded_value"]].copy()
    display_df.columns = ["Date", "Market Price", "NAV", "Premium %", "Volume", "Traded Value"]
    display_df = display_df.sort_values("Date", ascending=False)
    st.dataframe(display_df, use_container_width=True, height=350)
    st.download_button(
        "Download CSV", display_df.to_csv(index=False).encode(),
        file_name=f"{symbol}_premium_history.csv", mime="text/csv",
    )

    with st.expander("Data sources"):
        st.write("NAV: AMFI historical NAV report (official EOD NAV).")
        st.write("Price: NSE historical closing price.")
        st.write("Premium calculated locally as ((price / NAV) - 1) * 100. Not sourced from any third party.")

else:
    st.subheader("ETF Comparison")
    dfs = {s: load_etf_df(s) for s in all_symbols()}
    rows = []
    for s, d in dfs.items():
        if d.empty:
            rows.append({"ETF": s, "Current premium": None, "1Y avg": None, "3Y avg": None,
                         "Median": None, "Current percentile": None, ">20% freq": None})
            continue
        latest_p = d.iloc[-1]["premium_pct"]
        stats = period_statistics(d, ETF_CONFIG[s]["inception"])
        from src.analytics.percentiles import percentile_rank
        pct = percentile_rank(latest_p, d["premium_pct"].dropna().values)
        freqs = threshold_frequencies(d["premium_pct"].values, [20])
        rows.append({
            "ETF": s,
            "Current premium": latest_p,
            "1Y avg": stats["1Y"]["avg"],
            "3Y avg": stats["3Y"]["avg"],
            "Median": stats["Since Inception"]["median"],
            "Current percentile": pct,
            ">20% freq": freqs[20],
        })
    comp_df = pd.DataFrame(rows).set_index("ETF")
    st.dataframe(comp_df.style.format(precision=2, na_rep="N/A"), use_container_width=True)

    import plotly.graph_objects as go
    fig = go.Figure()
    for s, d in dfs.items():
        if not d.empty:
            fig.add_trace(go.Scatter(x=d["date"], y=d["premium_pct"], name=s))
    fig.add_hline(y=0, line_dash="dash", line_color="gray")
    fig.update_layout(title="Premium history — all ETFs", yaxis_title="Premium %", height=450)
    st.plotly_chart(fig, use_container_width=True)
