/**
 * Daily market and valuation record for an ETF session.
 */
export interface ETFRecord {
  /** ISO-8601 calendar date of the trading session (YYYY-MM-DD). */
  date: string;
  /** NSE closing trade price in INR. */
  close: number;
  /** Official AMFI end-of-day Net Asset Value in INR. */
  nav: number;
  /** Day opening price in INR, or null if unrecorded. */
  open: number | null;
  /** Day intraday high in INR, or null if unrecorded. */
  high: number | null;
  /** Day intraday low in INR, or null if unrecorded. */
  low: number | null;
  /** Number of units traded on the exchange during the session. */
  volume: number;
  /** Total traded turnover value in INR. */
  traded_value: number;
  /**
   * Premium or discount percentage relative to official EOD NAV.
   * Formula: ((close / nav) - 1) * 100
   */
  premium_pct: number;
  /** 30-day rolling simple moving average of premium percentage. */
  premium_ma_30d?: number | null;
  /** 90-day rolling simple moving average of premium percentage. */
  premium_ma_90d?: number | null;
  /** 180-day rolling simple moving average of premium percentage. */
  premium_ma_180d?: number | null;
  /** 365-day rolling simple moving average of premium percentage. */
  premium_ma_365d?: number | null;
  [key: string]: any;
}

/**
 * Metadata and time-series history for an ETF instrument.
 */
export interface ETFMeta {
  symbol: string;
  name: string;
  isin: string;
  inception: string; // 'YYYY-MM-DD'
  exchange: string;
  history: ETFRecord[];
}

export const ROLLING_WINDOWS = [30, 90, 180, 365];
export const PREMIUM_THRESHOLDS = [0, 5, 10, 15, 20, 25, 30];

export const STAT_PERIODS: Record<string, number | null> = {
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
  "3Y": 365 * 3,
  "5Y": 365 * 5,
  "Since Inception": null,
};

/**
 * Formats an ISO-8601 date string ('YYYY-MM-DD') into standard UK long format (e.g. '11 Sep 2026').
 * Uses UTC timezone to prevent local clock skew from shifting the displayed date.
 */
export function formatExactDate(isoDateStr: string): string {
  if (!isoDateStr) return '';
  const [year, month, day] = isoDateStr.split('-').map(Number);
  if (!year || !month || !day) return isoDateStr;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

/**
 * Formats an ISO-8601 date string into compact short format (e.g. '11 Sep 26').
 */
export function formatShortDate(isoDateStr: string): string {
  if (!isoDateStr) return '';
  const [year, month, day] = isoDateStr.split('-').map(Number);
  if (!year || !month || !day) return isoDateStr;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC'
  });
}

/**
 * Computes trailing simple moving averages of premium_pct over specified windows.
 * Requires at least ceil(w / 3) valid observations to populate an MA; otherwise outputs null.
 *
 * @param records Time-series records.
 * @param windows Trailing window lengths in observation counts (default: [30, 90, 180, 365]).
 * @returns Cloned records enriched with premium_ma_{w}d fields.
 */
export function addRollingAverages(records: ETFRecord[], windows: number[] = ROLLING_WINDOWS): ETFRecord[] {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  
  return sorted.map((row, idx) => {
    const updated = { ...row };
    for (const w of windows) {
      const minPeriods = Math.max(1, Math.floor(w / 3));
      const windowSlice = sorted.slice(Math.max(0, idx - w + 1), idx + 1);
      if (windowSlice.length >= minPeriods) {
        const sum = windowSlice.reduce((acc, curr) => acc + curr.premium_pct, 0);
        updated[`premium_ma_${w}d`] = +(sum / windowSlice.length).toFixed(4);
      } else {
        updated[`premium_ma_${w}d`] = null;
      }
    }
    return updated;
  });
}

/**
 * Computes the empirical percentile rank of a value within a distribution.
 * Defined as (count of observations <= currentVal) / total observations * 100.
 *
 * @param currentVal Value to rank.
 * @param historicalVals Array of distribution values.
 * @returns Percentile rank between 0 and 100, or null if empty.
 */
export function percentileRank(currentVal: number, historicalVals: number[]): number | null {
  const clean = historicalVals.filter(v => typeof v === 'number' && !isNaN(v));
  if (clean.length === 0) return null;
  const count = clean.filter(v => v <= currentVal).length;
  return (count / clean.length) * 100;
}

/**
 * Computes value at arbitrary percentiles using linear interpolation.
 *
 * @param values Numerical values.
 * @param percentiles Array of target percentiles (0-100).
 * @returns Key-value map of percentile to interpolated value.
 */
