"""
Incremental daily update.

Usage:
    python -m src.pipeline.update
"""
import datetime as dt
import logging

from src.config.etfs import ETF_CONFIG, DB_PATH
from src.database.connection import get_connection
from src.database.repository import get_etf_id, latest_nav_date, latest_price_date
from src.database.schema import init_db
from src.pipeline.nav_pipeline import run_nav_backfill
from src.pipeline.price_pipeline import run_price_backfill
from src.analytics.premium import compute_premium_pct

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def update_one(symbol: str):
    cfg = ETF_CONFIG[symbol]
    today = dt.date.today()
    inception = dt.datetime.strptime(cfg["inception"], "%Y-%m-%d").date()

    with get_connection(DB_PATH) as conn:
        etf_id = get_etf_id(conn, symbol)

        existing_nav = latest_nav_date(conn, etf_id)
        existing_price = latest_price_date(conn, etf_id)

        nav_start = (dt.datetime.strptime(existing_nav, "%Y-%m-%d").date() + dt.timedelta(days=1)
                     if existing_nav else inception)
        price_start = (dt.datetime.strptime(existing_price, "%Y-%m-%d").date() + dt.timedelta(days=1)
                       if existing_price else inception)

        print(f"\n{symbol}")
        print("NAV:")
        print(f"  Existing through: {existing_nav or 'none'}")
        if nav_start <= today:
            try:
                result = run_nav_backfill(conn, etf_id, cfg["isin"], nav_start, today)
                print(f"  Added: {result['inserted']}")
            except RuntimeError as e:
                print(f"  FAILED: {e}")
        else:
            print("  Added: 0 (already current)")

        print("Price:")
        print(f"  Existing through: {existing_price or 'none'}")
        if price_start <= today:
            try:
                result = run_price_backfill(conn, etf_id, cfg["nse_symbol"], price_start, today)
                print(f"  Added: {result['inserted']}")
            except RuntimeError as e:
                print(f"  FAILED: {e}")
        else:
            print("  Added: 0 (already current)")

        latest = conn.execute(
            """SELECT p.date, p.close, n.nav FROM price_history p
               JOIN nav_history n ON n.etf_id = p.etf_id AND n.date = p.date
               WHERE p.etf_id = ? ORDER BY p.date DESC LIMIT 1""",
            (etf_id,),
        ).fetchone()
        if latest:
            premium = compute_premium_pct(latest["close"], latest["nav"])
            print("Premium:")
            print(f"  {latest['date']}")
            print(f"  Price: ₹{latest['close']:.2f}")
            print(f"  NAV: ₹{latest['nav']:.4f}")
            print(f"  Premium: {premium:.2f}%")


def main():
    init_db(DB_PATH)
    for symbol in ETF_CONFIG:
        update_one(symbol)


if __name__ == "__main__":
    main()
