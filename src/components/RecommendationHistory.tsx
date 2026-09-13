import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRight,
  Filter,
  SlidersHorizontal,
  Target
} from 'lucide-react';
import { formatExactDate } from '../utils/calculations';

/**
 * Recommendation record audited with actual forward market returns on NSE.
 */
export interface EvaluatedRecommendation {
  id: string;
  symbol: string;
  name: string;
  date: string;
  priceAtRec: number;
  navAtRec: number;
  premiumAtRec: number;
  percentileRank?: number | null;
  action: string;
  actionTitle: string;
  holdingStatus: string;
  horizon: string;
  source: string;
  notes?: string;
  /** Audit classification: RIGHT (favorable), WRONG (premature), or PENDING (insufficient horizon). */
  outcomeStatus: 'RIGHT' | 'WRONG' | 'PENDING';
  outcomeCategory: string;
  daysElapsed: number;
  metrics?: {
    priceChange30d?: number;
    priceChange60d?: number;
    priceChange90d?: number;
    priceChangeCurrent?: number;
    premiumChange30d?: number;
    premiumChange60d?: number;
    premiumChange90d?: number;
    navChange60d?: number;
    curPrice?: number;
    curNav?: number;
    priceAt60d?: number;
    navAt60d?: number;
    premiumAt60d?: number;
    latestPrice?: number;
    latestNav?: number;
    latestPremium?: number;
  };
  summaryResult: string;
  whyExplanation: string;
  engineImprovement: string;
}

/**
 * Aggregated audit statistics and systemic improvement feedback rules.
 */
export interface RecommendationSummary {
  total: number;
  evaluated: number;
  rightCount: number;
  wrongCount: number;
  pendingCount: number;
  accuracyRate: number;
  systemicImprovements: Array<{
    id: string;
    title: string;
    trigger: string;
    actionTaken: string;
    status: string;
  }>;
}

interface RecommendationHistoryProps {
  currentSymbol?: string;
}

/**
 * Component rendering the historical audit ledger, accuracy scorecard,
 * diagnosis post-mortems, and active feedback improvements for the advisor.
 */
