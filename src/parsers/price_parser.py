"""
Parses Yahoo Finance chart payloads into normalized rows, and dedupes
across chunk overlaps.

Payload shape (relevant parts):
    {"chart": {"result": [{
        "timestamp": [1694... , ...],
        "indicators": {"quote": [{"open": [...], "high": [...], "low": [...],
                                   "close": [...], "volume": [...]}]}
    }]}}

Timestamps are UTC epoch seconds for each trading day; converted to the
exchange's local calendar date (Asia/Kolkata) since that's what the rest
of the pipeline joins on.
"""
import datetime as dt
import logging
from zoneinfo import ZoneInfo

log = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")


def _epoch_to_ist_date(ts: int) -> str:
    return dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).astimezone(IST).strftime("%Y-%m-%d")


def parse_nse_chunk(payload: dict) -> list[dict]:
    """Kept name for interface parity with the rest of the pipeline."""
    rows = []
    results = payload.get("chart", {}).get("result") or []
    if not results:
        return rows
    result = results[0]
    timestamps = result.get("timestamp") or []
    quote = (result.get("indicators", {}).get("quote") or [{}])[0]

    opens = quote.get("open", [])
    highs = quote.get("high", [])
    lows = quote.get("low", [])
    closes = quote.get("close", [])
    volumes = quote.get("volume", [])

    for i, ts in enumerate(timestamps):
        close = closes[i] if i < len(closes) else None
        if close is None or close <= 0:
            continue  # non-trading day placeholder / missing bar
        date_val = _epoch_to_ist_date(ts)
        vol = volumes[i] if i < len(volumes) else None
        close_f = float(close)
        rows.append({
            "date": date_val,
            "open": float(opens[i]) if i < len(opens) and opens[i] is not None else None,
            "high": float(highs[i]) if i < len(highs) and highs[i] is not None else None,
            "low": float(lows[i]) if i < len(lows) and lows[i] is not None else None,
            "close": close_f,
            "volume": float(vol) if vol is not None else None,
            "traded_value": (float(vol) * close_f) if vol is not None else None,
        })
    return rows


def parse_and_dedupe(raw_chunks: list[dict], start: dt.date | None = None, end: dt.date | None = None) -> list[dict]:
    by_date: dict[str, dict] = {}
    for chunk in raw_chunks:
        for row in parse_nse_chunk(chunk):
            by_date[row["date"]] = row

    dates = sorted(by_date)
    if start is not None:
        dates = [d for d in dates if dt.date.fromisoformat(d) >= start]
    if end is not None:
        dates = [d for d in dates if dt.date.fromisoformat(d) <= end]
    return [by_date[d] for d in dates]
