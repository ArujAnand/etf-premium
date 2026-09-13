import datetime as dt
import logging

from src.sources.nse import download_price_history
from src.parsers.price_parser import parse_and_dedupe
from src.pipeline.validation import validate_price_rows, flag_suspicious_moves
from src.database.repository import upsert_price_rows, insert_flag

log = logging.getLogger(__name__)


def run_price_backfill(conn, etf_id: int, symbol: str, start: dt.date, end: dt.date) -> dict:
    raw_chunks = download_price_history(symbol, start, end)
    parsed = parse_and_dedupe(raw_chunks, start=start, end=end)
    clean, rejected = validate_price_rows(parsed)

    for reason in rejected:
        log.warning("Price row rejected: %s", reason)

    flags = flag_suspicious_moves(clean, "close")
    for f in flags:
        log.warning("Unusually large price movement on %s: %.2f%%", f["date"], f["change_pct"])
        insert_flag(conn, etf_id, f["date"], "suspicious_price_move", str(f["change_pct"]))

    inserted = upsert_price_rows(conn, etf_id, clean, source="NSE")
    log.info("Price backfill: %d rows inserted/updated, %d rejected, %d flagged",
              inserted, len(rejected), len(flags))
    return {"inserted": inserted, "rejected": len(rejected), "flagged": len(flags)}
