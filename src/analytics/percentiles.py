import numpy as np


def percentile_rank(current_value: float, historical_values) -> float | None:
    """
    % of historical observations <= current_value.
    Returns None if there's no history to rank against.
    """
    arr = np.asarray(historical_values, dtype=float)
    arr = arr[~np.isnan(arr)]
    if len(arr) == 0:
        return None
    return float((arr <= current_value).sum()) / len(arr) * 100


def value_at_percentiles(values, percentiles=(5, 25, 50, 75, 95)) -> dict:
    arr = np.asarray(values, dtype=float)
    arr = arr[~np.isnan(arr)]
    if len(arr) == 0:
        return {p: None for p in percentiles}
    return {p: float(np.percentile(arr, p)) for p in percentiles}


def threshold_frequencies(values, thresholds) -> dict:
    """% of days where value > threshold, for each threshold. Plus % at/below 0 (discount)."""
    arr = np.asarray(values, dtype=float)
    arr = arr[~np.isnan(arr)]
    if len(arr) == 0:
        return {t: None for t in thresholds} | {"discount": None}
    out = {"discount": float((arr < 0).sum()) / len(arr) * 100}
    for t in thresholds:
        out[t] = float((arr > t).sum()) / len(arr) * 100
    return out