export const RecommendationHistory: React.FC<RecommendationHistoryProps> = ({ currentSymbol }) => {
  const [recommendations, setRecommendations] = useState<EvaluatedRecommendation[]>([]);
  const [summary, setSummary] = useState<RecommendationSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbolFilter, setSelectedSymbolFilter] = useState<string>(currentSymbol || 'ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recommendations');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.status === 'ok') {
        setRecommendations(data.recommendations || []);
        setSummary(data.summary || null);
        // Expand the first recommendation by default
        if (data.recommendations?.length && !expandedId) {
          setExpandedId(data.recommendations[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch recommendation history:', err);
      setError(err.message || 'Unable to load recommendation history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Filter recommendations
  const filtered = recommendations.filter((r) => {
    if (selectedSymbolFilter !== 'ALL' && r.symbol !== selectedSymbolFilter) return false;
    if (selectedStatusFilter !== 'ALL' && r.outcomeStatus !== selectedStatusFilter) return false;
    return true;
  });

  const getStatusBadge = (status: 'RIGHT' | 'WRONG' | 'PENDING', category?: string) => {
    switch (status) {
      case 'RIGHT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{category === 'CAPITAL_PRESERVED' ? 'RIGHT: Capital Preserved' : category === 'OPTIMAL_ENTRY' ? 'RIGHT: Optimal Entry' : 'RIGHT: Accurate Call'}</span>
          </span>
        );
      case 'WRONG':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>{category === 'PREMATURE_TRIM' ? 'WRONG: Premature Exit' : 'WRONG: Misjudged'}</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            <span>PENDING: Active Horizon</span>
          </span>
        );
    }
  };

  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('TRIM') || act.includes('SELL')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
          {action}
        </span>
      );
    }
    if (act.includes('ACCUMULATE') || act.includes('BUY')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
          {action}
        </span>
      );
    }
    if (act.includes('WAIT')) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
          {action}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-slate-900">
                Advisor Recommendation Track Record & Self-Correction Engine
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 max-w-3xl leading-relaxed">
              Every past strategic advice issued by the advisor is logged and continuously audited against subsequent 30D, 60D, and 90D actual market outcomes on the NSE. The engine analyzes where it was right, diagnoses root causes for premature or incorrect calls, and programmatically adjusts its algorithmic parameters.
            </p>
          </div>
          <button
            id="btn-refresh-history"
            onClick={fetchHistory}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh Audit</span>
          </button>
        </div>

        {/* Scorecard Metrics Bar */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-5 border-t border-slate-100">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Accuracy Rate
              </div>
              <div className="text-2xl font-black text-emerald-700 mt-0.5">
                {summary.accuracyRate}%
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                On evaluated calls
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Total Calls Logged
              </div>
              <div className="text-2xl font-black text-slate-900 mt-0.5">
                {summary.total}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {summary.evaluated} completed · {summary.pendingCount} pending
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 text-center">
              <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                Correct Calls (Right)
              </div>
              <div className="text-2xl font-black text-emerald-700 mt-0.5">
                {summary.rightCount}
              </div>
              <div className="text-[10px] text-emerald-700 mt-0.5">
                Alpha preserved / optimal entry
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-lg p-3 text-center">
              <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider">
                Premature / Misjudged (Wrong)
              </div>
              <div className="text-2xl font-black text-rose-700 mt-0.5">
                {summary.wrongCount}
              </div>
              <div className="text-[10px] text-rose-700 mt-0.5">
                Used to refine engine rules
              </div>
            </div>

            <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-3 text-center">
              <div className="text-[11px] font-semibold text-indigo-800 uppercase tracking-wider">
                Active Horizon
              </div>
              <div className="text-2xl font-black text-indigo-700 mt-0.5">
                {summary.pendingCount}
              </div>
              <div className="text-[10px] text-indigo-700 mt-0.5">
                Awaiting 30D–60D maturation
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Algorithmic Engine Improvements Derived from Retrospectives */}
      {summary?.systemicImprovements && summary.systemicImprovements.length > 0 && (
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-300">
              Continuous Engine Improvement: What the Advisor Has Learned from Past Outcomes
            </h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            Rather than relying on static formulas, the advisor feeds post-mortems of both successful calls and errors back into its execution logic:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {summary.systemicImprovements.map((imp) => (
              <div key={imp.id} className="bg-white/10 backdrop-blur-xs border border-white/10 rounded-lg p-3.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>{imp.title}</span>
                  </h4>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-500/30 shrink-0">
                    {imp.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300">
                  <span className="text-amber-300/90 font-semibold">Diagnosis Trigger: </span>
                  {imp.trigger}
                </div>
                <div className="text-[11px] text-slate-200">
                  <span className="text-emerald-400 font-semibold">Engine Rule Implemented: </span>
                  {imp.actionTaken}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter ETF:</span>
          </span>
          {['ALL', 'MAFANG', 'MASPTOP50'].map((sym) => (
            <button
              key={sym}
              onClick={() => setSelectedSymbolFilter(sym)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                selectedSymbolFilter === sym
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
              }`}
            >
              {sym === 'ALL' ? 'All ETFs' : sym}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Outcome:</span>
          {[
            { key: 'ALL', label: 'All Results' },
            { key: 'RIGHT', label: `Right (${summary?.rightCount || 0})` },
            { key: 'WRONG', label: `Wrong / Premature (${summary?.wrongCount || 0})` },
            { key: 'PENDING', label: `Pending (${summary?.pendingCount || 0})` },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setSelectedStatusFilter(item.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                selectedStatusFilter === item.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendations Ledger */}
      <div className="space-y-3">
        {loading && recommendations.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
            <span>Auditing historical recommendation performance against actual NSE closing prices...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-slate-500 border border-slate-200">
            No recommendations match the selected filters.
          </div>
        ) : (
          filtered.map((rec) => {
            const isExpanded = expandedId === rec.id;
            const isRight = rec.outcomeStatus === 'RIGHT';
            const isWrong = rec.outcomeStatus === 'WRONG';
            const isPending = rec.outcomeStatus === 'PENDING';

            return (
              <div
                key={rec.id}
                className={`bg-white rounded-xl border transition-all overflow-hidden shadow-2xs ${
                  isRight
                    ? 'border-emerald-200/90'
                    : isWrong
                    ? 'border-rose-200/90'
                    : 'border-indigo-200/90'
                }`}
              >
                {/* Collapsed / Header Summary View */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                  className="p-4 cursor-pointer hover:bg-slate-50/80 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {rec.symbol}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        {formatExactDate(rec.date)}
                      </span>
                      {getActionBadge(rec.action)}
                      {getStatusBadge(rec.outcomeStatus, rec.outcomeCategory)}
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {rec.actionTitle}
                    </div>
                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
                      <span>Price at Call: <strong>₹{rec.priceAtRec.toFixed(2)}</strong></span>
                      <span>NAV: <strong>₹{rec.navAtRec.toFixed(2)}</strong></span>
                      <span className="font-semibold text-indigo-700">
                        Premium: <strong>{rec.premiumAtRec >= 0 ? '+' : ''}{rec.premiumAtRec.toFixed(2)}%</strong>
                        {rec.percentileRank !== null && rec.percentileRank !== undefined && (
                          <span className="ml-1 text-[11px] text-slate-500 font-normal">({rec.percentileRank}th %ile)</span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-800">
                        {rec.summaryResult}
                      </div>
                      {rec.metrics?.priceChange60d !== undefined && (
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-end gap-1.5">
                          <span>60D Return:</span>
                          <span className={`font-mono font-bold ${rec.metrics.priceChange60d >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {rec.metrics.priceChange60d >= 0 ? '+' : ''}{rec.metrics.priceChange60d.toFixed(1)}%
                          </span>
                          <span>· Prem Δ:</span>
                          <span className="font-mono font-bold text-slate-700">
                            {rec.metrics.premiumChange60d && rec.metrics.premiumChange60d >= 0 ? '+' : ''}
                            {rec.metrics.premiumChange60d?.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-1 text-slate-400 hover:text-slate-600">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Detailed Post-Mortem & Diagnostic View */}
                {isExpanded && (
                  <div className="px-4 pb-5 pt-3 border-t border-slate-100 bg-slate-50/50 space-y-4">
                    {/* Performance Metrics Breakdown Bar */}
                    {rec.metrics && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                          <div className="text-[10px] text-slate-500 uppercase font-semibold">30-Day Change</div>
                          <div className={`text-sm font-bold font-mono mt-0.5 ${rec.metrics.priceChange30d && rec.metrics.priceChange30d >= 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {rec.metrics.priceChange30d !== undefined ? `${rec.metrics.priceChange30d >= 0 ? '+' : ''}${rec.metrics.priceChange30d.toFixed(1)}% price` : 'N/A'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {rec.metrics.premiumChange30d !== undefined ? `${rec.metrics.premiumChange30d >= 0 ? '+' : ''}${rec.metrics.premiumChange30d.toFixed(1)}% prem Δ` : ''}
                          </div>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                          <div className="text-[10px] text-slate-500 uppercase font-semibold">60-Day Change</div>
                          <div className={`text-sm font-bold font-mono mt-0.5 ${rec.metrics.priceChange60d && rec.metrics.priceChange60d >= 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {rec.metrics.priceChange60d !== undefined ? `${rec.metrics.priceChange60d >= 0 ? '+' : ''}${rec.metrics.priceChange60d.toFixed(1)}% price` : 'N/A'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {rec.metrics.premiumChange60d !== undefined ? `${rec.metrics.premiumChange60d >= 0 ? '+' : ''}${rec.metrics.premiumChange60d.toFixed(1)}% prem Δ` : ''}
                          </div>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                          <div className="text-[10px] text-slate-500 uppercase font-semibold">90-Day Change</div>
                          <div className={`text-sm font-bold font-mono mt-0.5 ${rec.metrics.priceChange90d && rec.metrics.priceChange90d >= 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {rec.metrics.priceChange90d !== undefined ? `${rec.metrics.priceChange90d >= 0 ? '+' : ''}${rec.metrics.priceChange90d.toFixed(1)}% price` : 'N/A'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {rec.metrics.premiumChange90d !== undefined ? `${rec.metrics.premiumChange90d >= 0 ? '+' : ''}${rec.metrics.premiumChange90d.toFixed(1)}% prem Δ` : ''}
                          </div>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                          <div className="text-[10px] text-slate-500 uppercase font-semibold">Latest Market Value</div>
                          <div className="text-sm font-bold font-mono mt-0.5 text-slate-900">
                            ₹{rec.metrics.latestPrice ? rec.metrics.latestPrice.toFixed(2) : rec.metrics.priceAt60d ? rec.metrics.priceAt60d.toFixed(2) : rec.priceAtRec.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            NAV: ₹{rec.metrics.latestNav ? rec.metrics.latestNav.toFixed(2) : rec.metrics.navAt60d ? rec.metrics.navAt60d.toFixed(2) : rec.navAtRec.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Diagnostic Root Cause ("Why the advisor was Right or Wrong") */}
                    <div className={`p-4 rounded-xl border ${isRight ? 'bg-emerald-50/60 border-emerald-200' : isWrong ? 'bg-rose-50/60 border-rose-200' : 'bg-indigo-50/60 border-indigo-200'}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`font-bold text-xs uppercase tracking-wider ${isRight ? 'text-emerald-900' : isWrong ? 'text-rose-900' : 'text-indigo-900'}`}>
                          {isRight ? 'Post-Mortem: Why This Recommendation Was Right' : isWrong ? 'Post-Mortem: Why This Recommendation Was Premature/Wrong' : 'Active Horizon Tracking'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {rec.whyExplanation}
                      </p>
                    </div>

                    {/* Engine Feedback & Tuning ("How the engine is improved") */}
                    <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-2xs space-y-1">
                      <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Self-Improvement Rule Derived & Implemented in Engine:</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {rec.engineImprovement}
                      </p>
                    </div>

                    {/* Additional Context */}
                    {rec.notes && (
                      <div className="text-[11px] text-slate-500 italic bg-white/60 px-3 py-1.5 rounded border border-slate-200">
                        Context at issuance: {rec.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
