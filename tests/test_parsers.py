import datetime as dt

from src.parsers.nav_parser import parse_amfi_chunk, parse_and_dedupe as nav_dedupe
from src.parsers.price_parser import parse_nse_chunk, parse_and_dedupe as price_dedupe
from src.pipeline.validation import validate_nav_rows, validate_price_rows, flag_suspicious_moves


def test_parse_mfapi_payload_basic():
    payload = {
        "meta": {"scheme_code": 12345, "isin_growth": "INF769K01HF4"},
        "data": [
            {"date": "09-09-2026", "nav": "66.8472"},
            {"date": "08-09-2026", "nav": "66.7106"},
        ],
        "status": "SUCCESS",
    }
    rows = parse_amfi_chunk(payload)
    assert len(rows) == 2
    assert {"date": "2026-09-08", "nav": 66.7106} in rows
    assert {"date": "2026-09-09", "nav": 66.8472} in rows


def test_nav_dedupe_across_payloads_last_wins():
    p1 = {"data": [{"date": "01-01-2026", "nav": "100.0"}]}
    p2 = {"data": [{"date": "01-01-2026", "nav": "101.0"}]}  # corrected value
    out = nav_dedupe([p1, p2])
    assert out == [{"date": "2026-01-01", "nav": 101.0}]


def test_nav_dedupe_filters_date_range():
    p1 = {"data": [
        {"date": "01-01-2026", "nav": "100.0"},
        {"date": "15-06-2026", "nav": "110.0"},
        {"date": "01-01-2027", "nav": "120.0"},
    ]}
    out = nav_dedupe([p1], start=dt.date(2026, 1, 1), end=dt.date(2026, 12, 31))
    assert [r["date"] for r in out] == ["2026-01-01", "2026-06-15"]


def test_parse_yahoo_chunk_basic():
    payload = {"chart": {"result": [{
        "timestamp": [1757308800],  # ~2025-09-08 in epoch seconds
        "indicators": {"quote": [{
            "open": [220.0], "high": [226.0], "low": [219.0],
            "close": [225.70], "volume": [1000],
        }]},
    }]}}
    rows = parse_nse_chunk(payload)
    assert len(rows) == 1
    assert rows[0]["close"] == 225.70
    assert rows[0]["traded_value"] == 225.70 * 1000


def test_parse_yahoo_chunk_skips_null_close():
    payload = {"chart": {"result": [{
        "timestamp": [1757308800, 1757395200],
        "indicators": {"quote": [{
            "open": [220.0, None], "high": [226.0, None], "low": [219.0, None],
            "close": [225.70, None], "volume": [1000, None],
        }]},
    }]}}
    rows = parse_nse_chunk(payload)
    assert len(rows) == 1  # the None-close bar is dropped, not fabricated


def test_price_dedupe_and_filter():
    p1 = {"chart": {"result": [{"timestamp": [1735689600], "indicators": {"quote": [{"close": [100]}]}}]}}
    p2 = {"chart": {"result": [{"timestamp": [1735689600], "indicators": {"quote": [{"close": [105]}]}}]}}
    out = price_dedupe([p1, p2])
    assert out[0]["close"] == 105


def test_validate_nav_rejects_zero_and_negative():
    rows = [{"date": "2026-01-01", "nav": 0}, {"date": "2026-01-02", "nav": -5}, {"date": "2026-01-03", "nav": 10}]
    clean, rejected = validate_nav_rows(rows)
    assert len(clean) == 1
    assert len(rejected) == 2


def test_validate_price_rejects_bad_date():
    rows = [{"date": "not-a-date", "close": 100}, {"date": "2026-01-01", "close": 100}]
    clean, rejected = validate_price_rows(rows)
    assert len(clean) == 1


def test_validate_rejects_duplicate_dates():
    rows = [{"date": "2026-01-01", "nav": 100}, {"date": "2026-01-01", "nav": 101}]
    clean, rejected = validate_nav_rows(rows)
    assert len(clean) == 1
    assert len(rejected) == 1


def test_flag_suspicious_moves():
    rows = [{"date": "2026-01-01", "nav": 100}, {"date": "2026-01-02", "nav": 125}]  # +25%
    flags = flag_suspicious_moves(rows, "nav")
    assert len(flags) == 1
    assert flags[0]["date"] == "2026-01-02"
