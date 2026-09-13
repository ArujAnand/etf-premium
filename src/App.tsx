import React, { useState, useMemo } from 'react';
import rawData from './data/etf_data.json';
import {
  ETFRecord,
  ETFMeta,
  ROLLING_WINDOWS,
  PREMIUM_THRESHOLDS,
  formatExactDate,
  addRollingAverages,
  percentileRank,
  computePeriodStatistics,
  computeCurrentPercentileByPeriod,
  thresholdFrequencies
} from './utils/calculations';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  BarChart,
  Bar
} from 'recharts';
import {
  TrendingUp,
  Calendar,
  Download,
  Search,
  Layers,
  ArrowUpDown,
  Info,
  Sliders,
  ChevronRight,
  Filter,
  Sparkles,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { AIAdvisor } from './components/AIAdvisor';

const initialDataset = rawData as unknown as Record<string, ETFMeta>;
const availableSymbols = Object.keys(initialDataset);

/**
 * Root application component for the ETF Premium/Discount Analyzer.
 * Coordinates time-series visualization, statistical distributions,
 * interactive rolling moving average filters, live data synchronization,
 * and navigation across Single ETF, AI Advisor, and ETF Comparison modes.
 */
export default function App() {
  const [etfDataset, setEtfDataset] = useState<Record<string, ETFMeta>>(initialDataset);
  const [selectedSymbol, setSelectedSymbol] = useState<string>(availableSymbols[0] || 'MAFANG');
  const [viewMode, setViewMode] = useState<'single' | 'advisor' | 'comparison'>('single');
  const [timeRange, setTimeRange] = useState<string>('ALL');
  const [activeMAs, setActiveMAs] = useState<number[]>([30, 90]);
  const [searchDate, setSearchDate] = useState<string>('');
  const [tableSortAsc, setTableSortAsc] = useState<boolean>(false);
  const [tablePage, setTablePage] = useState<number>(1);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const rowsPerPage = 15;

  // Auto-sync or manual sync trigger
  const handleSyncData = async () => {
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      const res = await fetch('/api/sync-data');
      const data = await res.json();
      if (data.status === 'ok' && data.etfs) {
        setEtfDataset((prev) => {
          const updated = { ...prev };
          for (const sym of Object.keys(data.etfs)) {
            const etfInfo = data.etfs[sym];
            if (etfInfo?.records?.length && updated[sym]) {
              // Merge newly fetched recent records with existing historical data
              const existingMap = new Map(updated[sym].history.map(r => [r.date, r]));
              for (const nr of etfInfo.records) {
                existingMap.set(nr.date, { ...existingMap.get(nr.date), ...nr });
              }
              const mergedHistory = Array.from(existingMap.values()).sort((a, b) => a.date.localeCompare(b.date));
              updated[sym] = {
                ...updated[sym],
                history: mergedHistory,
              };
            }
          }
          return updated;
        });
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSyncTime(nowStr);
        setSyncNotice('Live data synced successfully from NSE & AMFI');
        setTimeout(() => setSyncNotice(null), 4000);
      }
    } catch (e: any) {
      console.error('Data sync failed:', e);
      setSyncNotice('Sync failed. Using verified offline dataset.');
      setTimeout(() => setSyncNotice(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  const currentEtf = etfDataset[selectedSymbol];

  // Process data with rolling averages
  const fullProcessedHistory = useMemo(() => {
    if (!currentEtf || !currentEtf.history) return [];
    return addRollingAverages(currentEtf.history, ROLLING_WINDOWS);
  }, [currentEtf]);

  // Filtered by selected time range
  const filteredHistory = useMemo(() => {
    if (fullProcessedHistory.length === 0) return [];
    if (timeRange === 'ALL') return fullProcessedHistory;
    
    const latestDate = new Date(fullProcessedHistory[fullProcessedHistory.length - 1].date);
    let daysToSubtract = 365;
    if (timeRange === '1M') daysToSubtract = 30;
    else if (timeRange === '3M') daysToSubtract = 91;
    else if (timeRange === '6M') daysToSubtract = 182;
    else if (timeRange === '1Y') daysToSubtract = 365;
    else if (timeRange === '3Y') daysToSubtract = 365 * 3;

    const cutoff = latestDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000;
    return fullProcessedHistory.filter(r => new Date(r.date).getTime() >= cutoff);
  }, [fullProcessedHistory, timeRange]);

  const latestRecord: ETFRecord | undefined = fullProcessedHistory[fullProcessedHistory.length - 1];

  // Percentile rank since inception
  const inceptionPercentile = useMemo(() => {
    if (!latestRecord || fullProcessedHistory.length === 0) return null;
    const premiums = fullProcessedHistory.map(r => r.premium_pct);
    return percentileRank(latestRecord.premium_pct, premiums);
  }, [latestRecord, fullProcessedHistory]);

  // Statistics
  const periodStats = useMemo(() => {
    if (!currentEtf || fullProcessedHistory.length === 0) return [];
    return computePeriodStatistics(fullProcessedHistory, currentEtf.inception);
  }, [currentEtf, fullProcessedHistory]);

  const lookbackPercentiles = useMemo(() => {
    if (!latestRecord || fullProcessedHistory.length === 0) return {};
    return computeCurrentPercentileByPeriod(fullProcessedHistory, latestRecord.premium_pct);
  }, [latestRecord, fullProcessedHistory]);

  const frequencies = useMemo(() => {
    if (fullProcessedHistory.length === 0) return { discount: 0 };
    const premiums = fullProcessedHistory.map(r => r.premium_pct);
    return thresholdFrequencies(premiums, PREMIUM_THRESHOLDS);
  }, [fullProcessedHistory]);

  // Histogram calculation
  const histogramData = useMemo(() => {
    if (fullProcessedHistory.length === 0) return [];
    const premiums = fullProcessedHistory.map(r => r.premium_pct).sort((a, b) => a - b);
    const minVal = Math.floor(premiums[0]);
    const maxVal = Math.ceil(premiums[premiums.length - 1]);
    const binSize = Math.max(0.5, (maxVal - minVal) / 30);
    
    const bins: Record<string, { binLabel: string; count: number; binStart: number }> = {};
    for (let i = minVal; i < maxVal; i += binSize) {
      const key = i.toFixed(1);
      bins[key] = {
        binLabel: `${i.toFixed(1)}%`,
        count: 0,
        binStart: i
      };
    }

    premiums.forEach(p => {
      for (let i = minVal; i < maxVal; i += binSize) {
        if (p >= i && p < i + binSize) {
          const key = i.toFixed(1);
          if (bins[key]) bins[key].count++;
          break;
        }
      }
    });

    return Object.values(bins);
  }, [fullProcessedHistory]);

  // Date lookup
  const [lookupDateInput, setLookupDateInput] = useState<string>(
    latestRecord ? latestRecord.date : ''
  );

  const matchedLookupRow = useMemo(() => {
    if (!lookupDateInput || fullProcessedHistory.length === 0) return null;
    return fullProcessedHistory.find(r => r.date === lookupDateInput) || null;
  }, [lookupDateInput, fullProcessedHistory]);

  // Historical table items
  const filteredTableRows = useMemo(() => {
    let rows = [...fullProcessedHistory];
    if (searchDate) {
      const term = searchDate.trim().toLowerCase();
      rows = rows.filter(r => 
        r.date.toLowerCase().includes(term) ||
        formatExactDate(r.date).toLowerCase().includes(term)
      );
    }
    rows.sort((a, b) => {
      return tableSortAsc 
        ? a.date.localeCompare(b.date)
        : b.date.localeCompare(a.date);
    });
    return rows;
  }, [fullProcessedHistory, searchDate, tableSortAsc]);

  const totalPages = Math.ceil(filteredTableRows.length / rowsPerPage);
  const displayedTableRows = useMemo(() => {
    const start = (tablePage - 1) * rowsPerPage;
    return filteredTableRows.slice(start, start + rowsPerPage);
  }, [filteredTableRows, tablePage, rowsPerPage]);

  // CSV download handler
  const handleDownloadCsv = () => {
    if (!fullProcessedHistory.length) return;
    const headers = ["Date", "Market Price", "NAV", "Premium %", "Difference", "Volume", "Traded Value"];
    const rows = fullProcessedHistory.map(r => [
      r.date,
      r.close.toFixed(2),
      r.nav.toFixed(4),
      r.premium_pct.toFixed(2),
      (r.close - r.nav).toFixed(4),
      r.volume,
      r.traded_value
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${selectedSymbol}_premium_history.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleMA = (windowSize: number) => {
    setActiveMAs(prev => 
      prev.includes(windowSize) 
        ? prev.filter(w => w !== windowSize)
        : [...prev, windowSize]
    );
  };

  // Color mappings
  const maColors: Record<number, string> = {
    30: '#ea580c',  // orange-600
    90: '#059669',  // emerald-600
    180: '#d97706', // amber-600
    365: '#4f46e5'  // indigo-600
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                ₹%
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Indian ETF Premium / Discount Analyzer
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Historical premium = NSE closing price vs official EOD NAV. Not iNAV. Not investment advice.
            </p>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium text-slate-600 border border-slate-200">
              <button
                id="btn-nav-single"
                onClick={() => setViewMode('single')}
                className={`px-3.5 py-1.5 rounded-md transition-colors ${
                  viewMode === 'single'
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                Single ETF
              </button>
              <button
                id="btn-nav-advisor"
                onClick={() => setViewMode('advisor')}
                className={`px-3.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  viewMode === 'advisor'
                    ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>AI Action Advisor</span>
              </button>
              <button
                id="btn-nav-comparison"
                onClick={() => setViewMode('comparison')}
                className={`px-3.5 py-1.5 rounded-md transition-colors ${
                  viewMode === 'comparison'
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                Comparison
              </button>
            </div>

            {(viewMode === 'single' || viewMode === 'advisor') && (
              <div className="flex items-center gap-2">
                <label htmlFor="etf-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  ETF:
                </label>
                <select
                  id="etf-select"
                  value={selectedSymbol}
                  onChange={(e) => {
                    setSelectedSymbol(e.target.value);
                    setTablePage(1);
                  }}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                >
                  {availableSymbols.map(sym => (
                    <option key={sym} value={sym}>
                      {sym} — {etfDataset[sym]?.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Live Data Sync Button */}
            <button
              id="btn-sync-live-data"
              onClick={handleSyncData}
              disabled={isSyncing}
              title="Sync latest prices from Yahoo Finance (NSE) and official NAVs from AMFI (mfapi.in)"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                isSyncing
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-wait'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200 shadow-2xs'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Live'}</span>
              {lastSyncTime && (
                <span className="text-[10px] text-emerald-600 font-mono hidden md:inline">
                  • {lastSyncTime}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Sync notification banner */}
        {syncNotice && (
          <div className="bg-emerald-50 border-t border-emerald-200 px-4 py-1.5 text-center text-xs font-medium text-emerald-800 flex items-center justify-center gap-1.5 transition-all">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{syncNotice}</span>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {viewMode === 'single' ? (
          <>
            {/* Top Metric Cards */}
            {latestRecord && (
              <section id="metric-summary-section" className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Market Price */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4.5 shadow-2xs">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Market Price</span>
                    <div className="mt-1 text-2xl font-bold text-slate-900">
                      ₹{latestRecord.close.toFixed(2)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                      <span>NSE Closing</span>
                    </div>
                  </div>

                  {/* NAV */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4.5 shadow-2xs">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">EOD NAV</span>
                    <div className="mt-1 text-2xl font-bold text-slate-900">
                      ₹{latestRecord.nav.toFixed(4)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 flex items-center gap-1">
                      <span>Official AMFI NAV</span>
                    </div>
                  </div>

                  {/* Premium */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4.5 shadow-2xs">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Premium / Discount</span>
                    <div className={`mt-1 text-2xl font-bold ${
                      latestRecord.premium_pct >= 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {latestRecord.premium_pct >= 0 ? '+' : ''}
                      {latestRecord.premium_pct.toFixed(2)}%
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {latestRecord.premium_pct >= 0 ? 'Trading at Premium' : 'Trading at Discount'}
                    </div>
                  </div>

                  {/* Percentile Rank */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4.5 shadow-2xs">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Percentile (Since Incep.)</span>
                    <div className="mt-1 text-2xl font-bold text-blue-600">
                      {inceptionPercentile !== null ? `${inceptionPercentile.toFixed(0)}th` : 'N/A'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Higher than {inceptionPercentile !== null ? `${inceptionPercentile.toFixed(0)}%` : '0%'} of past days
                    </div>
                  </div>
                </div>

                {/* Sub-banner: Exact Date & Metadata */}
                <div className="bg-blue-50/70 border border-blue-200/80 rounded-lg px-4 py-2.5 text-xs text-blue-900 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">
                      Difference: ₹{(latestRecord.close - latestRecord.nav).toFixed(4)}
                    </span>
                    <span className="text-blue-300">|</span>
                    {/* Explicitly showing full exact date */}
                    <span className="font-medium inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-blue-200">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <strong>Last Date:</strong> {formatExactDate(latestRecord.date)} ({latestRecord.date})
                    </span>
                  </div>
                  <div className="text-blue-700">
                    <span className="font-medium">{currentEtf.name}</span> · ISIN: <code className="bg-blue-100/80 px-1.5 py-0.5 rounded text-blue-950 font-mono text-[11px]">{currentEtf.isin}</code> · Inception: {formatExactDate(currentEtf.inception)}
                  </div>
                </div>

                {/* AI Action Advisor Quick CTA */}
                <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-100/60 border border-indigo-200/90 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-600 text-white rounded-lg shadow-xs shrink-0">
                      <Sparkles className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span>Position Strategy: What Action Should You Take for {selectedSymbol}?</span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 font-extrabold uppercase px-1.5 py-0.5 rounded">
                          AI Advisor
                        </span>
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Current premium is {latestRecord.premium_pct >= 0 ? '+' : ''}{latestRecord.premium_pct.toFixed(2)}% ({inceptionPercentile !== null ? `${inceptionPercentile.toFixed(0)}th` : ''} historical percentile). Evaluate whether to trim profits or wait for compression.
                      </p>
                    </div>
                  </div>
                  <button
                    id="btn-launch-advisor-cta"
                    onClick={() => setViewMode('advisor')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Get Action Suggestion</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </section>
            )}

            {/* Timeframe selector & Chart Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">
                  Range:
                </span>
                {(['1M', '3M', '6M', '1Y', '3Y', 'ALL'] as const).map((r) => (
                  <button
                    key={r}
                    id={`btn-range-${r}`}
                    onClick={() => setTimeRange(r)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      timeRange === r
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {/* Moving Averages Toggles */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5" /> Moving Averages:
                </span>
                {ROLLING_WINDOWS.map(w => {
                  const isActive = activeMAs.includes(w);
                  return (
                    <button
                      key={w}
                      id={`btn-toggle-ma-${w}`}
                      onClick={() => toggleMA(w)}
                      className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                        isActive
                          ? 'border-transparent text-white font-semibold'
                          : 'border-slate-300 text-slate-600 bg-white hover:bg-slate-50'
                      }`}
                      style={{
                        backgroundColor: isActive ? maColors[w] : undefined
                      }}
                    >
                      {w}D
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Premium / Discount to NAV Chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Premium / Discount to NAV (%)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Hover shows exact daily date, closing price, and NAV
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-[#3b82f6]"></span> Daily Premium
                  </span>
                  {activeMAs.map(w => (
                    <span key={w} className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5" style={{ backgroundColor: maColors[w] }}></span>
                      {w}D Avg
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <span className="w-3 h-0.5 border-b border-dashed border-slate-400"></span> 0% Parity
                  </span>
                </div>
              </div>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredHistory} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => formatExactDate(d)}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      minTickGap={45}
                    />
                    <YAxis
                      tickFormatter={(v) => `${v.toFixed(1)}%`}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload as ETFRecord;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs space-y-1">
                            <div className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-blue-600" />
                              Exact Date: {formatExactDate(data.date)} ({data.date})
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
                              <span className="text-slate-500">Market Price:</span>
                              <span className="font-semibold text-slate-800 text-right">₹{data.close.toFixed(2)}</span>
                              <span className="text-slate-500">Official NAV:</span>
                              <span className="font-semibold text-slate-800 text-right">₹{data.nav.toFixed(4)}</span>
                              <span className="text-slate-500">Premium / Disc:</span>
                              <span className={`font-bold text-right ${data.premium_pct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {data.premium_pct >= 0 ? '+' : ''}{data.premium_pct.toFixed(2)}%
                              </span>
                              {activeMAs.map(w => {
                                const maVal = data[`premium_ma_${w}d`];
                                if (maVal == null) return null;
                                return (
                                  <React.Fragment key={w}>
                                    <span style={{ color: maColors[w] }}>{w}D Moving Avg:</span>
                                    <span className="font-semibold text-right" style={{ color: maColors[w] }}>
                                      {maVal.toFixed(2)}%
                                    </span>
                                  </React.Fragment>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                    <Line
                      type="monotone"
                      dataKey="premium_pct"
                      name="Daily Premium"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    {activeMAs.map(w => (
                      <Line
                        key={w}
                        type="monotone"
                        dataKey={`premium_ma_${w}d`}
                        name={`${w}D Avg`}
                        stroke={maColors[w]}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Price vs NAV and Histogram side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Market Price vs NAV */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">
                    Market Price vs NAV (₹)
                  </h2>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-slate-800"></span> Price
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-emerald-600"></span> NAV
                    </span>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredHistory} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => formatExactDate(d)}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        minTickGap={40}
                      />
                      <YAxis
                        tickFormatter={(v) => `₹${v.toFixed(0)}`}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const data = payload[0].payload as ETFRecord;
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-lg text-xs space-y-1">
                              <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">
                                Exact Date: {formatExactDate(data.date)}
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-600">Market Price:</span>
                                <span className="font-semibold text-slate-900">₹{data.close.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-emerald-700">NAV:</span>
                                <span className="font-semibold text-emerald-700">₹{data.nav.toFixed(4)}</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="close"
                        name="Price"
                        stroke="#1e293b"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="nav"
                        name="NAV"
                        stroke="#059669"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Premium Histogram */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">
                    Premium Distribution
                  </h2>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-blue-400"></span> Frequency
                    </span>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={histogramData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="binLabel"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        interval={3}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#64748b' }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg p-2 text-xs shadow-md">
                              <span className="font-medium text-slate-700">Band around {d.binLabel}:</span>{' '}
                              <strong className="text-blue-700">{d.count} days</strong>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="count" fill="#93c5fd" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Period Statistics Table */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Period Statistics</h2>
                <p className="text-xs text-slate-500">Summary metrics across fixed rolling lookbacks</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Period</th>
                      <th className="py-2.5 px-3">Avg</th>
                      <th className="py-2.5 px-3">Median</th>
                      <th className="py-2.5 px-3">Min</th>
                      <th className="py-2.5 px-3">Max</th>
                      <th className="py-2.5 px-3">Std Dev</th>
                      <th className="py-2.5 px-3">5th Pct</th>
                      <th className="py-2.5 px-3">25th Pct</th>
                      <th className="py-2.5 px-3">75th Pct</th>
                      <th className="py-2.5 px-3">95th Pct</th>
                      <th className="py-2.5 px-3">N Obs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {periodStats.map(stat => (
                      <tr key={stat.label} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 font-semibold text-slate-900">{stat.label}</td>
                        <td className="py-2 px-3 font-mono">{stat.avg !== null ? `${stat.avg.toFixed(2)}%` : 'N/A'}</td>
                        <td className="py-2 px-3 font-mono">{stat.median !== null ? `${stat.median.toFixed(2)}%` : 'N/A'}</td>
                        <td className="py-2 px-3 font-mono">{stat.min !== null ? `${stat.min.toFixed(2)}%` : 'N/A'}</td>
                        <td className="py-2 px-3 font-mono">{stat.max !== null ? `${stat.max.toFixed(2)}%` : 'N/A'}</td>
                        <td className="py-2 px-3 font-mono">{stat.std !== null ? `${stat.std.toFixed(2)}%` : 'N/A'}</td>
                        <td className="py-2 px-3 font-mono text-slate-500">{stat.p5 !== null ? `${stat.p5.toFixed(2)}%` : 'N/A'}</td>
                        <td className="py-2 px-3 font-mono text-slate-500">{stat.p25 !== null ? `${stat.p25.toFixed(2)}%` : 'N/A'}</td>
                        <td className="py-2 px-3 font-mono text-slate-500">{stat.p75 !== null ? `${stat.p75.toFixed(2)}%` : 'N/A'}</td>
                        <td className="py-2 px-3 font-mono text-slate-500">{stat.p95 !== null ? `${stat.p95.toFixed(2)}%` : 'N/A'}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{stat.n !== null ? stat.n : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lookback Percentiles & Threshold Frequency in 2 cols */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Current Premium Percentile by Lookback */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
                <h2 className="text-base font-bold text-slate-900">
                  Current Premium Percentile by Lookback
                </h2>
                <p className="text-xs text-slate-500">
                  Relative rank of today's premium ({latestRecord?.premium_pct.toFixed(2)}%) across historic periods
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {Object.entries(lookbackPercentiles).map(([period, val]) => (
                    <div key={period} className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-center">
                      <div className="text-xs font-medium text-slate-500">{period}</div>
                      <div className="text-xl font-bold text-blue-600 mt-1">
                        {val !== null ? `${val.toFixed(0)}th` : 'N/A'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Threshold Frequencies */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
                <h2 className="text-base font-bold text-slate-900">
                  Threshold Frequency
                </h2>
                <p className="text-xs text-slate-500">
                  Percentage of historical trading days spent above premium thresholds
                </p>
                <div className="overflow-x-auto pt-1">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                      <tr>
                        <th className="py-2 px-3">Threshold</th>
                        <th className="py-2 px-3 text-right">% of Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-1.5 px-3 font-sans text-emerald-700 font-medium">At discount (&lt;0%)</td>
                        <td className="py-1.5 px-3 text-right font-bold text-emerald-700">
                          {frequencies.discount !== null ? `${frequencies.discount?.toFixed(1)}%` : 'N/A'}
                        </td>
                      </tr>
                      {PREMIUM_THRESHOLDS.map(t => (
                        <tr key={t} className="hover:bg-slate-50/50">
                          <td className="py-1.5 px-3 font-sans text-slate-700">&gt; {t}%</td>
                          <td className="py-1.5 px-3 text-right">
                            {frequencies[String(t)] !== null ? `${frequencies[String(t)]?.toFixed(1)}%` : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Date Lookup Tool */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Exact Date Lookup</h2>
              </div>
              <p className="text-xs text-slate-500">
                Choose any specific trading date to check the exact market price, NAV, and premium.
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-1">
                <input
                  id="input-date-lookup"
                  type="date"
                  value={lookupDateInput}
                  min={fullProcessedHistory[0]?.date}
                  max={fullProcessedHistory[fullProcessedHistory.length - 1]?.date}
                  onChange={(e) => setLookupDateInput(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />

                {matchedLookupRow ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs text-emerald-900 flex flex-wrap items-center gap-4">
                    <span>
                      <strong>Exact Date:</strong> {formatExactDate(matchedLookupRow.date)} ({matchedLookupRow.date})
                    </span>
                    <span>
                      <strong>Market Price:</strong> ₹{matchedLookupRow.close.toFixed(2)}
                    </span>
                    <span>
                      <strong>NAV:</strong> ₹{matchedLookupRow.nav.toFixed(4)}
                    </span>
                    <span>
                      <strong>Premium:</strong>{' '}
                      <span className={`font-bold ${matchedLookupRow.premium_pct >= 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {matchedLookupRow.premium_pct >= 0 ? '+' : ''}{matchedLookupRow.premium_pct.toFixed(2)}%
                      </span>
                    </span>
                    <span>
                      <strong>Volume:</strong> {matchedLookupRow.volume.toLocaleString('en-IN')}
                    </span>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-800">
                    No data for that exact date (non-trading weekend/holiday or outside backfilled range).
                  </div>
                )}
              </div>
            </div>

            {/* Historical Daily Data Table */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Historical Daily Data</h2>
                  <p className="text-xs text-slate-500">
                    Full day-by-day records with exact dates, closing prices, and official NAVs
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      id="input-table-search"
                      type="text"
                      placeholder="Search exact date (e.g. 2024-05)..."
                      value={searchDate}
                      onChange={(e) => {
                        setSearchDate(e.target.value);
                        setTablePage(1);
                      }}
                      className="bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
                    />
                  </div>
                  <button
                    id="btn-download-csv"
                    onClick={handleDownloadCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download CSV
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                    <tr>
                      <th
                        className="py-2.5 px-3.5 cursor-pointer hover:bg-slate-100 select-none"
                        onClick={() => setTableSortAsc(!tableSortAsc)}
                      >
                        <div className="flex items-center gap-1">
                          <span>Exact Date</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-2.5 px-3">Market Price (₹)</th>
                      <th className="py-2.5 px-3">NAV (₹)</th>
                      <th className="py-2.5 px-3">Premium (%)</th>
                      <th className="py-2.5 px-3">Difference (₹)</th>
                      <th className="py-2.5 px-3">Volume</th>
                      <th className="py-2.5 px-3">Traded Value (₹ Lakhs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {displayedTableRows.map((row) => (
                      <tr key={row.date} className="hover:bg-slate-50/75">
                        <td className="py-2 px-3.5 font-sans font-medium text-slate-900 flex items-center gap-1.5">
                          <span className="font-semibold text-blue-900">{formatExactDate(row.date)}</span>
                          <span className="text-[11px] text-slate-400 font-mono">({row.date})</span>
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-800">₹{row.close.toFixed(2)}</td>
                        <td className="py-2 px-3 text-slate-700">₹{row.nav.toFixed(4)}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                            row.premium_pct >= 0
                              ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          }`}>
                            {row.premium_pct >= 0 ? '+' : ''}{row.premium_pct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          ₹{(row.close - row.nav).toFixed(4)}
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-600">
                          {row.volume ? row.volume.toLocaleString('en-IN') : '0'}
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-600">
                          {row.traded_value ? (row.traded_value / 100000).toFixed(2) : '0.00'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span>
                  Showing {Math.min(filteredTableRows.length, (tablePage - 1) * rowsPerPage + 1)} - {Math.min(filteredTableRows.length, tablePage * rowsPerPage)} of {filteredTableRows.length} daily trading dates
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={tablePage <= 1}
                    onClick={() => setTablePage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span className="px-2 font-medium text-slate-700">
                    Page {tablePage} of {Math.max(1, totalPages)}
                  </span>
                  <button
                    disabled={tablePage >= totalPages}
                    onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            {/* Explanatory notes */}
            <div className="bg-slate-100/70 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-600" /> Data Sources & Methodology
              </div>
              <p>• <strong>NAV:</strong> AMFI historical NAV daily report (official end-of-day settlement NAV).</p>
              <p>• <strong>Market Price:</strong> NSE historical closing price (National Stock Exchange of India).</p>
              <p>• <strong>Formula:</strong> Premium % is computed as <code>((Price / NAV) - 1) * 100</code>. Positive values reflect a market price premium above asset value; negative values represent a discount.</p>
            </div>
          </>
        ) : viewMode === 'advisor' ? (
          latestRecord ? (
            <AIAdvisor
              currentEtf={currentEtf}
              symbol={selectedSymbol}
              latestRecord={latestRecord}
              fullHistory={fullProcessedHistory}
              inceptionPercentile={inceptionPercentile}
              periodStats={periodStats}
            />
          ) : (
            <div className="bg-white rounded-xl p-8 text-center text-slate-500">
              No historical data available to analyze.
            </div>
          )
        ) : (
          /* Multi-ETF Comparison View */
          <section id="comparison-view-section" className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">ETF Comparison Overview</h2>
                <p className="text-xs text-slate-500">
                  Side-by-side comparison of historical premium indicators across tracked ETFs
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                    <tr>
                      <th className="py-3 px-3">ETF Symbol</th>
                      <th className="py-3 px-3">Full Name</th>
                      <th className="py-3 px-3">Latest Date</th>
                      <th className="py-3 px-3">Current Premium</th>
                      <th className="py-3 px-3">1Y Avg</th>
                      <th className="py-3 px-3">3Y Avg</th>
                      <th className="py-3 px-3">Median</th>
                      <th className="py-3 px-3">Current Pctile</th>
                      <th className="py-3 px-3">&gt;20% Freq</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {availableSymbols.map(sym => {
                      const meta = etfDataset[sym];
                      const hist = meta?.history || [];
                      const latest = hist[hist.length - 1];
                      if (!latest) return null;

                      const stats = computePeriodStatistics(hist, meta.inception);
                      const stats1Y = stats.find(s => s.label === '1Y');
                      const stats3Y = stats.find(s => s.label === '3Y');
                      const statsIncep = stats.find(s => s.label === 'Since Inception');
                      const pct = percentileRank(latest.premium_pct, hist.map(r => r.premium_pct));
                      const freqs = thresholdFrequencies(hist.map(r => r.premium_pct), [20]);

                      return (
                        <tr key={sym} className="hover:bg-slate-50/75">
                          <td className="py-3 px-3 font-sans font-bold text-blue-700">{sym}</td>
                          <td className="py-3 px-3 font-sans text-slate-700">{meta.name}</td>
                          <td className="py-3 px-3 font-sans font-medium text-slate-900">
                            {formatExactDate(latest.date)}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              latest.premium_pct >= 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {latest.premium_pct >= 0 ? '+' : ''}{latest.premium_pct.toFixed(2)}%
                            </span>
                          </td>
                          <td className="py-3 px-3">{stats1Y?.avg !== null ? `${stats1Y?.avg?.toFixed(2)}%` : 'N/A'}</td>
                          <td className="py-3 px-3">{stats3Y?.avg !== null ? `${stats3Y?.avg?.toFixed(2)}%` : 'N/A'}</td>
                          <td className="py-3 px-3">{statsIncep?.median !== null ? `${statsIncep?.median?.toFixed(2)}%` : 'N/A'}</td>
                          <td className="py-3 px-3 font-bold text-blue-600">{pct !== null ? `${pct.toFixed(0)}th` : 'N/A'}</td>
                          <td className="py-3 px-3">{freqs['20'] !== null ? `${freqs['20']?.toFixed(1)}%` : 'N/A'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Combined Timeline Chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Premium History — Multi-ETF Comparison
                  </h2>
                  <p className="text-xs text-slate-500">
                    Historical premium curves compared across exact calendar dates
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium">
                  <span className="inline-flex items-center gap-1.5 text-blue-600">
                    <span className="w-3 h-1 bg-blue-600 rounded"></span> MAFANG
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-600">
                    <span className="w-3 h-1 bg-emerald-600 rounded"></span> MASPTOP50
                  </span>
                </div>
              </div>

              <div className="h-96 w-full">
                {/* Build merged dataset for comparison chart */}
                {(() => {
                  const mafangHist = etfDataset['MAFANG']?.history || [];
                  const masptopHist = etfDataset['MASPTOP50']?.history || [];
                  const dateMap: Record<string, { date: string; MAFANG?: number; MASPTOP50?: number }> = {};

                  mafangHist.forEach(r => {
                    if (!dateMap[r.date]) dateMap[r.date] = { date: r.date };
                    dateMap[r.date].MAFANG = r.premium_pct;
                  });

                  masptopHist.forEach(r => {
                    if (!dateMap[r.date]) dateMap[r.date] = { date: r.date };
                    dateMap[r.date].MASPTOP50 = r.premium_pct;
                  });

                  const mergedChartData = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));

                  return (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mergedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(d) => formatExactDate(d)}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          minTickGap={45}
                        />
                        <YAxis
                          tickFormatter={(v) => `${v.toFixed(0)}%`}
                          tick={{ fontSize: 11, fill: '#64748b' }}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs space-y-1">
                                <div className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                  Exact Date: {formatExactDate(d.date)} ({d.date})
                                </div>
                                <div className="space-y-1 pt-1">
                                  {d.MAFANG !== undefined && (
                                    <div className="flex justify-between gap-4">
                                      <span className="font-medium text-blue-600">MAFANG:</span>
                                      <span className="font-mono font-bold text-slate-900">{d.MAFANG.toFixed(2)}%</span>
                                    </div>
                                  )}
                                  {d.MASPTOP50 !== undefined && (
                                    <div className="flex justify-between gap-4">
                                      <span className="font-medium text-emerald-600">MASPTOP50:</span>
                                      <span className="font-mono font-bold text-slate-900">{d.MASPTOP50.toFixed(2)}%</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                        <Line
                          type="monotone"
                          dataKey="MAFANG"
                          name="MAFANG"
                          stroke="#2563eb"
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="MASPTOP50"
                          name="MASPTOP50"
                          stroke="#059669"
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
