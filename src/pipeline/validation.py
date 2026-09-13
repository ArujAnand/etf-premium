"""
Data validation. Rejects invalid rows outright; flags suspicious ones
without deleting them (caller decides what to do with flags).
"""
import datetime as dt
import logging

from src.config.etfs import SUSPICIOUS_DAILY_CHANGE_PCT

log = logging.getLogger(__name__)


def _valid_date(date_str: str) -> bool:
    try:
        dt.datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


def validate_nav_rows(rows: list[dict]) -> tuple[list[dict], list[str]]:
    """Returns (clean_rows, rejection_reasons)."""
    clean, rejected = [], []
    seen_dates = set()
    for r in rows:
        if not _valid_date(r.get("date", "")):
            rejected.append(f"invalid date: {r}")
            continue
        if r.get("nav") is None or r["nav"] <= 0:
            rejected.append(f"nav <= 0: {r}")
            continue
        if r["date"] in seen_dates:
            rejected.append(f"duplicate date (kept first): {r}")
            continue
        seen_dates.add(r["date"])
        clean.append(r)
    return clean, rejected


def validate_price_rows(rows: list[dict]) -> tuple[list[dict], list[str]]:
    clean, rejected = [], []
    seen_dates = set()
    for r in rows:
        if not _valid_date(r.get("date", "")):
            rejected.append(f"invalid date: {r}")
            continue
        if r.get("close") is None or r["close"] <= 0:
            rejected.append(f"close <= 0: {r}")
            continue
        if r["date"] in seen_dates:
            rejected.append(f"duplicate date (kept first): {r}")
            continue
        seen_dates.add(r["date"])
        clean.append(r)
    return clean, rejected


def flag_suspicious_moves(rows: list[dict], value_key: str) -> list[dict]:
    """
    rows must be sorted by date ascending. Flags (does not remove) any
    day-over-day change exceeding SUSPICIOUS_DAILY_CHANGE_PCT.
    Returns list of {'date', 'change_pct'} flags.
    """
    flags = []
    prev = None
    for r in rows:
        v = r[value_key]
        if prev is not None and prev > 0:
            change_pct = ((v / prev) - 1) * 100
            if abs(change_pct) > SUSPICIOUS_DAILY_CHANGE_PCT:
                flags.append({"date": r["date"], "change_pct": round(change_pct, 2)})
        prev = v
    return flags


def missing_dates_report(nav_dates: set, price_dates: set) -> dict:
    return {
        "nav_only": sorted(nav_dates - price_dates),
        "price_only": sorted(price_dates - nav_dates),
        "common_count": len(nav_dates & price_dates),
    }
