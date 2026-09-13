import pandas as pd
from src.analytics.premium import compute_premium_pct, add_premium_column, add_rolling_averages


def test_premium_positive():
    assert abs(compute_premium_pct(120, 100) - 20.0) < 1e-9


def test_discount_negative():
    assert abs(compute_premium_pct(90, 100) - (-10.0)) < 1e-9


def test_premium_zero():
    assert abs(compute_premium_pct(100, 100) - 0.0) < 1e-9


def test_no_rounding_precision():
    result = compute_premium_pct(225.70, 172.1398)
    # ground truth: ((225.70 / 172.1398) - 1) * 100
    expected = ((225.70 / 172.1398) - 1) * 100
    assert abs(result - expected) < 1e-9


def test_nav_zero_raises():
    try:
        compute_premium_pct(100, 0)
        assert False, "should have raised"
    except ValueError:
        pass


def test_add_premium_column():
    df = pd.DataFrame({"close": [120, 90], "nav": [100, 100]})
    out = add_premium_column(df)
    vals = list(out["premium_pct"])
    assert abs(vals[0] - 20.0) < 1e-9
    assert abs(vals[1] - (-10.0)) < 1e-9


def test_rolling_averages_present():
    df = pd.DataFrame({
        "date": pd.date_range("2024-01-01", periods=10),
        "premium_pct": [10, 12, 11, 13, 14, 12, 11, 15, 16, 14],
    })
    out = add_rolling_averages(df, [3])
    assert "premium_ma_3d" in out.columns
    assert not out["premium_ma_3d"].isna().all()
