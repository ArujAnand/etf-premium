"""
ETF market-price downloader — Yahoo Finance chart API.

NSE's own historical-data API (nseindia.com/api/historical/...) requires a
warmed browser-like session and actively rate-limits/blocks scripted
clients (503s are typical, not occasional) — it isn't practical as a
scriptable primary source. Yahoo Finance's public chart endpoint carries
the same NSE-listed closing prices (symbol + ".NS") without that fight, so
it's used here. Filename/module kept as `nse` since it's still the NSE
listing's price — the transport just isn't NSE's own website.

If you want the NSE site itself as validation later, section 37 of the
original spec (Validation against external sources) is the right place
for it, not the primary pipeline.
"""
import datetime as dt
import logging
import time

import requests

log = logging.getLogger(__name__)

YF_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
CHUNK_DAYS = 365 * 2       # a couple of years per request, kept polite
MAX_RETRIES = 4
BASE_BACKOFF_SECONDS = 2
REQUEST_TIMEOUT = 20

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


def _date_chunks(start: dt.date, end: dt.date):
    cur = start
    while cur <= end:
        chunk_end = min(cur + dt.timedelta(days=CHUNK_DAYS), end)
        yield cur, chunk_end
        cur = chunk_end + dt.timedelta(days=1)


def _to_unix(d: dt.date) -> int:
    return int(dt.datetime.combine(d, dt.time.min, tzinfo=dt.timezone.utc).timestamp())


def _fetch_chunk(symbol: str, start: dt.date, end: dt.date) -> dict:
    # Yahoo's `period2` is exclusive-ish in practice near the boundary —
    # pad by one day so the requested end date is reliably included.
    params = {
        "period1": _to_unix(start),
        "period2": _to_unix(end + dt.timedelta(days=1)),
        "interval": "1d",
        "events": "history",
    }
    url = YF_CHART_URL.format(symbol=symbol)

    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 429:
                raise requests.HTTPError(f"Rate limited (429) on {start}..{end}")
            resp.raise_for_status()
            payload = resp.json()
            chart = payload.get("chart", {})
            if chart.get("error"):
                raise ValueError(f"Yahoo Finance error for {symbol} {start}..{end}: {chart['error']}")
            if not chart.get("result"):
                raise ValueError(f"Malformed/empty Yahoo Finance response for {symbol} {start}..{end}")
            return payload
        except (requests.RequestException, ValueError) as e:
            last_err = e
            wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
            log.warning(
                "Yahoo Finance request failed for %s -> %s (attempt %d/%d): %s. Retrying in %ss...",
                start, end, attempt, MAX_RETRIES, e, wait,
            )
            time.sleep(wait)

    raise RuntimeError(
        f"Yahoo Finance request permanently FAILED for {symbol} {start} -> {end}: {last_err}. "
        f"Existing database data was not modified."
    )


def download_price_history(symbol: str, start: dt.date, end: dt.date) -> list[dict]:
    """
    symbol: NSE trading symbol without suffix (e.g. 'MAFANG') — '.NS' is
    added here for Yahoo. Returns list of raw chart payloads, one per chunk.
    """
    yahoo_symbol = f"{symbol}.NS"
    raw_chunks = []
    for c_start, c_end in _date_chunks(start, end):
        log.info("Downloading price %s..%s for %s", c_start, c_end, yahoo_symbol)
        raw_chunks.append(_fetch_chunk(yahoo_symbol, c_start, c_end))
        time.sleep(1)  # be polite
    return raw_chunks
