"""
Creates the SQLite schema. Run directly:

    python -m src.database.schema
"""
import sqlite3
from src.config.etfs import DB_PATH, ETF_CONFIG

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS etfs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    isin TEXT,
    inception_date TEXT NOT NULL,
    exchange TEXT NOT NULL DEFAULT 'NSE',
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS nav_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etf_id INTEGER NOT NULL REFERENCES etfs(id),
    date TEXT NOT NULL,
    nav REAL NOT NULL,
    source TEXT NOT NULL,
    retrieved_at TEXT NOT NULL,
    UNIQUE(etf_id, date)
);

CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etf_id INTEGER NOT NULL REFERENCES etfs(id),
    date TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    volume REAL,
    traded_value REAL,
    source TEXT NOT NULL,
    retrieved_at TEXT NOT NULL,
    UNIQUE(etf_id, date)
);

CREATE TABLE IF NOT EXISTS data_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etf_id INTEGER NOT NULL REFERENCES etfs(id),
    date TEXT NOT NULL,
    flag_type TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nav_etf_date ON nav_history(etf_id, date);
CREATE INDEX IF NOT EXISTS idx_price_etf_date ON price_history(etf_id, date);
"""


def init_db(db_path: str = DB_PATH) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA_SQL)
        for symbol, cfg in ETF_CONFIG.items():
            conn.execute(
                """INSERT OR IGNORE INTO etfs (symbol, name, isin, inception_date, exchange)
                   VALUES (?, ?, ?, ?, ?)""",
                (symbol, cfg["name"], cfg["isin"], cfg["inception"], cfg["exchange"]),
            )
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Schema ready at {DB_PATH}")
