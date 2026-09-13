# Indian ETF Premium/Discount Analyzer

Local research tool. Answers: how expensive or cheap is an ETF vs its
official NAV, today and historically.

```text
premium_pct = ((market_price / nav) - 1) * 100
```

Positive = trading above NAV. Negative = trading below NAV (discount).

Configured ETFs: MAFANG, MASPTOP50 (`src/config/etfs.py`). Add more by
adding a config entry — nothing else needs to change.

## Setup

```bash
pip install -r requirements.txt
python -m src.database.schema
```

## Backfill history

```bash
python -m src.pipeline.backfill --all
# or one ETF
python -m src.pipeline.backfill --etf MAFANG
# custom range
python -m src.pipeline.backfill --etf MAFANG --start 2022-01-01 --end 2022-06-01
# redownload even if data exists
python -m src.pipeline.backfill --etf MAFANG --force
```

## Daily incremental update

```bash
python -m src.pipeline.update
```

Finds the latest stored NAV/price date per ETF, downloads only what's
missing, validates it, and prints what changed.

## Dashboard

```bash
streamlit run app.py
```

Sidebar: pick ETF or the Comparison view. Shows current price/NAV/premium,
premium history chart with 30/90/180/365-day rolling averages, price-vs-NAV
chart, premium distribution histogram, period statistics table (1M through
5Y and since inception — periods with insufficient history show N/A, never
a fabricated number), current premium's percentile rank, threshold
frequency table, a date lookup box, and a sortable daily table with CSV
export.

## Data sources

- **NAV**: [mfapi.in](https://www.mfapi.in), a free JSON API that
  republishes AMFI's own official end-of-day NAV (same numbers AMFI
  publishes, updated ~6x/day, no auth/session dance). AMFI's own
  `NAVHistoryReport.aspx` is a classic ASP.NET WebForms page — it needs
  viewstate tokens from a prior page load and isn't a stable POST-only
  API, which is why a direct script POST to it fails. Resolution is by
  **ISIN** (not name — scheme names are ambiguous across Growth/IDCW/Fund-
  of-Fund variants), against mfapi.in's full scheme list, cached locally
  for 24h at `data/raw/mfapi_schemes.json`.
- **Price**: Yahoo Finance's public chart API, using the NSE symbol with a
  `.NS` suffix (e.g. `MAFANG.NS`). NSE's own `nseindia.com` historical API
  requires a warmed browser session and blocks scripted clients hard
  (503s, not occasional) — it isn't practical as a primary scriptable
  source. This is still the NSE-listed closing price; only the transport
  changed.
- Every stored row keeps `source` and `retrieved_at` for auditability.
- **iNAV is never used for historical calculations** — only official EOD
  NAV. The dashboard states this explicitly.
- If you'd rather pull straight from NSE/AMFI's own sites (e.g. for
  section 37-style validation against a second source), that's a
  reasonable thing to add to `src/sources/` later — it just isn't the
  default anymore, since scripted access to both kept failing.

## Data handling rules that matter

- NAV and price are joined **on date**, never by row position — their
  calendars don't fully overlap (market holidays, NAV publication gaps).
- Missing NAV is **never forward-filled**. A day without both a NAV and a
  price observation is simply excluded from the premium series.
- Invalid rows (NAV/price ≤ 0, bad dates, duplicates) are rejected.
  Unusually large day-over-day moves (>20% by default) are **flagged**,
  not deleted — international ETFs can legitimately move that much.
- Downloads are chunked (AMFI: ~90-day windows, NSE: ~365-day windows),
  retried with exponential backoff, and never partially commit — a failed
  chunk leaves the existing database untouched.
- Premium is stored at full precision; rounding happens only in the UI.

## Tests

```bash
pytest tests/ -v
```

Covers the premium formula, date-joining (including the "don't forward-fill,
don't join by row position" rules), percentile/statistics math, parsing, and
validation. All run offline against synthetic data — no network required.

## Known limitation in this build environment

The NAV and price downloaders (`src/sources/amfi.py`, `src/sources/nse.py`)
are written against mfapi.in and Yahoo Finance's real public endpoints, but
this sandbox's network allowlist doesn't include either domain, so live
downloads weren't exercised here — only offline, against synthetic
payloads shaped exactly like their real JSON responses. Everything
downstream of the raw response — parsing, validation, joining, the
database, the analytics, the dashboard — was tested end-to-end and works
correctly. If either API has changed its exact response shape since this
was written, only `amfi.py`/`nse.py` and their matching parsers need
adjusting — nothing else in the pipeline depends on their internals.

## Explicitly not in V1

No Docker, Kubernetes, Postgres, Redis, Kafka, Celery, Airflow,
microservices, auth, or cloud deployment. Python + SQLite + Pandas +
Requests + Streamlit + Plotly, run locally.

## V2 ideas (not built)

More ETFs via config, scheduled daily updates (cron/Task Scheduler),
threshold alerts, a REST API (could later live in Spring Boot), and deeper
analytics: mean reversion, premium volatility, correlation with US market
moves, tracking error, liquidity-adjusted premium.
