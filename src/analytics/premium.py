"""
The one formula this whole app exists to compute. No rounding here —
rounding happens only at display time.
"""
import pandas as pd


def compute_premium_pct(market_price: float, nav: float) -> float:
    if nav is None or nav == 0:
        raise ValueError("NAV must be non-zero to compute premium")
    return ((market_price / nav) - 1) * 100


def add_premium_column(joined_df: pd.DataFrame) -> pd.DataFrame:
    """joined_df must have 'close' (market price) and 'nav' columns."""
    df = joined_df.copy()
    df["premium_pct"] = (df["close"] / df["nav"] - 1) * 100
    return df


def add_rolling_averages(df: pd.DataFrame, windows: list[int]) -> pd.DataFrame:
    """Adds premium_ma_{N}d columns. Requires df sorted by date, has premium_pct."""
    df = df.sort_values("date").reset_index(drop=True)
    for w in windows:
        # min_periods=max(1, w//3) so early data isn't all-NaN, but still
        # meaningfully smoothed rather than a single point.
        df[f"premium_ma_{w}d"] = df["premium_pct"].rolling(
            window=w, min_periods=max(1, w // 3)
        ).mean()
    return df
