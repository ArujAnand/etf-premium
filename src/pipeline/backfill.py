"""
Historical backfill CLI.

Usage:
    python -m src.pipeline.backfill --etf MAFANG
    python -m src.pipeline.backfill --all
    python -m src.pipeline.backfill --etf MAFANG --start 2022-01-01 --end 2022-06-01
    python -m src.pipeline.backfill --etf MAFANG --force
"""
import argparse
import datetime as dt
import logging

from src.config.etfs import ETF_CONFIG, all_symbols, DB_PATH
from src.database.connection import get_connection
from src.database.repository import get_etf_id, latest_nav_date, latest_price_date
from src.database.schema import init_db
from src.pipeline.nav_pipeline import run_nav_backfill
from src.pipeline.price_pipeline import run_price_backfill

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def backfill_one(symbol: str, start: dt.date | None, end: dt.date | None, force: bool):
    cfg = ETF_CONFIG[symbol]
    inception = dt.datetime.strptime(cfg["inception"], "%Y-%m-%d").date()
    today = dt.date.today()

    req_start = start or inception
    req_end = end or today

    with get_connection(DB_PATH) as conn:
        etf_id = get_etf_id(conn, symbol)

        if not force:
            existing_nav = latest_nav_date(conn, etf_id)
            existing_price = latest_price_date(conn, etf_id)
            if existing_nav and not start:
                req_start_nav = max(req_start, dt.datetime.strptime(existing_nav, "%Y-%m-%d").date() + dt.timedelta(days=1))
            else:
                req_start_nav = req_start
            if existing_price and not start:
                req_start_price = max(req_start, dt.datetime.strptime(existing_price, "%Y-%m-%d").date() + dt.timedelta(days=1))
            else:
                req_start_price = req_start
        else:
            req_start_nav = req_start_price = req_start

        print(f"\n{symbol}")
        if req_start_nav > req_end:
            print("  NAV: already up to date")
        else:
            print(f"  NAV: downloading {req_start_nav} -> {req_end}")
            try:
                result = run_nav_backfill(conn, etf_id, cfg["isin"], req_start_nav, req_end)
                print(f"  NAV: inserted {result['inserted']}, rejected {result['rejected']}, flagged {result['flagged']}")
            except RuntimeError as e:
                print(f"  NAV: FAILED — {e}")

        if req_start_price > req_end:
            print("  Price: already up to date")
        else:
            print(f"  Price: downloading {req_start_price} -> {req_end}")
            try:
                result = run_price_backfill(conn, etf_id, cfg["nse_symbol"], req_start_price, req_end)
                print(f"  Price: inserted {result['inserted']}, rejected {result['rejected']}, flagged {result['flagged']}")
            except RuntimeError as e:
                print(f"  Price: FAILED — {e}")


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--etf", type=str, help="ETF symbol, e.g. MAFANG")
    group.add_argument("--all", action="store_true", help="Backfill all configured ETFs")
    parser.add_argument("--start", type=str, help="YYYY-MM-DD, overrides inception default")
    parser.add_argument("--end", type=str, help="YYYY-MM-DD, defaults to today")
    parser.add_argument("--force", action="store_true", help="Redownload even if data exists")
    args = parser.parse_args()

    init_db(DB_PATH)

    start = dt.datetime.strptime(args.start, "%Y-%m-%d").date() if args.start else None
    end = dt.datetime.strptime(args.end, "%Y-%m-%d").date() if args.end else None

    symbols = all_symbols() if args.all else [args.etf.upper()]
    for symbol in symbols:
        if symbol not in ETF_CONFIG:
            print(f"Unknown symbol {symbol}, skipping. Configured: {all_symbols()}")
            continue
        backfill_one(symbol, start, end, args.force)


if __name__ == "__main__":
    main()
