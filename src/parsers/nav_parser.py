"""
Parses mfapi.in's NAV history payload into normalized rows and filters to
a requested date range.

mfapi.in payload shape:
    {"meta": {...}, "data": [{"date": "13-09-2026", "nav": "66.7106"}, ...], "status": "SUCCESS"}
"data" is typically newest-first and covers the scheme's entire history.
"""
import datetime as dt
import logging

log = logging.getLogger(__name__)


def _parse_mfapi_date(raw: str) -> str | None:
    try:
        return dt.datetime.strptime(raw.strip(), "%d-%m-%Y").strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        return None


def parse_amfi_chunk(payload: dict) -> list[dict]:
    """Kept name for interface parity with the rest of the pipeline."""
    rows = []
    for rec in payload.get("data", []):
        date_val = _parse_mfapi_date(rec.get("date", ""))
        if not date_val:
            continue
        try:
            nav_val = float(rec["nav"])
        except (KeyError, ValueError, TypeError):
            continue
        if nav_val > 0:
            rows.append({"date": date_val, "nav": nav_val})
    return rows


def parse_and_dedupe(raw_chunks: list[dict], start: dt.date | None = None, end: dt.date | None = None) -> list[dict]:
    """Merge payload(s), dedupe by date (last write wins), filter to [start, end], sort by date."""
    by_date: dict[str, float] = {}
    for chunk in raw_chunks:
        for row in parse_amfi_chunk(chunk):
            by_date[row["date"]] = row["nav"]

    dates = sorted(by_date)
    if start is not None:
        dates = [d for d in dates if dt.date.fromisoformat(d) >= start]
    if end is not None:
        dates = [d for d in dates if dt.date.fromisoformat(d) <= end]
    return [{"date": d, "nav": by_date[d]} for d in dates]
