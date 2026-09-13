import datetime as dt
import numpy as np
import pandas as pd

from src.config.etfs import STAT_PERIODS
from src.analytics.percentiles import percentile_rank, value_at_percentiles


def _slice_period(df: pd.DataFrame, days: int | None) -> pd.DataFrame:
    if days is None:
        return df
    cutoff = df["date"].max() - pd.Timedelta(days=days)
    return df[df["date"] > cutoff]


def period_statistics(df: pd.DataFrame, inception_date: str) -> dict:
    """
    df: joined dataframe with 'date' and 'premium_pct'.
    Returns {period_label: {avg, median, min, max, std, p5, p25, p75, p95, n}}
    N/A (None values) when insufficient history exists for that period.
    """
    inception = pd.Timestamp(inception_date)
    results = {}
    for label, days in STAT_PERIODS.items():
        if days is not None:
            history_span_days = (df["date"].max() - inception).days if not df.empty else 0
            if history_span_days < days:
                results[label] = {k: None for k in
                                   ("avg", "median", "min", "max", "std", "p5", "p25", "p75", "p95", "n")}
                continue
        sub = _slice_period(df, days)
        vals = sub["premium_pct"].dropna().values
        if len(vals) == 0:
            results[label] = {k: None for k in
                               ("avg", "median", "min", "max", "std", "p5", "p25", "p75", "p95", "n")}
            continue
        pcts = value_at_percentiles(vals, (5, 25, 75, 95))
        results[label] = {
            "avg": float(np.mean(vals)),
            "median": float(np.median(vals)),
            "min": float(np.min(vals)),
            "max": float(np.max(vals)),
            "std": float(np.std(vals, ddof=1)) if len(vals) > 1 else 0.0,
            "p5": pcts[5], "p25": pcts[25], "p75": pcts[75], "p95": pcts[95],
            "n": int(len(vals)),
        }
    return results


def current_percentile_by_period(df: pd.DataFrame, current_premium: float) -> dict:
    """Current premium's percentile rank within each lookback window."""
    out = {}
    for label, days in {"Since Inception": None, "3Y": 365 * 3, "1Y": 365, "6M": 182}.items():
        sub = _slice_period(df, days)
        out[label] = percentile_rank(current_premium, sub["premium_pct"].dropna().values)
    return out
