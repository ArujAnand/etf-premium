# Indian ETF Premium/Discount Analyzer

An analytics platform for tracking and evaluating historical valuation premiums and discounts on Indian-listed international ETFs (Mirae Asset NYSE FANG+ ETF `MAFANG` and Mirae Asset S&P 500 Top 50 ETF `MASPTOP50`).

The application compares official Association of Mutual Funds in India (AMFI) End-of-Day (EOD) Net Asset Values (NAV) against National Stock Exchange (NSE) closing prices to measure liquidity markups, structural arbitrage freezes, and mean-reversion trends.

---

## Valuation Formula & Methodology

### 1. Premium Percentage
$$\text{Premium \%} = \left( \frac{\text{NSE Market Price}}{\text{Official EOD NAV}} - 1 \right) \times 100$$

- **Positive value ($> 0\%$)**: ETF trades at a premium to underlying portfolio asset value (domestic retail demand exceeds liquidity).
- **Negative value ($< 0\%$)**: ETF trades at a discount to underlying portfolio asset value.
- **Rule on Indicative NAV (iNAV)**: Historical metrics use official EOD NAV published by AMFI. Real-time intraday iNAV is subject to FX timing divergences and is not substituted for EOD regulatory records.

### 2. Date-Aligned Joining & Validation
- **Strict Date Indexing**: Market quotes and official NAVs are joined strictly on calendar date (`YYYY-MM-DD`).
- **No Forward-Filling**: Days missing either a valid closing price or an official NAV are excluded from statistical series.
- **Validation Thresholds**: Zero or negative prices/NAVs are rejected. Day-over-day changes exceeding $\pm 20\%$ are flagged for inspection.

### 3. Statistical Engines
- **Rolling Moving Averages**: 30-day, 90-day, 180-day, and 365-day moving averages of daily premium percentage.
- **Percentile Ranking**: Measures current premium against all historical sessions since fund inception and across rolling lookback windows (6M, 1Y, 3Y).
- **Threshold Distributions**: Frequency analysis across discrete premium bands ($<0\%$, $>5\%$, $>10\%$, $>15\%$, $>20\%$, $>25\%$, $>30\%$).

---

## Core Capabilities

1. **Interactive Valuation Visualizer**:
   - Time-series charts for closing price vs. NAV with dynamic date slicing (1M, 3M, 6M, 1Y, 3Y, 5Y, All).
   - Premium percentage trajectory with overlayable 30D, 90D, 180D, and 365D moving averages.
   - Crosshair tooltips displaying exact date, closing price, NAV, and computed premium.

2. **Automated Live Data Sync Pipeline**:
   - Direct background ingestion from AMFI via MFAPI (`api.mfapi.in`) and NSE market closes via Yahoo Finance.
   - In-app "Sync Live" control to fetch, align, compute, and render new sessions without restarting.

3. **AI Tactical Action Advisor**:
   - Evaluates current market price, NAV, current premium percentile, rolling averages, and user position parameters (holding status, average cost, time horizon).
   - Powered by server-side Gemini API (`@google/genai`) to generate structured recommendations: `ACCUMULATE`, `HOLD`, `TRIM_PROFIT`, or `WAIT_FOR_DIP`.

4. **Self-Correction & Recommendation Audit Ledger**:
   - Automatically logs recommendations with initial parameters into a persistent audit ledger.
   - Audits historical calls against subsequent 30-day, 60-day, and 90-day actual market returns and premium compression on NSE.
   - Classifies outcomes (`RIGHT` / `WRONG` / `PENDING`), diagnoses root causes for premature exits, and tracks algorithmic improvements applied to the engine.

---

## Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS v4, Recharts, Lucide Icons.
- **Backend / API**: Express 5 on Node.js with Vite middleware integration.
- **AI Integration**: `@google/genai` (server-side only via `process.env.GEMINI_API_KEY`).
- **Build Tooling**: Vite 6, esbuild, TypeScript compiler (`tsc`).

---

## Project Structure

```text
├── data/
│   └── recommendations_history.json # Persistent audit ledger of past advisor calls
├── src/
│   ├── components/
│   │   ├── AIAdvisor.tsx            # Tactical advisor UI and parameter form
│   │   └── RecommendationHistory.tsx # Audit ledger, scorecard, and post-mortems
│   ├── data/
│   │   └── etf_data.json            # Historical EOD daily prices and NAVs (from May 2021)
│   ├── utils/
│   │   └── calculations.ts          # Statistical functions (percentiles, MAs, periods)
│   ├── App.tsx                      # Primary layout, metrics cards, charts, and tables
│   ├── main.tsx                     # React application entry point
│   └── index.css                    # Tailwind CSS imports and base styles
├── server.ts                        # Express API server & Vite middleware bridge
├── metadata.json                    # App configuration and platform capabilities
├── package.json                     # Scripts and dependencies
└── tsconfig.json                    # TypeScript compiler configuration
```

---

## API Reference

### Health Check
- **Endpoint**: `GET /api/health`
- **Response**: `{ "status": "ok", "hasGeminiKey": boolean }`

### Live Data Synchronization
- **Endpoint**: `GET /api/sync-data`
- **Description**: Fetches latest daily closes and AMFI NAVs for configured ETFs, computes premiums, and returns synchronized records.
- **Configured Identifiers**:
  - `MAFANG`: AMFI Scheme `148927`, NSE Symbol `MAFANG.NS`
  - `MASPTOP50`: AMFI Scheme `149169`, NSE Symbol `MASPTOP50.NS`

### AI Strategic Advisor
- **Endpoint**: `POST /api/advisor`
- **Payload**: ETF identifiers, current price, NAV, premium, historical stats, and user position details (`status`, `averageCost`, `horizon`).
- **Response**: Structured recommendation with `action`, `actionTitle`, `rationale`, `entryExitRule`, `riskAssessment`, and `keyRisks`.

### Recommendation Audit Ledger
- **Endpoint**: `GET /api/recommendations`
- **Description**: Returns all logged recommendations with dynamic evaluation against subsequent market performance (win-rate, 60D price change, premium change, post-mortem root causes, and engine improvements).
- **Endpoint**: `POST /api/recommendations`
- **Description**: Appends a newly generated recommendation to the audit ledger.

---

## Development & Build

### Development Mode
Runs Express with `tsx` and hot Vite middleware on port 3000:
```bash
npm run dev
```

### Type Checking & Linting
```bash
npm run lint
```

### Production Build
Compiles client assets via Vite and bundles `server.ts` into a CommonJS production bundle (`dist/server.cjs`) with `esbuild`:
```bash
npm run build
```

### Production Start
```bash
npm start
```
Bound strictly to host `0.0.0.0` and port `3000`.

---

## Environment Configuration

Create a `.env` file in the root directory (see `.env.example`):
```env
GEMINI_API_KEY=your_gemini_api_key_here
```
When `GEMINI_API_KEY` is not present, the AI Advisor returns structured rule-based quantitative evaluations based on historical percentile distributions.
