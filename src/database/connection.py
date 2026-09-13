import sqlite3
from contextlib import contextmanager
from src.config.etfs import DB_PATH


@contextmanager
def get_connection(db_path: str = DB_PATH):
    """
    Yields a sqlite3 connection with a transaction. Commits on success,
    rolls back on any exception so the DB is never left half-written.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
