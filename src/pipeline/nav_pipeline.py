import datetime as dt
import logging

from src.sources.amfi import download_nav_history
from src.parsers.nav_parser import parse_and_dedupe
from src.pipeline.validation import validate_nav_rows, flag_suspicious_moves
from src.database.repository import upsert_nav_rows, insert_flag

log = logging.getLogger(__name__)


def run_nav_backfill(conn, etf_id: int, isin: str, start: dt.date, end: dt.date) -> dict:
    raw_chunks = download_nav_history(isin, start, end)
    parsed = parse_and_dedupe(raw_chunks, start=start, end=end)
    clean, rejected = validate_nav_rows(parsed)

    for reason in rejected:
        log.warning("NAV row rejected: %s", reason)

    flags = flag_suspicious_moves(clean, "nav")
    for f in flags:
        log.warning("Unusually large NAV movement on %s: %.2f%%", f["date"], f["change_pct"])
        insert_flag(conn, etf_id, f["date"], "suspicious_nav_move", str(f["change_pct"]))

    inserted = upsert_nav_rows(conn, etf_id, clean, source="AMFI")
    log.info("NAV backfill: %d rows inserted/updated, %d rejected, %d flagged",
              inserted, len(rejected), len(flags))
    return {"inserted": inserted, "rejected": len(rejected), "flagged": len(flags)}
