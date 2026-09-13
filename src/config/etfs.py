"""
Central ETF configuration.

Add a new ETF here only. No other file should hard-code an ETF symbol.
"""

ETF_CONFIG = {
    "MAFANG": {
        "name": "Mirae Asset NYSE FANG+ ETF",
        "nse_symbol": "MAFANG",
        "isin": "INF769K01HF4",
        "inception": "2021-05-06",
        "exchange": "NSE",
    },
    "MASPTOP50": {
        "name": "Mirae Asset S&P 500 Top 50 ETF",
        "nse_symbol": "MASPTOP50",
        "isin": "INF769K01HP3",
        "inception": "2021-09-20",
        "exchange": "NSE",
    },
}

DB_PATH = "etf_premium.db"
TIMEZONE = "Asia/Kolkata"

# Flag thresholds — suspicious daily move, not rejected, only flagged.
SUSPICIOUS_DAILY_CHANGE_PCT = 20.0

# Premium threshold bands used in section 15 (threshold analysis).
PREMIUM_THRESHOLDS = [0, 5, 10, 15, 20, 25, 30]

# Rolling windows (calendar days used for lookback, min_periods relaxed).
ROLLING_WINDOWS = [30, 90, 180, 365]

# Historical statistics periods -> approx calendar days (None = since inception)
STAT_PERIODS = {
    "1M": 30,
    "3M": 91,
    "6M": 182,
    "1Y": 365,
    "3Y": 365 * 3,
    "5Y": 365 * 5,
    "Since Inception": None,
}


def get_etf(symbol: str) -> dict:
    symbol = symbol.upper()
    if symbol not in ETF_CONFIG:
        raise KeyError(f"Unknown ETF symbol: {symbol}. Add it to ETF_CONFIG first.")
    return ETF_CONFIG[symbol]


def all_symbols():
    return list(ETF_CONFIG.keys())
