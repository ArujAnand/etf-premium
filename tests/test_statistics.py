import numpy as np
import pandas as pd
from src.analytics.percentiles import percentile_rank, value_at_percentiles, threshold_frequencies
from src.analytics.statistics import period_statistics


def test_percentile_rank_known_array():
    # 1000 obs, 820 <= 20 -> 82nd percentile
    arr = np.concatenate([np.full(820, 10.0), np.full(180, 30.0)])
    assert abs(percentile_rank(20.0, arr) - 82.0) < 1e-9


def test_percentile_rank_empty():
    assert percentile_rank(10, []) is None


def test_value_at_percentiles_basic():
    arr = list(range(1, 101))  # 1..100
    out = value_at_percentiles(arr, (50,))
    assert abs(out[50] - 50.5) < 1.0


def test_threshold_frequencies():
    arr = [5, 15, 25, 35, -2, 8]
    out = threshold_frequencies(arr, [0, 10, 20, 30])
    # -2 is the only discount value -> 1/6
    assert abs(out["discount"] - (1 / 6 * 100)) < 1e-9
    # >30: only 35 -> 1/6
    assert abs(out[30] - (1 / 6 * 100)) < 1e-9


def test_period_statistics_na_when_insufficient_history():
    # Only 10 days of data, inception "today" -> 5Y bucket must be N/A, not fabricated
    dates = pd.date_range("2026-09-01", periods=10)
    df = pd.DataFrame({"date": dates, "premium_pct": np.linspace(10, 20, 10)})
    stats = period_statistics(df, inception_date="2026-09-01")
    assert stats["5Y"]["avg"] is None
    assert stats["1Y"]["avg"] is None
    assert stats["Since Inception"]["avg"] is not None


def test_period_statistics_no_fabrication_short_history():
    # Only 5 days of real history exist. Even the 1M bucket needs 30 days of
    # span to be trustworthy, so it must be N/A too, not a fake 5-point avg.
    dates = pd.date_range("2026-01-01", periods=5)
    df = pd.DataFrame({"date": dates, "premium_pct": [10, 11, 12, 13, 14]})
    stats = period_statistics(df, inception_date="2026-01-01")
    assert stats["1M"]["avg"] is None
    assert stats["3Y"]["avg"] is None
    assert stats["Since Inception"]["n"] == 5