export function valueAtPercentiles(values: number[], percentiles: number[] = [5, 25, 50, 75, 95]): Record<number, number | null> {
  const clean = values.filter(v => typeof v === 'number' && !isNaN(v)).sort((a, b) => a - b);
  const res: Record<number, number | null> = {};
  if (clean.length === 0) {
    for (const p of percentiles) res[p] = null;
    return res;
  }
  for (const p of percentiles) {
    const index = (p / 100) * (clean.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (lower === upper) {
      res[p] = clean[lower];
    } else {
      res[p] = clean[lower] * (1 - weight) + clean[upper] * weight;
    }
  }
  return res;
}

/**
 * Computes the percentage of historical sessions trading at a discount or exceeding given premium thresholds.
 *
 * @param values Numerical premium values.
 * @param thresholds Cutoff values (e.g. [0, 5, 10, 15, 20, 25, 30]).
 * @returns Map containing 'discount' frequency and frequency for each threshold string.
 */
export function thresholdFrequencies(values: number[], thresholds: number[] = PREMIUM_THRESHOLDS): Record<string, number | null> {
  const clean = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (clean.length === 0) {
    const empty: Record<string, number | null> = { discount: null };
    for (const t of thresholds) empty[String(t)] = null;
    return empty;
  }
  const discountCount = clean.filter(v => v < 0).length;
  const res: Record<string, number | null> = {
    discount: (discountCount / clean.length) * 100
  };
  for (const t of thresholds) {
    const count = clean.filter(v => v > t).length;
    res[String(t)] = (count / clean.length) * 100;
  }
  return res;
}

/**
 * Filters records within a trailing calendar day window relative to the latest available record date.
 */
function slicePeriod(records: ETFRecord[], days: number | null): ETFRecord[] {
  if (days === null || records.length === 0) return records;
  const latestDate = new Date(records[records.length - 1].date);
  const cutoffTime = latestDate.getTime() - days * 24 * 60 * 60 * 1000;
  return records.filter(r => new Date(r.date).getTime() > cutoffTime);
}

/**
 * Statistical metrics for a defined historical lookback period.
 */
export interface PeriodStat {
  label: string;
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  std: number | null;
  p5: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
  n: number | null;
}

/**
 * Computes summary statistics (mean, median, min, max, std, percentiles) across defined lookback windows.
 * Periods exceeding available fund history length return null fields.
 *
 * @param records Time-series records.
 * @param inceptionDateStr Fund inception date ('YYYY-MM-DD').
 * @returns Array of PeriodStat objects for 1M, 3M, 6M, 1Y, 3Y, 5Y, and Inception.
 */
export function computePeriodStatistics(records: ETFRecord[], inceptionDateStr: string): PeriodStat[] {
  if (records.length === 0) return [];
  const latestDate = new Date(records[records.length - 1].date);
  const inceptionDate = new Date(inceptionDateStr);
  const historySpanDays = Math.floor((latestDate.getTime() - inceptionDate.getTime()) / (1000 * 60 * 60 * 24));

  const results: PeriodStat[] = [];

  for (const [label, days] of Object.entries(STAT_PERIODS)) {
    if (days !== null && historySpanDays < days) {
      results.push({
        label,
        avg: null,
        median: null,
        min: null,
        max: null,
        std: null,
        p5: null,
        p25: null,
        p75: null,
        p95: null,
        n: null,
      });
      continue;
    }

    const sub = slicePeriod(records, days);
    const vals = sub.map(r => r.premium_pct).filter(v => typeof v === 'number' && !isNaN(v));

    if (vals.length === 0) {
      results.push({
        label,
        avg: null,
        median: null,
        min: null,
        max: null,
        std: null,
        p5: null,
        p25: null,
        p75: null,
        p95: null,
        n: null,
      });
      continue;
    }

    const sortedVals = [...vals].sort((a, b) => a - b);
    const sum = sortedVals.reduce((acc, v) => acc + v, 0);
    const avg = sum / sortedVals.length;

    let median = 0;
    const mid = Math.floor(sortedVals.length / 2);
    if (sortedVals.length % 2 === 0) {
      median = (sortedVals[mid - 1] + sortedVals[mid]) / 2;
    } else {
      median = sortedVals[mid];
    }

    let std = 0;
    if (sortedVals.length > 1) {
      const variance = sortedVals.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (sortedVals.length - 1);
      std = Math.sqrt(variance);
    }

    const pcts = valueAtPercentiles(sortedVals, [5, 25, 75, 95]);

    results.push({
      label,
      avg,
      median,
      min: sortedVals[0],
      max: sortedVals[sortedVals.length - 1],
      std,
      p5: pcts[5],
      p25: pcts[25],
      p75: pcts[75],
      p95: pcts[95],
      n: sortedVals.length,
    });
  }

  return results;
}

/**
 * Computes current premium percentile ranks against multiple historical lookback windows.
 *
 * @param records Time-series records.
 * @param currentPremium Latest premium percentage.
 * @returns Map of window labels ('Since Inception', '3Y', '1Y', '6M') to percentile rank.
 */
export function computeCurrentPercentileByPeriod(records: ETFRecord[], currentPremium: number): Record<string, number | null> {
  const lookbacks: Record<string, number | null> = {
    "Since Inception": null,
    "3Y": 365 * 3,
    "1Y": 365,
    "6M": 182,
  };

  const res: Record<string, number | null> = {};
  for (const [label, days] of Object.entries(lookbacks)) {
    const sub = slicePeriod(records, days);
    const vals = sub.map(r => r.premium_pct);
    res[label] = percentileRank(currentPremium, vals);
  }
  return res;
}
