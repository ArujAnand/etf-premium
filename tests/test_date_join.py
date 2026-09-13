import pandas as pd


def test_inner_join_by_date_only_common_dates():
    nav = pd.DataFrame({"date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]), "nav": [100, 101, 102]})
    price = pd.DataFrame({"date": pd.to_datetime(["2024-01-02", "2024-01-03", "2024-01-04"]), "close": [200, 201, 202]})
    merged = pd.merge(price, nav, on="date", how="inner")
    assert list(merged["date"].dt.strftime("%Y-%m-%d")) == ["2024-01-02", "2024-01-03"]


def test_join_not_by_row_position():
    # NAV row 0 must NOT pair with price row 0 just because both are first rows.
    nav = pd.DataFrame({"date": pd.to_datetime(["2024-01-01", "2024-01-05"]), "nav": [100, 105]})
    price = pd.DataFrame({"date": pd.to_datetime(["2024-01-03", "2024-01-05"]), "close": [200, 210]})
    merged = pd.merge(price, nav, on="date", how="inner")
    assert len(merged) == 1
    assert merged.iloc[0]["date"] == pd.Timestamp("2024-01-05")
    assert merged.iloc[0]["nav"] == 105
    assert merged.iloc[0]["close"] == 210


def test_no_forward_fill_missing_nav():
    nav = pd.DataFrame({"date": pd.to_datetime(["2024-01-01", "2024-01-03"]), "nav": [100, 102]})
    price = pd.DataFrame({"date": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]), "close": [200, 201, 202]})
    merged = pd.merge(price, nav, on="date", how="inner")
    # 2024-01-02 has price but no NAV — must be dropped, not filled.
    assert "2024-01-02" not in merged["date"].dt.strftime("%Y-%m-%d").values
    assert len(merged) == 2
