"""
NAV downloader — mfapi.in.

AMFI's own NAVHistoryReport.aspx is a classic ASP.NET WebForms page: it
needs __VIEWSTATE/__EVENTVALIDATION tokens from a prior GET and isn't a
stable POST-only API, which is why direct POSTs to it 404/fail from a
script. mfapi.in republishes AMFI's own official NAV data (same underlying
numbers, updated ~6x/day) over a plain JSON API with no auth and no
session/viewstate dance, so this is what the downloader uses.

Resolution is by ISIN, not by name (names are ambiguous — e.g. "Mirae
Asset NYSE FANG+ ETF" vs "...ETF Fund of Fund" vs "...Regular Plan"). The
full scheme list (~10-40k schemes) is fetched once and cached locally so
this ISIN -> scheme_code lookup doesn't hit the API on every run.
"""
import datetime as dt
import json
import logging
import os
import time

import requests

log = logging.getLogger(__name__)

MFAPI_BASE = "https://api.mfapi.in/mf"
SCHEME_LIST_CACHE = os.path.join("data", "raw", "mfapi_schemes.json")
CACHE_MAX_AGE_HOURS = 24
MAX_RETRIES = 4
BASE_BACKOFF_SECONDS = 2
REQUEST_TIMEOUT = 30


def _get_with_retry(url: str, params: dict | None = None) -> dict | list:
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 429:
                raise requests.HTTPError(f"Rate limited (429) on {url}")
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as e:
            last_err = e
            wait = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
            log.warning("mfapi.in request failed for %s (attempt %d/%d): %s. Retrying in %ss...",
                        url, attempt, MAX_RETRIES, e, wait)
            time.sleep(wait)
    raise RuntimeError(f"mfapi.in request permanently FAILED for {url}: {last_err}. "
                        f"Existing database data was not modified.")


def _load_scheme_list() -> list[dict]:
    os.makedirs(os.path.dirname(SCHEME_LIST_CACHE), exist_ok=True)
    if os.path.exists(SCHEME_LIST_CACHE):
        age_hours = (time.time() - os.path.getmtime(SCHEME_LIST_CACHE)) / 3600
        if age_hours < CACHE_MAX_AGE_HOURS:
            with open(SCHEME_LIST_CACHE, "r", encoding="utf-8") as f:
                return json.load(f)

    log.info("Downloading full mfapi.in scheme list (cached for %sh)...", CACHE_MAX_AGE_HOURS)
    data = _get_with_retry(MFAPI_BASE)
    with open(SCHEME_LIST_CACHE, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def resolve_scheme_code(isin: str) -> int:
    """Finds the mfapi.in scheme_code matching an ISIN (growth or IDCW)."""
    schemes = _load_scheme_list()
    for s in schemes:
        if s.get("isinGrowth") == isin or s.get("isinDivReinvestment") == isin:
            return s["schemeCode"]
    raise RuntimeError(
        f"No mfapi.in scheme found for ISIN {isin}. "
        f"The scheme list cache may be stale — delete {SCHEME_LIST_CACHE} and retry, "
        f"or the fund may not be tracked by mfapi.in yet."
    )


def download_nav_history(isin: str, start: dt.date, end: dt.date) -> list[dict]:
    """
    Returns a single-element list containing the raw mfapi.in payload
    (kept as a list for interface parity with the chunked AMFI downloader
    this replaces). The parser filters to [start, end].
    """
    scheme_code = resolve_scheme_code(isin)
    log.info("Downloading mfapi.in NAV history for scheme %s (ISIN %s)", scheme_code, isin)
    payload = _get_with_retry(f"{MFAPI_BASE}/{scheme_code}")
    if payload.get("status") != "SUCCESS" and "data" not in payload:
        raise RuntimeError(f"mfapi.in returned unexpected payload for scheme {scheme_code}: {payload}")
    return [payload]
