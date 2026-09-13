"""
All SQL lives here. Nothing else in the app writes raw SQL.
"""
import datetime as dt
import logging
import pandas as pd

from src.database.connection import get_connection

log = logging.getLogger(__name__)


def get_etf_id(conn, symbol: str) -> int:
    row = conn.execute("SELECT id FROM etfs WHERE symbol = ?", (symbol,)).fetchone()
    if row is None:
        raise KeyError(f"ETF {symbol} not found in etfs table. Run schema init first.")
    return row["id"]


def upsert_nav_rows(conn, etf_id: int, rows: list[dict], source: str) -> int:
    """rows: [{'date': 'YYYY-MM-DD', 'nav': float}, ...]. Returns count inserted/updated."""
    now = dt.datetime.utcnow().isoformat()
    n = 0
    for r in rows:
        conn.execute(
            """INSERT INTO nav_history (etf_id, date, nav, source, retrieved_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(etf_id, date) DO UPDATE SET
                 nav=excluded.nav, source=excluded.source, retrieved_at=excluded.retrieved_at""",
            (etf_id, r["date"], r["nav"], source, now),
        )
        n += 1
    return n


def upsert_price_rows(conn, etf_id: int, rows: list[dict], source: str) -> int:
    """rows: [{'date','open','high','low','close','volume','traded_value'}, ...]"""
    now = dt.datetime.utcnow().isoformat()
    n = 0
    for r in rows:
        conn.execute(
            """INSERT INTO price_history
                 (etf_id, date, open, high, low, close, volume, traded_value, source, retrieved_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(etf_id, date) DO UPDATE SET
                 open=excluded.open, high=excluded.high, low=excluded.low,
                 close=excluded.close, volume=excluded.volume,
                 traded_value=excluded.traded_value, source=excluded.source,
                 retrieved_at=excluded.retrieved_at""",
            (etf_id, r["date"], r.get("open"), r.get("high"), r.get("low"),
             r["close"], r.get("volume"), r.get("traded_value"), source, now),
        )
        n += 1
    return n


def insert_flag(conn, etf_id: int, date: str, flag_type: str, detail: str) -> None:
    conn.execute(
        "INSERT INTO data_flags (etf_id, date, flag_type, detail, created_at) VALUES (?, ?, ?, ?, ?)",
        (etf_id, date, flag_type, detail, dt.datetime.utcnow().isoformat()),
    )


def latest_nav_date(conn, etf_id: int) -> str | None:
    row = conn.execute(
        "SELECT MAX(date) AS d FROM nav_history WHERE etf_id = ?", (etf_id,)
    ).fetchone()
    return row["d"]


def latest_price_date(conn, etf_id: int) -> str | None:
    row = conn.execute(
        "SELECT MAX(date) AS d FROM price_history WHERE etf_id = ?", (etf_id,)
    ).fetchone()
    return row["d"]


def load_nav_df(conn, etf_id: int) -> pd.DataFrame:
    df = pd.read_sql_query(
        "SELECT date, nav FROM nav_history WHERE etf_id = ? ORDER BY date", conn, params=(etf_id,)
    )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
    return df


def load_price_df(conn, etf_id: int) -> pd.DataFrame:
    df = pd.read_sql_query(
        """SELECT date, open, high, low, close, volume, traded_value
           FROM price_history WHERE etf_id = ? ORDER BY date""",
        conn, params=(etf_id,)
    )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
    return df


def load_joined_df(db_path_conn, etf_id: int) -> pd.DataFrame:
    """Date-joined NAV + price. Inner join — only dates present in both."""
    nav = load_nav_df(db_path_conn, etf_id)
    price = load_price_df(db_path_conn, etf_id)
    if nav.empty or price.empty:
        return pd.DataFrame(columns=["date", "nav", "close", "open", "high", "low", "volume", "traded_value"])
    merged = pd.merge(price, nav, on="date", how="inner")
    return merged.sort_values("date").reset_index(drop=True)
